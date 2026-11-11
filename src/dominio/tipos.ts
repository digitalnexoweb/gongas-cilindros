/**
 * El modelo de datos de la sección 4 del SPEC.
 *
 * Ojo con lo que NO está acá: el cilindro no tiene campo de ubicación, ni de
 * estado. Dónde está se deduce de si tiene un arriendo abierto, y eso vive en
 * `consultas.ts`. La sección 4 dice que esa regla no se negocia, porque es lo
 * que impide que el estado y el historial se contradigan.
 */

import type { FechaISO } from './arriendo';

export type Tamano = 'chico' | 'grande';

/** Tarifa mensual por defecto de cada tamaño. Cada cilindro la puede pisar. */
export const TARIFA_POR_TAMANO: Record<Tamano, number> = {
  chico: 380,
  grande: 440,
};

export type Cilindro = {
  id: string;
  /** Única, va en el QR. Ej: "CIL-00123". */
  serie: string;
  /** "acetileno" en el prototipo. */
  tipoGas: string;
  tamano: Tamano;
  /**
   * `null` significa "este usuario no la puede ver": a un empleado la base no
   * le entrega las tarifas. No es cero, y nada tiene que mostrarlo como cero.
   */
  tarifaMensual: number | null;
  activo: boolean;
};

export type TipoCliente = 'empresa' | 'particular';

export type Cliente = {
  id: string;
  nombre: string;
  tipo: TipoCliente;
  /** RUT o CI. */
  documento: string;
  /** Con código de país, para el link de WhatsApp. */
  telefono: string;
  /** Para los avisos automáticos. Vacío o ausente: no se le avisa por mail. */
  email?: string;
  direccion?: string;
  /** Ciudad o departamento. */
  ciudad?: string;
  /** Texto libre: horarios, indicaciones de entrega. */
  notas?: string;
};

/** Se abre con cada entrega y se cierra con la devolución. */
export type Arriendo = {
  id: string;
  cilindroId: string;
  clienteId: string;
  fechaEntrega: FechaISO;
  fechaDevolucion: FechaISO | null;
  /** El gas con el que salió. Solo viene de la base; la demo no lo tiene. */
  tipoGas?: string | null;
};

export type TipoMovimiento = 'entrega' | 'devolucion';

/** Registro inmutable. Nunca se edita ni se borra. */
export type Movimiento = {
  id: string;
  tipo: TipoMovimiento;
  cilindroId: string;
  clienteId: string | null;
  fecha: FechaISO;
  loteId: string;
  /** Nombre elegido al abrir la app. */
  operador: string;
  /**
   * El momento exacto en que se grabó, como lo guarda la base (ISO, en UTC).
   * Solo para mostrar la hora: ningún cálculo lo usa, el reloj cuenta por `fecha`.
   * Falta en los movimientos que no vienen de la base, como los de la demo.
   */
  creadoEn?: string;
  /** En una entrega, el gas con el que salió; en una devolución, con el que había salido. */
  tipoGas?: string | null;
};

/**
 * Una vez que alguien tocó "Avisar por WhatsApp". Dice que se abrió WhatsApp
 * con el mensaje, no que el cliente lo haya recibido.
 */
export type AvisoRegistrado = {
  id: string;
  arriendoId: string;
  cilindroId: string;
  clienteId: string;
  /** Los días que llevaba el arriendo cuando se avisó. */
  dias: number;
  /** Por dónde salió. Los avisos de antes de los mails son todos de WhatsApp. */
  canal: 'whatsapp' | 'mail';
  etapa: 'por_vencer' | 'con_cargo';
  /** A qué dirección salió un mail. `null` en WhatsApp. */
  destino: string | null;
  /** Quién avisó. En los mails, "Automático". */
  operador: string;
  /** El momento exacto, como lo guarda la base (ISO, en UTC). */
  creadoEn: string;
};

/**
 * El texto genérico de los avisos, con huecos entre llaves que se completan con
 * los datos de cada cliente: {cliente}, {serie}, {desde}, {dias}, {importe},
 * {sin_cargo}.
 */
export type TextosAviso = {
  /** De 61 días en adelante: lleva el importe. */
  conCargo: string;
  /** De 54 a 60: avisa cuánto le queda sin cargo. */
  porVencer: string;
  /** A quién le llega la copia oculta de cada mail automático. Vacío: a nadie. */
  copiaMail?: string;
};

/** Todo lo que se guarda, en una sola pieza. */
export type EstadoApp = {
  version: 1;
  operador: string;
  clientes: Cliente[];
  cilindros: Cilindro[];
  arriendos: Arriendo[];
  movimientos: Movimiento[];
  /** Solo vienen de la base. La demo no los tiene. */
  avisos?: AvisoRegistrado[];
  /** Solo vienen de la base. Sin esto, se usan los textos originales. */
  textosAviso?: TextosAviso;
  /** Los gases que se pueden elegir al entregar. Solo vienen de la base. */
  tiposGas?: TipoGas[];
};

export type TipoGas = {
  nombre: string;
  /** Uno que ya se usó no se borra: se deja de ofrecer. */
  activo: boolean;
  orden: number;
};
