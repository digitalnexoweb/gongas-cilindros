import { describe, expect, it } from 'vitest';

import { vistaCilindros } from '../../dominio/consultas';
import {
  cargoPorDia,
  devengadoPorMes,
  empiezanACobrar,
  mesAnterior,
  proyeccionDelMes,
  resumenDelMes,
  ultimosMeses,
  variacion,
} from '../../dominio/resumen';
import { filtrarCilindros } from '../pantallas/filtroCilindros';
import { estadoDePrueba, estadoSinTarifas, HOY } from './fixture';
import { conteoDeHoy, movimientoDelMes, stockPorGasYPeso } from './panel';

describe('los meses para atrás', () => {
  it('el anterior, cruzando el año', () => {
    expect(mesAnterior('2026-11')).toBe('2026-10');
    expect(mesAnterior('2026-01')).toBe('2025-12');
  });

  it('los últimos seis, del más viejo al más nuevo', () => {
    expect(ultimosMeses('2026-02', 6)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('la plata del panel', () => {
  const estado = estadoDePrueba();

  it('lo devengado a hoy: solo A, del 1 al 17', () => {
    expect(resumenDelMes(estado, '2026-11', HOY)?.total).toBe(170);
  });

  it('la proyección suma A hasta el 30 y B desde el 20', () => {
    // A: 30 días × $ 10. B: del 20 al 30, 11 días × $ 10.
    expect(proyeccionDelMes(estado, '2026-11', HOY)).toBe(410);
  });

  it('un mes cerrado no tiene proyección', () => {
    expect(proyeccionDelMes(estado, '2026-10', HOY)).toBeNull();
  });

  it('el devengado de cada mes', () => {
    expect(devengadoPorMes(estado, ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'], HOY)).toEqual([
      { mes: '2026-08', total: 10 },
      { mes: '2026-09', total: 300 },
      { mes: '2026-10', total: 150 },
      { mes: '2026-11', total: 170 },
      { mes: '2026-12', total: 0 },
    ]);
  });

  it('la variación en por ciento, y sin base no hay porcentaje', () => {
    expect(variacion(410, 150)).toBe(173);
    expect(variacion(90, 100)).toBe(-10);
    expect(variacion(500, 0)).toBeNull();
  });

  it('hoy corre solo A, $ 10 por día', () => {
    expect(cargoPorDia(estado, HOY)).toBe(10);
  });

  it('B empieza a cobrar esta semana', () => {
    expect(empiezanACobrar(estado, HOY)).toEqual({ cantidad: 1, porDia: 10 });
    // Hasta el 19 todavía no: B arranca el 20.
    expect(empiezanACobrar(estado, HOY, 2)).toEqual({ cantidad: 0, porDia: 0 });
  });

  it('el día que empieza a cobrar ya corre, y deja de ser "lo que viene"', () => {
    expect(cargoPorDia(estado, '2026-11-20')).toBe(20);
    expect(empiezanACobrar(estado, '2026-11-20').cantidad).toBe(0);
  });

  it('sin tarifas visibles, nada de plata da un número a medias', () => {
    const sinTarifas = estadoSinTarifas();
    expect(proyeccionDelMes(sinTarifas, '2026-11', HOY)).toBeNull();
    expect(devengadoPorMes(sinTarifas, ['2026-10', '2026-11'], HOY)).toBeNull();
    expect(cargoPorDia(sinTarifas, HOY)).toBeNull();
    // La cantidad sí se ve; la plata no.
    expect(empiezanACobrar(sinTarifas, HOY)).toEqual({ cantidad: 1, porDia: null });
  });
});

describe('conteoDeHoy', () => {
  const vistas = vistaCilindros(estadoDePrueba(), HOY);

  it('cuenta cada estado, sin los dados de baja', () => {
    expect(conteoDeHoy(vistas)).toEqual({
      total: 4,
      enClientes: 2,
      stock: 2,
      en_gracia: 0,
      por_vencer: 1,
      generando_cargo: 1,
    });
  });

  it('da lo mismo que filtrar Cilindros por ese estado', () => {
    const conteo = conteoDeHoy(vistas);
    for (const estado of ['stock', 'en_gracia', 'por_vencer', 'generando_cargo'] as const) {
      const filtrados = filtrarCilindros(vistas, { estado, gas: null, kg: null, texto: '' });
      expect(filtrados.length).toBe(conteo[estado]);
    }
  });

  it('lo ve igual quien no puede ver tarifas', () => {
    expect(conteoDeHoy(vistaCilindros(estadoSinTarifas(), HOY))).toEqual(conteoDeHoy(vistas));
  });
});

describe('stockPorGasYPeso', () => {
  it('una fila por gas y peso, sin los dados de baja', () => {
    expect(stockPorGasYPeso(vistaCilindros(estadoDePrueba(), HOY))).toEqual([
      { gas: 'Acetileno', kg: 4, enStock: 2, enClientes: 0 },
      { gas: 'CO2', kg: 7, enStock: 0, enClientes: 2 },
    ]);
  });
});

describe('movimientoDelMes', () => {
  const nov = movimientoDelMes(estadoDePrueba(), '2026-11');

  it('cuenta entregas y devoluciones del mes, sin los deshechos', () => {
    expect(nov.entregas).toBe(2);
    expect(nov.devoluciones).toBe(1);
  });

  it('los avisos van al día de Montevideo', () => {
    expect(nov.avisosWhatsapp).toBe(1);
    expect(nov.avisosMail).toBe(1);
    expect(movimientoDelMes(estadoDePrueba(), '2026-10').avisosMail).toBe(1);
  });

  it('parte el mes en semanas de siete días', () => {
    expect(nov.semanas.map((s) => [s.desde, s.hasta, s.entregas, s.devoluciones])).toEqual([
      ['2026-11-01', '2026-11-07', 1, 0],
      ['2026-11-08', '2026-11-14', 0, 1],
      ['2026-11-15', '2026-11-21', 0, 0],
      ['2026-11-22', '2026-11-28', 0, 0],
      ['2026-11-29', '2026-11-30', 1, 0],
    ]);
  });

  it('febrero tiene cuatro semanas justas', () => {
    expect(movimientoDelMes(estadoDePrueba(), '2026-02').semanas).toHaveLength(4);
  });
});
