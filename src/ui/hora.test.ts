import { describe, expect, it } from 'vitest';

import { cuandoEnFrase } from './hora';

const HOY = '2026-11-06';

describe('cuandoEnFrase', () => {
  it.each([
    ['2026-11-06T17:20:00+00:00', 'hoy a las 14:20'],
    ['2026-11-06T02:30:00+00:00', 'ayer a las 23:30'],
    ['2026-11-05T12:05:00.123456+00:00', 'ayer a las 09:05'],
    ['2026-11-03T15:00:00+00:00', 'el 03/11'],
  ])('%s → "%s", en hora de Montevideo', (creadoEn, esperado) => {
    expect(cuandoEnFrase(creadoEn, HOY)).toBe(esperado);
  });

  it('un texto que no es fecha no rompe nada', () => {
    expect(cuandoEnFrase('cualquier cosa', HOY)).toBe('');
  });
});
