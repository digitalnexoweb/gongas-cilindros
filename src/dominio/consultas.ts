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

export type VistaCilindro = {
  cilindro: Cilindro;
  ubicacion: Ubicacion;
  /** El arriendo abierto, o `null` si está en stock. */
  arriendo: Arriendo | null;
  /** El cálculo del arriendo abierto. `null` en stock: ahí no se acumula nada. */
  calculo: CalculoArriendo | null;
};

/** El cruce del modelo con el cálculo del punto 1. Es lo que leen las pantallas. */
export function vistaCilindro(estado: EstadoApp, cilindro: Cilindro, hoy: FechaISO): VistaCilindro {
  const arriendo = arriendoAbiertoDe(estado, cilindro.id);

  return {
    cilindro,
    ubicacion: ubicacionDe(estado, cilindro.id),
    arriendo,
    calculo:
      arriendo === null ? null : calcularArriendo(arriendo, cilindro.tarifaMensual, hoy),
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
  /** Lo que acumulan todos sus cilindros juntos. */
  total: number;
};

/** Una fila por cliente, como pide la sección 6.3. */
export function vistaClientes(estado: EstadoApp, hoy: FechaISO): VistaCliente[] {
  const vistas = vistaCilindros(estado, hoy);

  return estado.clientes.map((cliente) => {
    const suyos = vistas.filter(
      (v) => v.ubicacion.lugar === 'cliente' && v.ubicacion.cliente.id === cliente.id,
    );

    return {
      cliente,
      cilindros: suyos,
      total: suyos.reduce((suma, v) => suma + (v.calculo?.importe ?? 0), 0),
    };
  });
}
