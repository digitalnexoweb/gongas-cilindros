/**
 * Todo lo que la app le pide a la base, en un solo archivo.
 *
 * Es el reemplazo de lo que antes hacía `localStorage`: cargar la foto del
 * estado, escribir, y enterarse cuando otro escribió. Las reglas de negocio no
 * están acá: las de plata siguen en `dominio/`, y las de escritura viven en la
 * base (`confirmar_lote`, `alta_cilindro`), probadas en supabase/pruebas/.
 */

import type { FechaISO } from '../dominio/arriendo';
import { armarAviso, type AvisoLote, type TipoAviso } from '../dominio/storage';
import type { Cliente, EstadoApp, Tamano, TipoMovimiento } from '../dominio/tipos';
import {
  armarEstado,
  type FilaArriendo,
  type FilaCilindro,
  type FilaCliente,
  type FilaMovimiento,
  type FilaTarifa,
  type Perfil,
} from './filas';
import { supabase } from './supabase';

// ───────────────────────────────────────────────────────── Errores

/** Un error de la base, dicho de forma que el operador sepa qué hacer. */
function falla(error: { message: string }): Error {
  const mensaje = error.message;

  if (/fetch|network|conexi[oó]n|timeout/i.test(mensaje)) {
    return new Error('No hay conexión. No se grabó nada: probá de nuevo.');
  }
  if (/row-level security|permission denied/i.test(mensaje)) {
    return new Error('No tenés permiso para hacer eso.');
  }

  // Los errores propios de la base ya vienen en castellano.
  return new Error(mensaje);
}

// ───────────────────────────────────────────────────────── La cuenta

export async function ingresar(mail: string, clave: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: mail, password: clave });
  if (error === null) return;

  if (/fetch|network/i.test(error.message)) throw new Error('No hay conexión. Probá de nuevo.');
  throw new Error('El mail o la contraseña no son correctos.');
}

/**
 * Cierra la sesión en este dispositivo y en ningún otro. Por defecto Supabase
 * la cierra en todos, y no es lo que se quiere: un empleado que sale en un
 * celular no tiene por qué quedar afuera en los demás.
 */
export async function cerrarSesion(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}

/** El id del usuario con sesión abierta en este dispositivo, o `null`. */
export async function usuarioConSesion(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Avisa cada vez que alguien entra o sale en este dispositivo. */
export function alCambiarLaSesion(aviso: (usuarioId: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
    aviso(sesion?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function cargarPerfil(usuarioId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, activo')
    .eq('id', usuarioId)
    .maybeSingle();

  if (error !== null) throw falla(error);
  return data as Perfil | null;
}

// ───────────────────────────────────────────────────────── Cargar

const PAGINA = 1000;

/**
 * Trae una tabla entera, de a páginas. Supabase corta las respuestas en 1000
 * filas: sin esto, el día que haya más de mil movimientos se perderían los
 * últimos sin que nadie se entere.
 */
async function traerTodo<T>(tabla: string, columnas: string, orden: string[]): Promise<T[]> {
  const filas: T[] = [];

  for (let desde = 0; ; desde += PAGINA) {
    let consulta = supabase.from(tabla).select(columnas);
    for (const columna of orden) consulta = consulta.order(columna);

    const { data, error } = await consulta.range(desde, desde + PAGINA - 1);
    if (error !== null) throw falla(error);

    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) return filas;
  }
}

/** La foto completa del estado, tal como la base se la entrega a este usuario. */
export async function cargarEstado(perfil: Perfil): Promise<EstadoApp> {
  const [clientes, cilindros, tarifas, arriendos, movimientos] = await Promise.all([
    traerTodo<FilaCliente>('clientes', 'id, nombre, tipo, documento, telefono', ['nombre', 'id']),
    traerTodo<FilaCilindro>('cilindros', 'id, serie, tipo_gas, tamano, activo', ['serie']),
    // A un empleado esto le vuelve vacío: la base no le entrega tarifas.
    traerTodo<FilaTarifa>('tarifas', 'cilindro_id, tarifa_mensual', ['cilindro_id']),
    traerTodo<FilaArriendo>(
      'arriendos',
      'id, cilindro_id, cliente_id, fecha_entrega, fecha_devolucion',
      ['fecha_entrega', 'id'],
    ),
    traerTodo<FilaMovimiento>(
      'movimientos',
      'id, tipo, cilindro_id, cliente_id, fecha, lote_id, operador, creado_en',
      ['creado_en', 'id'],
    ),
  ]);

  return armarEstado({ clientes, cilindros, tarifas, arriendos, movimientos }, perfil.nombre);
}

// ───────────────────────────────────────────────────────── Escribir

export type LoteConfirmado = {
  loteId: string;
  /**
   * El número de remito, correlativo: LOTE-0001, LOTE-0002… `null` si no se
   * grabó ningún movimiento, porque un lote vacío no gasta número.
   */
  numero: number | null;
  /** La fecha que puso el servidor, en hora de Montevideo. */
  fecha: FechaISO;
  /** La hora que puso el servidor, en hora de Montevideo: 'HH:MM'. */
  hora: string;
  /** Las series que de verdad se grabaron, no las que se escanearon. */
  series: string[];
  avisos: AvisoLote[];
};

type RespuestaDeLote = {
  lote_id: string;
  numero: number | null;
  fecha: string;
  hora: string;
  movimientos: { serie: string }[];
  avisos: { serie: string; tipo: TipoAviso }[];
};

/**
 * Graba el lote en la base, todo junto o nada. Ni la fecha ni el operador se
 * mandan desde acá: los pone el servidor.
 */
export async function confirmarLote(
  tipo: TipoMovimiento,
  series: string[],
  clienteId: string | null,
): Promise<LoteConfirmado> {
  const { data, error } = await supabase.rpc('confirmar_lote', {
    p_tipo: tipo,
    p_series: series,
    p_cliente_id: clienteId,
  });

  if (error !== null) throw falla(error);

  const lote = data as RespuestaDeLote;
  return {
    loteId: lote.lote_id,
    numero: lote.numero,
    fecha: lote.fecha,
    hora: lote.hora,
    series: lote.movimientos.map((m) => m.serie),
    avisos: lote.avisos.map((a) => armarAviso(a.serie, a.tipo)),
  };
}

/** Da de alta un cliente y devuelve su id. */
export async function altaCliente(datos: Omit<Cliente, 'id'>): Promise<string> {
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nombre: datos.nombre,
      tipo: datos.tipo,
      documento: datos.documento,
      telefono: datos.telefono,
    })
    .select('id')
    .single();

  if (error !== null) throw falla(error);
  return (data as { id: string }).id;
}

/** Da de alta un cilindro. La tarifa la pone la base según el tamaño. */
export async function altaCilindro(serie: string, tamano: Tamano): Promise<void> {
  const { error } = await supabase.rpc('alta_cilindro', { p_serie: serie, p_tamano: tamano });
  if (error !== null) throw falla(error);
}

// ───────────────────────────────────────────────────────── Enterarse

/**
 * Avisa cuando cambia algo en la base, lo haya hecho quien lo haya hecho. Los
 * avisos respetan las reglas por fila: a cada uno le llega solo lo que puede ver.
 */
export function suscribirCambios(alCambiar: () => void): () => void {
  const canal = supabase
    .channel('cambios-de-la-base')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => alCambiar())
    .subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}
