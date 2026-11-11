import { describe, expect, it } from 'vitest';

import { leerMonto } from './Formulario';

describe('leerMonto', () => {
  it.each([
    ['480', 480],
    [' 480 ', 480],
    ['$ 480', 480],
    ['1.250', 1250],
    ['1.250,50', 1250.5],
    ['380,5', 380.5],
    ['0', 0],
  ])('lee "%s" como %d', (texto, esperado) => {
    expect(leerMonto(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '-5', '12,345', '4 80x'])('"%s" no es un monto', (texto) => {
    expect(leerMonto(texto)).toBeNull();
  });
});
