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
import type { Cliente, EstadoApp, TextosAviso, TipoGas, TipoMovimiento } from '../dominio/tipos';
import {
  armarEstado,
  type FilaArriendo,
  type FilaAviso,
  type FilaCilindro,
  type FilaCliente,
  type FilaMovimiento,
  type FilaTarifa,
  type FilaTextosAviso,
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
 * Crea una cuenta nueva. Nace desactivada (migración 0004): no ve nada hasta
 * que el administrador la activa desde Ajustes → Usuarios.
 *
 * Devuelve `false` si Supabase pide confirmar el mail antes de entrar: ahí no
 * queda sesión abierta y hay que avisarlo en pantalla.
 */
export async function crearCuenta(nombre: string, mail: string, clave: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: mail,
    password: clave,
    // La base toma el nombre de acá para armar el perfil (crear_perfil, 0002).
    options: { data: { nombre } },
  });
  if (error === null) return data.session !== null;

  const mensaje = error.message;
  if (/fetch|network/i.test(mensaje)) throw new Error('No hay conexión. Probá de nuevo.');
  if (/already|registered|exists/i.test(mensaje)) {
    throw new Error('Ya hay una cuenta con ese mail. Probá entrar con ella.');
  }
  if (/signups? (are )?not allowed|disabled/i.test(mensaje)) {
    throw new Error('Por ahora no se pueden crear cuentas. Avisale al administrador.');
  }
  if (/password/i.test(mensaje)) {
    throw new Error('La contraseña no sirve: probá con una más larga, de 8 o más caracteres.');
  }
  throw new Error('No se pudo crear la cuenta. Probá de nuevo.');
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
  const [clientes, cilindros, tarifas, arriendos, movimientos, avisos, textos, tiposGas, pesos] = await Promise.all([
    traerTodo<FilaCliente>('clientes', 'id, nombre, tipo, documento, telefono, email, direccion, ciudad, notas', ['nombre', 'id']),
    traerTodo<FilaCilindro>('cilindros', 'id, serie, tipo_gas, kg, activo', ['serie']),
    // A un empleado esto le vuelve vacío: la base no le entrega tarifas.
    traerTodo<FilaTarifa>('tarifas', 'cilindro_id, tarifa_mensual', ['cilindro_id']),
    traerTodo<FilaArriendo>(
      'arriendos',
      'id, cilindro_id, cliente_id, fecha_entrega, fecha_devolucion, tipo_gas',
      ['fecha_entrega', 'id'],
    ),
    traerTodo<FilaMovimiento>(
      'movimientos',
      'id, tipo, cilindro_id, cliente_id, fecha, lote_id, operador, creado_en, tipo_gas',
      ['creado_en', 'id'],
    ),
    traerTodo<FilaAviso>(
      'avisos',
      'id, arriendo_id, cilindro_id, cliente_id, dias, canal, etapa, destino, operador, creado_en',
      ['creado_en', 'id'],
    ),
    supabase.from('textos_aviso').select('con_cargo, por_vencer, copia_mail').maybeSingle(),
    traerTodo<TipoGas>('tipos_gas', 'nombre, activo, orden', ['orden', 'nombre']),
    traerTodo<{ kg: number | string; activo: boolean }>('tamanos', 'kg, activo', ['kg']),
  ]);

  if (textos.error !== null) throw falla(textos.error);

  return armarEstado(
    {
      clientes,
      cilindros,
      tarifas,
      arriendos,
      movimientos,
      avisos,
      textosAviso: textos.data as FilaTextosAviso | null,
      tiposGas,
      pesos,
    },
    perfil.nombre,
  );
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
  /** El gas de cada serie grabada, en el mismo orden. */
  gases: (string | null)[];
  avisos: AvisoLote[];
};

type RespuestaDeLote = {
  lote_id: string;
  numero: number | null;
  fecha: string;
  hora: string;
  movimientos: { serie: string; tipo_gas?: string | null }[];
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
  /** El gas de cada serie, en el mismo orden. Solo en las entregas. */
  gases?: (string | null)[],
): Promise<LoteConfirmado> {
  const { data, error } = await supabase.rpc('confirmar_lote', {
    p_tipo: tipo,
    p_series: series,
    p_cliente_id: clienteId,
    ...(gases === undefined ? {} : { p_gases: gases }),
  });

  if (error !== null) throw falla(error);

  const lote = data as RespuestaDeLote;
  return {
    loteId: lote.lote_id,
    numero: lote.numero,
    fecha: lote.fecha,
    hora: lote.hora,
    series: lote.movimientos.map((m) => m.serie),
    gases: lote.movimientos.map((m) => m.tipo_gas ?? null),
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
      email: datos.email ?? '',
      direccion: datos.direccion ?? '',
      ciudad: datos.ciudad ?? '',
      notas: datos.notas ?? '',
    })
    .select('id')
    .single();

  if (error !== null) throw falla(error);
  return (data as { id: string }).id;
}

/** Da de alta un cilindro. La tarifa la pone la base según el tamaño. */
export async function altaCilindro(serie: string, kg: number, tipoGas?: string): Promise<void> {
  const { error } = await supabase.rpc('alta_cilindro', {
    p_serie: serie,
    p_kg: kg,
    ...(tipoGas === undefined ? {} : { p_tipo_gas: tipoGas }),
  });
  if (error !== null) throw falla(error);
}

/**
 * Corrige el peso de un cilindro. Cualquier usuario activo: es un dato
 * físico. La tarifa pasa a la del peso nuevo salvo que tuviera un precio propio.
 */
export async function corregirKilos(serie: string, kg: number): Promise<void> {
  const { error } = await supabase.rpc('corregir_kilos', { p_serie: serie, p_kg: kg });
  if (error !== null) throw falla(error);
}

// ───────────────────────────────────────────────────────── Administrar
//
// Todo esto es del administrador. La base lo verifica por su cuenta: si un
// empleado lo intentara, las funciones tiran "No autorizado" y las reglas por
// fila no le dejan tocar ninguna fila.

export type Usuario = Perfil & {
  email: string;
  creadoEn: string;
};

/** Todas las cuentas, con su mail. Primero las que esperan activación. */
export async function listarUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase.rpc('usuarios');
  if (error !== null) throw falla(error);

  return (data as (Perfil & { email: string; creado_en: string })[]).map((u) => ({
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    creadoEn: u.creado_en,
  }));
}

export async function editarUsuario(
  id: string,
  datos: Pick<Perfil, 'nombre' | 'rol' | 'activo'>,
): Promise<void> {
  const { data, error } = await supabase
    .from('perfiles')
    .update({ nombre: datos.nombre, rol: datos.rol, activo: datos.activo })
    .eq('id', id)
    .select('id');

  if (error !== null) throw falla(error);
  if ((data ?? []).length === 0) throw new Error('No tenés permiso para hacer eso.');
}

export async function editarCliente(id: string, datos: Omit<Cliente, 'id'>): Promise<void> {
  const { data, error } = await supabase
    .from('clientes')
    .update({
      nombre: datos.nombre,
      tipo: datos.tipo,
      documento: datos.documento,
      telefono: datos.telefono,
      email: datos.email ?? '',
      direccion: datos.direccion ?? '',
      ciudad: datos.ciudad ?? '',
      notas: datos.notas ?? '',
    })
    .eq('id', id)
    .select('id');

  if (error !== null) throw falla(error);
  // Sin permiso, la regla por fila no tira error: simplemente no toca nada.
  if ((data ?? []).length === 0) throw new Error('No tenés permiso para hacer eso.');
}

export type CambiosCilindro = {
  kg: number;
  tipoGas: string;
  tarifaMensual: number;
  activo: boolean;
};

/** Tamaño, gas, tarifa y baja, todo junto o nada. La serie no se edita. */
export async function editarCilindro(id: string, cambios: CambiosCilindro): Promise<void> {
  const { error } = await supabase.rpc('editar_cilindro', {
    p_id: id,
    p_kg: cambios.kg,
    p_tipo_gas: cambios.tipoGas,
    p_tarifa: cambios.tarifaMensual,
    p_activo: cambios.activo,
  });
  if (error !== null) throw falla(error);
}

/** La tarifa de cada peso, con la que nace un cilindro nuevo. Solo el administrador. */
export async function tarifasPorKilos(): Promise<{ kg: number; tarifa: number }[]> {
  const { data, error } = await supabase.from('tarifas_por_kilos').select('kg, tarifa_mensual').order('kg');
  if (error !== null) throw falla(error);

  const filas = (data ?? []) as { kg: number | string; tarifa_mensual: number | string }[];
  if (filas.length === 0) throw new Error('No tenés permiso para ver las tarifas.');
  return filas.map((f) => ({ kg: Number(f.kg), tarifa: Number(f.tarifa_mensual) }));
}

/**
 * Cambia la tarifa de un peso y la de cada cilindro que tenía la anterior.
 * Devuelve cuántos cilindros cambiaron.
 */
export async function cambiarTarifaDeKilos(kg: number, tarifa: number): Promise<number> {
  const { data, error } = await supabase.rpc('cambiar_tarifa_de_kilos', { p_kg: kg, p_tarifa: tarifa });
  if (error !== null) throw falla(error);
  return data as number;
}

/** Un peso nuevo con su tarifa. Solo el administrador. */
export async function agregarKilos(kg: number, tarifa: number): Promise<void> {
  const { error } = await supabase.rpc('agregar_kilos', { p_kg: kg, p_tarifa: tarifa });
  if (error !== null) throw falla(error);
}

// ───────────────────────────────────────────────────────── Avisos

/**
 * Deja constancia de que alguien abrió WhatsApp para avisar de este arriendo.
 * Quién y cuándo los pone la base.
 */
export async function registrarAviso(arriendoId: string): Promise<void> {
  const { error } = await supabase.rpc('registrar_aviso', { p_arriendo_id: arriendoId });
  if (error !== null) throw falla(error);
}

/** Solo el administrador. Sin permiso, la regla por fila no toca nada. */
export async function guardarTextosAviso(textos: TextosAviso): Promise<void> {
  const { data, error } = await supabase
    .from('textos_aviso')
    .update({
      con_cargo: textos.conCargo,
      por_vencer: textos.porVencer,
      copia_mail: (textos.copiaMail ?? '').trim(),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', true)
    .select('id');

  if (error !== null) throw falla(error);
  if ((data ?? []).length === 0) throw new Error('No tenés permiso para hacer eso.');
}

// ───────────────────────────────────────────────────────── Tipos de gas

/** Solo el administrador. */
export async function agregarTipoGas(nombre: string, orden: number): Promise<void> {
  const { error } = await supabase.from('tipos_gas').insert({ nombre, orden });
  if (error === null) return;
  if (/duplicate|unique/i.test(error.message)) throw new Error('Ese gas ya está en la lista.');
  throw falla(error);
}

/** Ofrecerlo o no al entregar. Uno que ya se usó no se borra. Solo el administrador. */
export async function cambiarTipoGas(nombre: string, activo: boolean): Promise<void> {
  const { data, error } = await supabase.from('tipos_gas').update({ activo }).eq('nombre', nombre).select('nombre');
  if (error !== null) throw falla(error);
  if ((data ?? []).length === 0) throw new Error('No tenés permiso para hacer eso.');
}

// ───────────────────────────────────────────────────────── Contraseñas

/**
 * Manda el mail con el link para elegir una contraseña nueva. Por seguridad no
 * dice si el mail existe o no: siempre responde igual.
 */
export async function pedirNuevaClave(mail: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(mail, {
    redirectTo: window.location.origin,
  });
  if (error === null) return;
  if (/fetch|network/i.test(error.message)) throw new Error('No hay conexión. Probá de nuevo.');
  if (/rate|too many|seconds/i.test(error.message)) {
    throw new Error('Ya pediste uno hace poco. Esperá un minuto y probá de nuevo.');
  }
  throw new Error('No se pudo mandar el mail. Probá de nuevo en un rato.');
}

/** Al volver del link del mail: la sesión ya es la de ese usuario, falta la clave nueva. */
export async function elegirNuevaClave(nueva: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error === null) return;
  if (/same|different/i.test(error.message)) throw new Error('Tiene que ser distinta de la anterior.');
  if (/password/i.test(error.message)) throw new Error('Esa contraseña no sirve: probá con una más larga.');
  throw new Error('No se pudo cambiar la contraseña. Probá de nuevo.');
}

/**
 * Cambiar la contraseña desde Ajustes. Pide la actual y la comprueba entrando
 * de nuevo con ella: así nadie que agarre un celular desbloqueado la cambia.
 */
export async function cambiarClave(actual: string, nueva: string): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const mail = data.user?.email;
  if (mail === undefined) throw new Error('No hay sesión abierta.');

  const comprobacion = await supabase.auth.signInWithPassword({ email: mail, password: actual });
  if (comprobacion.error !== null) throw new Error('La contraseña actual no es correcta.');

  await elegirNuevaClave(nueva);
}

/** Avisa cuando se abre la app desde el link de "me olvidé la contraseña". */
export function alVolverDelLinkDeClave(aviso: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') aviso();
  });
  return () => data.subscription.unsubscribe();
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
