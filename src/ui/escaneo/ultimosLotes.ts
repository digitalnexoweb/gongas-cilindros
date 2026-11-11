/**
 * Los últimos lotes que se grabaron, para la pantalla de inicio del escaneo.
 *
 * Es pura: arma la lista desde los movimientos, sin mirar la hora del
 * dispositivo. "Hoy" llega de afuera, igual que en el resto de la app.
 */

import type { FechaISO } from '../../dominio/arriendo';
import type { EstadoApp, TipoMovimiento } from '../../dominio/tipos';
import { cuandoCorto as cuando, enMontevideo } from '../hora';

export type LoteReciente = {
  loteId: string;
  tipo: TipoMovimiento;
  /** El cliente del lote, "Varios clientes" o "Sin cliente". */
  cliente: string;
  cantidad: number;
  /** "Hoy 14:20", "Ayer" o "03/11". */
  cuando: string;
};

export function ultimosLotes(estado: EstadoApp, hoy: FechaISO, cuantos = 5): LoteReciente[] {
  const nombres = new Map(estado.clientes.map((c) => [c.id, c.nombre]));

  type Grupo = {
    loteId: string;
    tipo: TipoMovimiento;
    clientes: Set<string | null>;
    cantidad: number;
    /** El último movimiento del lote: la lista viene del más viejo al más nuevo. */
    orden: number;
    fecha: FechaISO;
    creadoEn: string | undefined;
  };

  const grupos = new Map<string, Grupo>();

  estado.movimientos.forEach((m, orden) => {
    const grupo = grupos.get(m.loteId);
    if (grupo === undefined) {
      grupos.set(m.loteId, {
        loteId: m.loteId,
        tipo: m.tipo,
        clientes: new Set([m.clienteId]),
        cantidad: 1,
        orden,
        fecha: m.fecha,
        creadoEn: m.creadoEn,
      });
      return;
    }
    grupo.clientes.add(m.clienteId);
    grupo.cantidad += 1;
    grupo.orden = orden;
    grupo.creadoEn = m.creadoEn ?? grupo.creadoEn;
  });

  return [...grupos.values()]
    .sort((a, b) => b.orden - a.orden)
    .slice(0, cuantos)
    .map((g) => {
      const ids = [...g.clientes];
      const cliente =
        ids.length > 1
          ? 'Varios clientes'
          : ids[0] == null
            ? 'Sin cliente'
            : (nombres.get(ids[0]) ?? 'Cliente borrado');

      const momento = g.creadoEn === undefined ? null : enMontevideo(g.creadoEn);

      return {
        loteId: g.loteId,
        tipo: g.tipo,
        cliente,
        cantidad: g.cantidad,
        cuando:
          momento === null ? cuando(g.fecha, null, hoy) : cuando(momento.fecha, momento.hora, hoy),
      };
    });
}
