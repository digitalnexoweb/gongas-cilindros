/**
 * Los cilindros que ya generan cargo, juntos: para el aviso ámbar del inicio y
 * el globo rojo de Avisos en la navegación.
 *
 * No calcula plata: suma los importes que ya calculó el dominio.
 */

import type { FechaISO } from '../dominio/arriendo';
import { vistaCilindros } from '../dominio/consultas';
import type { EstadoApp } from '../dominio/tipos';

export type ParaCobrar = {
  cantidad: number;
  /**
   * Lo que acumulan a hoy. `null` si de alguno no se puede ver el importe, como
   * le pasa a un empleado: un total a medias sería un número falso.
   */
  total: number | null;
};

export function paraCobrar(estado: EstadoApp, hoy: FechaISO): ParaCobrar {
  const importes = vistaCilindros(estado, hoy)
    .filter((v) => v.calculo?.estado === 'generando_cargo')
    .map((v) => v.calculo?.importe ?? null);

  return {
    cantidad: importes.length,
    total: importes.some((i) => i === null)
      ? null
      : importes.reduce<number>((suma, i) => suma + (i ?? 0), 0),
  };
}
