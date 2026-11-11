import { describe, expect, it } from 'vitest';

import { estadoDemo } from '../dominio/storage';
import { vistaCilindros } from '../dominio/consultas';
import { paraCobrar } from './paraCobrar';

const HOY = '2026-11-06';

describe('paraCobrar', () => {
  it('cuenta solo los que ya generan cargo, y suma lo que acumulan', () => {
    const estado = estadoDemo(HOY);
    const enCargo = vistaCilindros(estado, HOY).filter((v) => v.calculo?.estado === 'generando_cargo');

    const resultado = paraCobrar(estado, HOY);

    expect(resultado.cantidad).toBe(enCargo.length);
    expect(resultado.cantidad).toBeGreaterThan(0);
    expect(resultado.total).toBe(enCargo.reduce((s, v) => s + (v.calculo?.importe ?? 0), 0));
  });

  it('para un empleado, sin tarifas, da la cantidad y no el total', () => {
    const conPlata = estadoDemo(HOY);
    const sinPlata = {
      ...conPlata,
      cilindros: conPlata.cilindros.map((c) => ({ ...c, tarifaMensual: null })),
    };

    expect(paraCobrar(sinPlata, HOY)).toEqual({
      cantidad: paraCobrar(conPlata, HOY).cantidad,
      total: null,
    });
  });

  it('sin nada en cargo, cero y cero', () => {
    const estado = { ...estadoDemo(HOY), arriendos: [] };

    expect(paraCobrar(estado, HOY)).toEqual({ cantidad: 0, total: 0 });
  });
});
