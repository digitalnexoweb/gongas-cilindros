/**
 * La hora de Montevideo de un momento que grabó la base, para mostrarla.
 *
 * Montevideo está en UTC−3 todo el año: Uruguay dejó el horario de verano en
 * 2015. Se resta a mano para no depender de la zona horaria del celular ni de
 * la base de husos del navegador.
 */

import { aFechaISO, sumarDias, type FechaISO } from '../dominio/arriendo';

const MS_MONTEVIDEO = -3 * 60 * 60 * 1000;

/** El día y la hora en Montevideo, o `null` si el texto no es una fecha. */
export function enMontevideo(creadoEn: string): { fecha: FechaISO; hora: string } | null {
  const ms = Date.parse(creadoEn);
  if (Number.isNaN(ms)) return null;

  const local = ms + MS_MONTEVIDEO;
  const fecha = new Date(local);
  const hora = `${String(fecha.getUTCHours()).padStart(2, '0')}:${String(fecha.getUTCMinutes()).padStart(2, '0')}`;
  return { fecha: aFechaISO(local), hora };
}

/** "Hoy 14:20", "Ayer" o "03/11", para listas cortas. */
export function cuandoCorto(fecha: FechaISO, hora: string | null, hoy: FechaISO): string {
  if (fecha === hoy) return hora === null ? 'Hoy' : `Hoy ${hora}`;
  if (fecha === sumarDias(hoy, -1)) return 'Ayer';
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/** "hoy a las 14:20", "ayer a las 9:05" o "el 03/11", para una frase. */
export function cuandoEnFrase(creadoEn: string, hoy: FechaISO): string {
  const momento = enMontevideo(creadoEn);
  if (momento === null) return '';
  if (momento.fecha === hoy) return `hoy a las ${momento.hora}`;
  if (momento.fecha === sumarDias(hoy, -1)) return `ayer a las ${momento.hora}`;
  return `el ${momento.fecha.slice(8, 10)}/${momento.fecha.slice(5, 7)}`;
}
