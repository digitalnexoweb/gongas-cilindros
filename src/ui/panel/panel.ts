/**
 * Las cuentas del panel que no son plata: cuántos cilindros hay en cada lugar,
 * de qué gas y peso, y cuánto se movió en el mes. Puras, para probarlas sin
 * pantalla. La plata del panel vive en `dominio/resumen.ts`.
 */

import { type FechaISO } from '../../dominio/arriendo';
import type { VistaCilindro } from '../../dominio/consultas';
import { primerDiaDelMes, ultimoDiaDelMes, type Mes } from '../../dominio/resumen';
import type { EstadoApp } from '../../dominio/tipos';
import { estadoVisible, type EstadoVisible } from '../ChipEstado';
import { enMontevideo } from '../hora';

export type ConteoDeHoy = Record<EstadoVisible, number> & {
  /** Los que están en uso: sin los dados de baja. */
  total: number;
  enClientes: number;
};

/** Cuántos cilindros hay en cada estado. Los dados de baja no cuentan. */
export function conteoDeHoy(vistas: VistaCilindro[]): ConteoDeHoy {
  const conteo: ConteoDeHoy = {
    total: 0,
    enClientes: 0,
    stock: 0,
    en_gracia: 0,
    por_vencer: 0,
    generando_cargo: 0,
  };

  for (const v of vistas) {
    if (!v.cilindro.activo) continue;
    const estado = estadoVisible(v.calculo);
    conteo.total += 1;
    conteo[estado] += 1;
    if (estado !== 'stock') conteo.enClientes += 1;
  }

  return conteo;
}

export type FilaStock = { gas: string; kg: number; enStock: number; enClientes: number };

/** Una fila por cada gas y peso que exista, ordenadas por gas y después por peso. */
export function stockPorGasYPeso(vistas: VistaCilindro[]): FilaStock[] {
  const filas = new Map<string, FilaStock>();

  for (const { cilindro, calculo } of vistas) {
    if (!cilindro.activo) continue;
    const clave = `${cilindro.tipoGas.toLowerCase()}|${cilindro.kg}`;
    const fila = filas.get(clave) ?? { gas: cilindro.tipoGas, kg: cilindro.kg, enStock: 0, enClientes: 0 };
    if (calculo === null) fila.enStock += 1;
    else fila.enClientes += 1;
    filas.set(clave, fila);
  }

  return [...filas.values()].sort((a, b) => a.gas.localeCompare(b.gas, 'es') || a.kg - b.kg);
}

export type Semana = { desde: FechaISO; hasta: FechaISO; entregas: number; devoluciones: number };

export type MovimientoDelMes = {
  entregas: number;
  devoluciones: number;
  avisosWhatsapp: number;
  avisosMail: number;
  /** Del 1 al 7, del 8 al 14, del 15 al 21, del 22 al 28 y lo que quede. */
  semanas: Semana[];
};

/**
 * Lo que se movió en el mes: entregas y devoluciones de cilindros (no de
 * lotes), y avisos mandados. Los movimientos deshechos no cuentan: es como si
 * no hubieran pasado.
 */
export function movimientoDelMes(estado: EstadoApp, mes: Mes): MovimientoDelMes {
  const primero = primerDiaDelMes(mes);
  const ultimo = ultimoDiaDelMes(mes);
  const ultimoDia = Number(ultimo.slice(8, 10));

  const semanas: Semana[] = [];
  for (let dia = 1; dia <= ultimoDia; dia += 7) {
    const hasta = Math.min(dia + 6, ultimoDia);
    semanas.push({
      desde: `${mes}-${String(dia).padStart(2, '0')}`,
      hasta: `${mes}-${String(hasta).padStart(2, '0')}`,
      entregas: 0,
      devoluciones: 0,
    });
  }

  let entregas = 0;
  let devoluciones = 0;
  for (const m of estado.movimientos) {
    if (m.deshecho !== undefined || m.fecha < primero || m.fecha > ultimo) continue;
    const semana = semanas[Math.floor((Number(m.fecha.slice(8, 10)) - 1) / 7)];
    if (m.tipo === 'entrega') {
      entregas += 1;
      if (semana !== undefined) semana.entregas += 1;
    } else {
      devoluciones += 1;
      if (semana !== undefined) semana.devoluciones += 1;
    }
  }

  let avisosWhatsapp = 0;
  let avisosMail = 0;
  for (const a of estado.avisos ?? []) {
    // El día del aviso es el de Montevideo: uno de las 23:30 del 30 es del 30.
    const fecha = enMontevideo(a.creadoEn)?.fecha;
    if (fecha === undefined || fecha < primero || fecha > ultimo) continue;
    if (a.canal === 'mail') avisosMail += 1;
    else avisosWhatsapp += 1;
  }

  return { entregas, devoluciones, avisosWhatsapp, avisosMail, semanas };
}
