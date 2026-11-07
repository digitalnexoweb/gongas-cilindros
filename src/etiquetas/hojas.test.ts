import { describe, expect, it } from 'vitest';

import {
  ALTO_ETIQUETA_MM,
  ANCHO_ETIQUETA_MM,
  COLUMNAS,
  ETIQUETAS_POR_HOJA,
  altoDeHojaMm,
  repartirEnHojas,
} from './hojas';

const series = (cuantas: number) =>
  Array.from({ length: cuantas }, (_, i) => `CIL-${String(i + 1).padStart(5, '0')}`);

describe('repartirEnHojas', () => {
  it('sin etiquetas no hay hojas', () => {
    expect(repartirEnHojas([])).toEqual([]);
  });

  it('hasta 15 entran en una sola hoja', () => {
    expect(repartirEnHojas(series(1))).toHaveLength(1);
    expect(repartirEnHojas(series(14))).toHaveLength(1);
    expect(repartirEnHojas(series(ETIQUETAS_POR_HOJA))).toHaveLength(1);
    expect(repartirEnHojas(series(15))[0]).toHaveLength(15);
  });

  it('la numero 16 abre una segunda hoja, con una sola adentro', () => {
    const hojas = repartirEnHojas(series(16));

    expect(hojas).toHaveLength(2);
    expect(hojas[0]).toHaveLength(15);
    expect(hojas[1]).toHaveLength(1);
  });

  it('30 dan dos hojas exactas, y 31 abren la tercera', () => {
    expect(repartirEnHojas(series(30)).map((h) => h.length)).toEqual([15, 15]);
    expect(repartirEnHojas(series(31)).map((h) => h.length)).toEqual([15, 15, 1]);
  });

  it('no pierde ni repite ninguna, y respeta el orden', () => {
    const todas = series(37);
    const aplanadas = repartirEnHojas(todas).flat();

    expect(aplanadas).toEqual(todas);
    expect(new Set(aplanadas).size).toBe(37);
  });

  it('acepta otro tamano de hoja', () => {
    expect(repartirEnHojas(series(5), 2).map((h) => h.length)).toEqual([2, 2, 1]);
  });

  it('no acepta una hoja donde no entra nada', () => {
    expect(() => repartirEnHojas(series(3), 0)).toThrow(/al menos una/);
    expect(() => repartirEnHojas(series(3), -1)).toThrow(/al menos una/);
  });
});

describe('altoDeHojaMm', () => {
  it('cuenta las filas que de verdad se usan', () => {
    expect(altoDeHojaMm(1)).toBe(ALTO_ETIQUETA_MM);
    expect(altoDeHojaMm(COLUMNAS)).toBe(ALTO_ETIQUETA_MM);
    expect(altoDeHojaMm(COLUMNAS + 1)).toBe(ALTO_ETIQUETA_MM * 2);
    expect(altoDeHojaMm(ETIQUETAS_POR_HOJA)).toBe(ALTO_ETIQUETA_MM * 5);
  });
});

describe('las medidas entran en una A4', () => {
  it('tres columnas de 63 mm entran en los 190 mm utiles', () => {
    // A4 son 210 mm, menos 10 de margen de cada lado.
    expect(COLUMNAS * ANCHO_ETIQUETA_MM).toBeLessThanOrEqual(190);
  });

  it('cinco filas de 55 mm entran en los 277 mm utiles', () => {
    // A4 son 297 mm de alto, menos 10 de margen arriba y abajo.
    expect(5 * ALTO_ETIQUETA_MM).toBeLessThanOrEqual(277);
  });
});
