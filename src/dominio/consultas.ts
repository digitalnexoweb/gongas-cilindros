/**
 * Las lecturas derivadas del estado.
 *
 * Acá vive la regla de la sección 4: **la ubicación de un cilindro no se guarda,
 * se deduce**. Si tiene un arriendo abierto está en ese cliente; si no, está en
 * stock. Mientras nadie agregue un campo `ubicacion` al modelo, el estado y el
 * historial no se pueden contradecir.
 *
 * Está separado de `storage.ts` a propósito: el día del cambio a Supabase se
 * reescribe la persistencia y todo esto queda igual.
 */

import {
  DIAS_POR_VENCER,
  calcularArriendo,
  type CalculoArriendo,
  type FechaISO,
} from './arriendo';
import type { Arriendo, Cilindro, Cliente, EstadoApp, Movimiento } from './tipos';

export type Ubicacion = { lugar: 'stock' } | { lugar: 'cliente'; cliente: Cliente };

/** El arriendo sin devolver de ese cilindro, si hay alguno. */
export function arriendoAbiertoDe(estado: EstadoApp, cilindroId: string): Arriendo | null {
  return (
    estado.arriendos.find((a) => a.cilindroId === cilindroId && a.fechaDevolucion === null) ?? null
  );
}

/** Dónde está el cilindro, deducido del arriendo abierto. Nunca de un campo. */
export function ubicacionDe(estado: EstadoApp, cilindroId: string): Ubicacion {
  const abierto = arriendoAbiertoDe(estado, cilindroId);
  if (abierto === null) return { lugar: 'stock' };

  const cliente = clientePorId(estado, abierto.clienteId);
  if (cliente === null) return { lugar: 'stock' };

  return { lugar: 'cliente', cliente };
}

export function estaEnStock(estado: EstadoApp, cilindroId: string): boolean {
  return arriendoAbiertoDe(estado, cilindroId) === null;
}

export function cilindroPorSerie(estado: EstadoApp, serie: string): Cilindro | null {
  return estado.cilindros.find((c) => c.serie === serie) ?? null;
}

export function cilindroPorId(estado: EstadoApp, cilindroId: string): Cilindro | null {
  return estado.cilindros.find((c) => c.id === cilindroId) ?? null;
}

export function clientePorId(estado: EstadoApp, clienteId: string): Cliente | null {
  return estado.clientes.find((c) => c.id === clienteId) ?? null;
}

/** El historial completo del cilindro, del movimiento más nuevo al más viejo. */
export function historialDe(estado: EstadoApp, cilindroId: string): Movimiento[] {
  return estado.movimientos
    .map((movimiento, orden) => ({ movimiento, orden }))
    .filter((m) => m.movimiento.cilindroId === cilindroId)
    .sort((a, b) => {
      if (a.movimiento.fecha !== b.movimiento.fecha) {
        return a.movimiento.fecha < b.movimiento.fecha ? 1 : -1;
      }
      // Misma fecha: el que se grabó después va primero.
      return b.orden - a.orden;
    })
    .map((m) => m.movimiento);
}

/** Los arriendos de un cilindro, del más nuevo al más viejo. */
export function arriendosDe(estado: EstadoApp, cilindroId: string): Arriendo[] {
  return estado.arriendos
    .filter((a) => a.cilindroId === cilindroId)
    .sort((a, b) => (a.fechaEntrega < b.fechaEntrega ? 1 : a.fechaEntrega > b.fechaEntrega ? -1 : 0));
}

/**
 * El cálculo de un arriendo tal como lo puede ver quien está mirando.
 *
 * El reloj —días, días facturables, estado— está siempre. La plata solo si el
 * usuario puede ver la tarifa: si no, va `null`, que no es lo mismo que cero.
 */
export type CalculoVisible = Omit<CalculoArriendo, 'tarifaDiaria' | 'importe'> & {
  tarifaDiaria: number | null;
  importe: number | null;
};

export function calcularVisible(
  arriendo: Pick<Arriendo, 'fechaEntrega' | 'fechaDevolucion'>,
  tarifaMensual: number | null,
  hoy: FechaISO,
): CalculoVisible {
  if (tarifaMensual !== null) return calcularArriendo(arriendo, tarifaMensual, hoy);

  // Sin tarifa se calcula igual el reloj, y la plata se deja explícitamente vacía.
  const reloj = calcularArriendo(arriendo, 0, hoy);
  return { ...reloj, tarifaDiaria: null, importe: null };
}

export type VistaCilindro = {
  cilindro: Cilindro;
  ubicacion: Ubicacion;
  /** El arriendo abierto, o `null` si está en stock. */
  arriendo: Arriendo | null;
  /** El cálculo del arriendo abierto. `null` en stock: ahí no se acumula nada. */
  calculo: CalculoVisible | null;
};

/** El cruce del modelo con el cálculo del punto 1. Es lo que leen las pantallas. */
export function vistaCilindro(estado: EstadoApp, cilindro: Cilindro, hoy: FechaISO): VistaCilindro {
  const arriendo = arriendoAbiertoDe(estado, cilindro.id);

  return {
    cilindro,
    ubicacion: ubicacionDe(estado, cilindro.id),
    arriendo,
    calculo: arriendo === null ? null : calcularVisible(arriendo, cilindro.tarifaMensual, hoy),
  };
}

export function vistaCilindros(estado: EstadoApp, hoy: FechaISO): VistaCilindro[] {
  return estado.cilindros.map((cilindro) => vistaCilindro(estado, cilindro, hoy));
}

/**
 * La pantalla de avisos de la sección 6.4: los arriendos de 54 días o más,
 * ordenados por los más atrasados primero.
 */
export function vistaAvisos(estado: EstadoApp, hoy: FechaISO): VistaCilindro[] {
  return vistaCilindros(estado, hoy)
    .filter((v) => (v.calculo?.dias ?? 0) >= DIAS_POR_VENCER)
    .sort((a, b) => {
      const porDias = (b.calculo?.dias ?? 0) - (a.calculo?.dias ?? 0);
      // Empate: por serie, para que el orden no dependa del azar.
      return porDias !== 0 ? porDias : a.cilindro.serie.localeCompare(b.cilindro.serie);
    });
}

export type VistaCliente = {
  cliente: Cliente;
  /** Los cilindros que tiene ahora en su poder. */
  cilindros: VistaCilindro[];
  /**
   * Lo que acumulan todos sus cilindros juntos. `null` si de alguno no se puede
   * ver el importe: un total a medias sería un número falso.
   */
  total: number | null;
};

/** Una fila por cliente, como pide la sección 6.3. */
export function vistaClientes(estado: EstadoApp, hoy: FechaISO): VistaCliente[] {
  const vistas = vistaCilindros(estado, hoy);

  return estado.clientes.map((cliente) => {
    const suyos = vistas.filter(
      (v) => v.ubicacion.lugar === 'cliente' && v.ubicacion.cliente.id === cliente.id,
    );

    const importes = suyos.map((v) => (v.calculo === null ? 0 : v.calculo.importe));

    return {
      cliente,
      cilindros: suyos,
      total: importes.some((i) => i === null)
        ? null
        : importes.reduce<number>((suma, i) => suma + (i ?? 0), 0),
    };
  });
}

// ───────────────────────────────────────────────────────── Deshacer

/** El último movimiento de ese cilindro que no se deshizo, o `null` si no tiene. */
export function ultimoMovimientoDe(estado: EstadoApp, cilindroId: string): Movimiento | null {
  // Los movimientos vienen del más viejo al más nuevo: el último vigente es el de más atrás.
  let ultimo: Movimiento | null = null;
  for (const m of estado.movimientos) {
    if (m.cilindroId === cilindroId && m.deshecho === undefined) ultimo = m;
  }
  return ultimo;
}

/**
 * Si ese movimiento se puede deshacer: `true`, o el motivo por el que no.
 *
 * Es la misma regla que aplica la base (migración 0016), para mostrarla antes
 * de intentar: solo el último movimiento de cada cilindro, una sola vez, y no
 * una entrega de la que ya se le avisó al cliente.
 */
export function sePuedeDeshacer(estado: EstadoApp, movimientoId: string): true | string {
  const movimiento = estado.movimientos.find((m) => m.id === movimientoId);
  if (movimiento === undefined) return 'Ese movimiento no existe.';
  if (movimiento.deshecho !== undefined) return 'Ya se deshizo.';

  if (ultimoMovimientoDe(estado, movimiento.cilindroId)?.id !== movimientoId) return 'Tuvo otro movimiento después: hay que deshacer ese primero.';

  if (movimiento.tipo === 'entrega') {
    const abierto = estado.arriendos.find((a) => a.abiertoPor === movimientoId);
    if (abierto !== undefined && (estado.avisos ?? []).some((v) => v.arriendoId === abierto.id)) {
      return 'Ya se le mandó un aviso al cliente.';
    }
  }

  return true;
}

/**
 * Qué pasa con el cilindro si se deshace ese movimiento, para decirlo antes:
 * "Vuelve al stock", "Vuelve a ANCAP", "Sigue en ANCAP"…
 */
export function alDeshacer(estado: EstadoApp, movimientoId: string): string {
  const movimiento = estado.movimientos.find((m) => m.id === movimientoId);
  if (movimiento === undefined) return '';

  const nombre = (clienteId: string): string => clientePorId(estado, clienteId)?.nombre ?? 'el cliente';

  // El arriendo que este movimiento cerró vuelve a abrirse.
  const cerrado = estado.arriendos.find((a) => a.cerradoPor === movimientoId);
  if (cerrado !== undefined) return `Vuelve a ${nombre(cerrado.clienteId)}`;

  if (movimiento.tipo === 'devolucion') return 'Sigue en stock';

  const abierto = estado.arriendos.find((a) => a.abiertoPor === movimientoId);
  if (abierto !== undefined) return 'Vuelve al stock';

  // "Ya estaba en este cliente": la entrega no abrió nada.
  return movimiento.clienteId === null ? 'Queda como estaba' : `Sigue en ${nombre(movimiento.clienteId)}`;
}

/**
 * Si ese cliente se puede borrar: `true`, o el motivo por el que no. La misma
 * regla que aplica la base (migración 0017): solo un cliente sin historia real.
 * Sus movimientos deshechos no cuentan: se borran con él.
 */
export function sePuedeBorrarCliente(estado: EstadoApp, clienteId: string): true | string {
  const arriendos = estado.arriendos.filter((a) => a.clienteId === clienteId);
  if (arriendos.some((a) => a.fechaDevolucion === null)) return 'Tiene cilindros en su poder: no se puede borrar.';

  const conHistoria =
    arriendos.length > 0 ||
    estado.movimientos.some((m) => m.clienteId === clienteId && m.deshecho === undefined) ||
    (estado.avisos ?? []).some((v) => v.clienteId === clienteId);

  return conHistoria ? 'Tiene entregas registradas: no se puede borrar sin perder su historia.' : true;
}
