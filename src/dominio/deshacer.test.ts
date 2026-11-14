import { describe, expect, it } from 'vitest';

import { alDeshacer, sePuedeDeshacer } from './consultas';
import type { Arriendo, EstadoApp, Movimiento } from './tipos';

/**
 * Un cilindro, dos clientes y una historia armada a mano, igual a como la deja
 * la base con abierto_por y cerrado_por (migración 0016).
 */
function estado(movimientos: Movimiento[], arriendos: Arriendo[], avisoEn?: string): EstadoApp {
  return {
    version: 1,
    operador: 'Ana',
    clientes: [
      { id: 'ancap', nombre: 'ANCAP', tipo: 'empresa', documento: '', telefono: '' },
      { id: 'armada', nombre: 'Armada', tipo: 'empresa', documento: '', telefono: '' },
    ],
    cilindros: [{ id: 'c1', serie: '729026', tipoGas: 'Acetileno', kg: 4, tarifaMensual: null, activo: true }],
    arriendos,
    movimientos,
    avisos:
      avisoEn === undefined
        ? []
        : [
            {
              id: 'v1',
              arriendoId: avisoEn,
              cilindroId: 'c1',
              clienteId: 'ancap',
              dias: 55,
              canal: 'whatsapp',
              etapa: 'por_vencer',
              destino: null,
              operador: 'Ana',
              creadoEn: '2026-11-14T12:00:00Z',
            },
          ],
  } as EstadoApp;
}

function mov(id: string, tipo: Movimiento['tipo'], clienteId: string | null, deshecho = false): Movimiento {
  return {
    id,
    tipo,
    cilindroId: 'c1',
    clienteId,
    fecha: '2026-11-14',
    loteId: `lote-${id}`,
    operador: 'Ana',
    ...(deshecho ? { deshecho: { operador: 'Ana', creadoEn: '2026-11-14T13:00:00Z' } } : {}),
  };
}

function arriendo(id: string, clienteId: string, abiertoPor: string, cerradoPor: string | null = null): Arriendo {
  return {
    id,
    cilindroId: 'c1',
    clienteId,
    fechaEntrega: '2026-11-14',
    fechaDevolucion: cerradoPor === null ? null : '2026-11-14',
    abiertoPor,
    cerradoPor,
  };
}

describe('sePuedeDeshacer', () => {
  it('el último movimiento del cilindro, sí', () => {
    const e = estado([mov('m1', 'entrega', 'ancap')], [arriendo('a1', 'ancap', 'm1')]);
    expect(sePuedeDeshacer(e, 'm1')).toBe(true);
  });

  it('uno que tuvo otro movimiento después, no', () => {
    const e = estado(
      [mov('m1', 'entrega', 'ancap'), mov('m2', 'devolucion', 'ancap')],
      [arriendo('a1', 'ancap', 'm1', 'm2')],
    );
    expect(sePuedeDeshacer(e, 'm1')).toMatch(/otro movimiento después/);
    expect(sePuedeDeshacer(e, 'm2')).toBe(true);
  });

  it('si el último se deshizo, el anterior pasa a ser el último', () => {
    const e = estado(
      [mov('m1', 'entrega', 'ancap'), mov('m2', 'devolucion', 'ancap', true)],
      [arriendo('a1', 'ancap', 'm1')],
    );
    expect(sePuedeDeshacer(e, 'm1')).toBe(true);
    expect(sePuedeDeshacer(e, 'm2')).toBe('Ya se deshizo.');
  });

  it('una entrega de la que ya se avisó, no', () => {
    const e = estado([mov('m1', 'entrega', 'ancap')], [arriendo('a1', 'ancap', 'm1')], 'a1');
    expect(sePuedeDeshacer(e, 'm1')).toMatch(/aviso/);
  });

  it('un movimiento que no existe', () => {
    expect(sePuedeDeshacer(estado([], []), 'nada')).toMatch(/no existe/);
  });
});

describe('alDeshacer', () => {
  it('una entrega nueva: vuelve al stock', () => {
    const e = estado([mov('m1', 'entrega', 'ancap')], [arriendo('a1', 'ancap', 'm1')]);
    expect(alDeshacer(e, 'm1')).toBe('Vuelve al stock');
  });

  it('una entrega que lo sacó de otro cliente: vuelve a ese cliente', () => {
    const e = estado(
      [mov('m1', 'entrega', 'ancap'), mov('m2', 'entrega', 'armada')],
      [arriendo('a1', 'ancap', 'm1', 'm2'), arriendo('a2', 'armada', 'm2')],
    );
    expect(alDeshacer(e, 'm2')).toBe('Vuelve a ANCAP');
  });

  it('una devolución: vuelve al cliente', () => {
    const e = estado(
      [mov('m1', 'entrega', 'ancap'), mov('m2', 'devolucion', 'ancap')],
      [arriendo('a1', 'ancap', 'm1', 'm2')],
    );
    expect(alDeshacer(e, 'm2')).toBe('Vuelve a ANCAP');
  });

  it('una devolución de algo que ya estaba en stock: sigue en stock', () => {
    const e = estado([mov('m1', 'devolucion', null)], []);
    expect(alDeshacer(e, 'm1')).toBe('Sigue en stock');
  });

  it('"ya estaba en este cliente": sigue ahí', () => {
    const e = estado(
      [mov('m1', 'entrega', 'ancap'), mov('m2', 'entrega', 'ancap')],
      [arriendo('a1', 'ancap', 'm1')],
    );
    expect(alDeshacer(e, 'm2')).toBe('Sigue en ANCAP');
  });
});
