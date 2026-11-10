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
};

/** Se abre con cada entrega y se cierra con la devolución. */
export type Arriendo = {
  id: string;
  cilindroId: string;
  clienteId: string;
  fechaEntrega: FechaISO;
  fechaDevolucion: FechaISO | null;
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
};

/** Todo lo que se guarda, en una sola pieza. */
export type EstadoApp = {
  version: 1;
  operador: string;
  clientes: Cliente[];
  cilindros: Cilindro[];
  arriendos: Arriendo[];
  movimientos: Movimiento[];
};
