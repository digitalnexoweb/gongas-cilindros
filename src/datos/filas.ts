/**
 * De filas de la base a la foto del estado que usa toda la app.
 *
 * Es puro a propósito: no importa Supabase, así que se puede testear con filas
 * armadas a mano. El resto del dominio —consultas, resumen, mensajes— sigue
 * trabajando sobre `EstadoApp` y no se entera de dónde vinieron los datos.
 */

import { parseFechaISO, type FechaISO } from '../dominio/arriendo';
import type {
  Arriendo,
  AvisoRegistrado,
  Cilindro,
  Cliente,
  EstadoApp,
  Movimiento,
  Tamano,
  TipoCliente,
  TipoMovimiento,
} from '../dominio/tipos';

export type Rol = 'admin' | 'operador';

export type Perfil = {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
};

export type FilaCliente = {
  id: string;
  nombre: string;
  tipo: TipoCliente;
  documento: string;
  telefono: string;
  email?: string;
};

export type FilaCilindro = {
  id: string;
  serie: string;
  tipo_gas: string;
  tamano: Tamano;
  activo: boolean;
};

export type FilaTarifa = {
  cilindro_id: string;
  /** `numeric` puede llegar como número o como texto, según quién lo lea. */
  tarifa_mensual: number | string;
};

export type FilaArriendo = {
  id: string;
  cilindro_id: string;
  cliente_id: string;
  fecha_entrega: string;
  fecha_devolucion: string | null;
};

export type FilaMovimiento = {
  id: string;
  tipo: TipoMovimiento;
  cilindro_id: string;
  cliente_id: string | null;
  fecha: string;
  lote_id: string;
  operador: string;
  creado_en: string;
};

export type FilaAviso = {
  id: string;
  arriendo_id: string;
  cilindro_id: string;
  cliente_id: string;
  dias: number;
  canal?: 'whatsapp' | 'mail';
  etapa?: 'por_vencer' | 'con_cargo';
  destino?: string | null;
  operador: string;
  creado_en: string;
};

export type FilaTextosAviso = {
  con_cargo: string;
  por_vencer: string;
  copia_mail?: string;
};

export type Filas = {
  clientes: FilaCliente[];
  cilindros: FilaCilindro[];
  /** Vacía para un empleado: la base no le entrega tarifas. */
  tarifas: FilaTarifa[];
  arriendos: FilaArriendo[];
  movimientos: FilaMovimiento[];
  /** Opcionales: los tests de antes de la etapa D no los traen. */
  avisos?: FilaAviso[];
  textosAviso?: FilaTextosAviso | null;
};

/**
 * Las fechas tienen que llegar como 'YYYY-MM-DD'. Si alguna vez llegaran con
 * hora, es preferible que esto falle fuerte a que la app corra un día para
 * atrás en silencio: es el error de zona horaria que todo el proyecto evita.
 */
function fecha(valor: string): FechaISO {
  parseFechaISO(valor);
  return valor;
}

export function armarEstado(filas: Filas, operador: string): EstadoApp {
  const tarifas = new Map(filas.tarifas.map((t) => [t.cilindro_id, Number(t.tarifa_mensual)]));

  const clientes: Cliente[] = filas.clientes.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    documento: c.documento,
    telefono: c.telefono,
    email: c.email ?? '',
  }));

  const cilindros: Cilindro[] = filas.cilindros.map((c) => ({
    id: c.id,
    serie: c.serie,
    tipoGas: c.tipo_gas,
    tamano: c.tamano,
    // Sin fila de tarifa, `null`: "no la puede ver". Nunca cero.
    tarifaMensual: tarifas.get(c.id) ?? null,
    activo: c.activo,
  }));

  const arriendos: Arriendo[] = filas.arriendos.map((a) => ({
    id: a.id,
    cilindroId: a.cilindro_id,
    clienteId: a.cliente_id,
    fechaEntrega: fecha(a.fecha_entrega),
    fechaDevolucion: a.fecha_devolucion === null ? null : fecha(a.fecha_devolucion),
  }));

  // Del más viejo al más nuevo, por el momento en que se grabaron. El historial
  // de un cilindro desempata con este orden cuando dos movimientos son del mismo día.
  const movimientos: Movimiento[] = [...filas.movimientos]
    .sort((a, b) =>
      a.creado_en === b.creado_en ? a.id.localeCompare(b.id) : a.creado_en < b.creado_en ? -1 : 1,
    )
    .map((m) => ({
      id: m.id,
      tipo: m.tipo,
      cilindroId: m.cilindro_id,
      clienteId: m.cliente_id,
      fecha: fecha(m.fecha),
      loteId: m.lote_id,
      operador: m.operador,
      creadoEn: m.creado_en,
    }));

  // Del más viejo al más nuevo, igual que los movimientos.
  const avisos: AvisoRegistrado[] = [...(filas.avisos ?? [])]
    .sort((a, b) =>
      a.creado_en === b.creado_en ? a.id.localeCompare(b.id) : a.creado_en < b.creado_en ? -1 : 1,
    )
    .map((a) => ({
      id: a.id,
      arriendoId: a.arriendo_id,
      cilindroId: a.cilindro_id,
      clienteId: a.cliente_id,
      dias: a.dias,
      canal: a.canal ?? 'whatsapp',
      etapa: a.etapa ?? (a.dias > 60 ? 'con_cargo' : 'por_vencer'),
      destino: a.destino ?? null,
      operador: a.operador,
      creadoEn: a.creado_en,
    }));

  const textos = filas.textosAviso;

  return {
    version: 1,
    operador,
    clientes,
    cilindros,
    arriendos,
    movimientos,
    avisos,
    ...(textos == null ? {} : {
          textosAviso: {
            conCargo: textos.con_cargo,
            porVencer: textos.por_vencer,
            copiaMail: textos.copia_mail ?? '',
          },
        }),
  };
}
