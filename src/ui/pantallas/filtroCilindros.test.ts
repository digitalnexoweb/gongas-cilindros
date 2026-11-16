import { describe, expect, it } from 'vitest';

import type { VistaCilindro } from '../../dominio/consultas';
import { filtrarCilindros, opcionesDeFiltro, type FiltroCilindros } from './filtroCilindros';

function vista(serie: string, kg: number, tipoGas: string, activo = true): VistaCilindro {
  return {
    cilindro: { id: serie, serie, kg, tipoGas, tarifaMensual: null, activo },
    ubicacion: { lugar: 'stock' },
    arriendo: null,
    calculo: null,
  };
}

const vistas = [
  vista('729026', 4, 'Acetileno'),
  vista('1727274', 7, 'CO2'),
  vista('1727275', 4, 'CO2'),
  vista('12333', 2, 'Acetileno', false),
];

const todo: FiltroCilindros = { estado: 'todos', gas: null, kg: null, texto: '' };
const series = (f: Partial<FiltroCilindros>) => filtrarCilindros(vistas, { ...todo, ...f }).map((v) => v.cilindro.serie);

describe('filtrarCilindros', () => {
  it('sin filtros: todos los que están en uso', () => {
    expect(series({})).toEqual(['729026', '1727274', '1727275']);
  });

  it('por gas', () => {
    expect(series({ gas: 'CO2' })).toEqual(['1727274', '1727275']);
  });

  it('por peso', () => {
    expect(series({ kg: 4 })).toEqual(['729026', '1727275']);
  });

  it('gas y peso juntos', () => {
    expect(series({ gas: 'CO2', kg: 4 })).toEqual(['1727275']);
  });

  it('con el buscador', () => {
    expect(series({ gas: 'CO2', texto: '274' })).toEqual(['1727274']);
  });

  it('los dados de baja, solo con su filtro', () => {
    expect(series({ estado: 'de_baja' })).toEqual(['12333']);
    expect(series({ estado: 'de_baja', gas: 'CO2' })).toEqual([]);
  });

  it('por estado', () => {
    expect(series({ estado: 'stock' })).toEqual(['729026', '1727274', '1727275']);
    expect(series({ estado: 'por_vencer' })).toEqual([]);
  });
});

describe('opcionesDeFiltro', () => {
  it('los gases y pesos que hay, ordenados y sin repetir', () => {
    expect(opcionesDeFiltro(vistas)).toEqual({ gases: ['Acetileno', 'CO2'], pesos: [2, 4, 7] });
  });
});
