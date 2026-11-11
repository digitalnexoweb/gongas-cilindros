import { describe, expect, it } from 'vitest';

import type { EstadoApp, Movimiento } from '../../dominio/tipos';
import { ultimosLotes } from './ultimosLotes';

const HOY = '2026-11-06';

let siguiente = 0;
function mov(datos: Partial<Movimiento> & Pick<Movimiento, 'loteId'>): Movimiento {
  siguiente += 1;
  return {
    id: `m-${siguiente}`,
    tipo: 'entrega',
    cilindroId: `c-${siguiente}`,
    clienteId: 'k-ancap',
    fecha: HOY,
    operador: 'Joaquín',
    ...datos,
  };
}

/** Los movimientos van del más viejo al más nuevo, como los deja `armarEstado`. */
function estadoCon(movimientos: Movimiento[]): EstadoApp {
  return {
    version: 1,
    operador: 'Joaquín',
    clientes: [
      { id: 'k-ancap', nombre: 'ANCAP', tipo: 'empresa', documento: '', telefono: '' },
      { id: 'k-armada', nombre: 'Armada', tipo: 'empresa', documento: '', telefono: '' },
    ],
    cilindros: [],
    arriendos: [],
    movimientos,
  };
}

describe('ultimosLotes', () => {
  it('agrupa los movimientos por lote, del más nuevo al más viejo', () => {
    const estado = estadoCon([
      mov({ loteId: 'l-1', creadoEn: '2026-11-06T12:00:00+00:00' }),
      mov({ loteId: 'l-1', creadoEn: '2026-11-06T12:00:00+00:00' }),
      mov({ loteId: 'l-2', tipo: 'devolucion', clienteId: 'k-armada', creadoEn: '2026-11-06T13:00:00+00:00' }),
    ]);

    expect(ultimosLotes(estado, HOY)).toEqual([
      { loteId: 'l-2', tipo: 'devolucion', cliente: 'Armada', cantidad: 1, cuando: 'Hoy 10:00' },
      { loteId: 'l-1', tipo: 'entrega', cliente: 'ANCAP', cantidad: 2, cuando: 'Hoy 09:00' },
    ]);
  });

  it('muestra la hora de Montevideo, no la de UTC', () => {
    const estado = estadoCon([mov({ loteId: 'l-1', creadoEn: '2026-11-06T17:20:00+00:00' })]);

    expect(ultimosLotes(estado, HOY)[0]?.cuando).toBe('Hoy 14:20');
  });

  it('entiende el formato con microsegundos que manda la base', () => {
    const estado = estadoCon([mov({ loteId: 'l-1', creadoEn: '2026-11-06T17:20:33.123456+00:00' })]);

    expect(ultimosLotes(estado, HOY)[0]?.cuando).toBe('Hoy 14:20');
  });

  it('a las 23:30 de ayer en Montevideo es "Ayer", aunque en UTC ya sea hoy', () => {
    const estado = estadoCon([mov({ loteId: 'l-1', fecha: '2026-11-05', creadoEn: '2026-11-06T02:30:00+00:00' })]);

    expect(ultimosLotes(estado, HOY)[0]?.cuando).toBe('Ayer');
  });

  it('a las 00:30 de hoy en Montevideo es hoy, aunque en UTC sea la misma noche', () => {
    const estado = estadoCon([mov({ loteId: 'l-1', creadoEn: '2026-11-06T03:30:00+00:00' })]);

    expect(ultimosLotes(estado, HOY)[0]?.cuando).toBe('Hoy 00:30');
  });

  it('más atrás, el día y el mes', () => {
    const estado = estadoCon([mov({ loteId: 'l-1', fecha: '2026-11-03', creadoEn: '2026-11-03T15:00:00+00:00' })]);

    expect(ultimosLotes(estado, HOY)[0]?.cuando).toBe('03/11');
  });

  it('sin la hora de la base, como en la demo, se arregla con la fecha', () => {
    const estado = estadoCon([
      mov({ loteId: 'l-1', fecha: '2026-10-20' }),
      mov({ loteId: 'l-2', fecha: '2026-11-05' }),
      mov({ loteId: 'l-3' }),
    ]);

    expect(ultimosLotes(estado, HOY).map((l) => l.cuando)).toEqual(['Hoy', 'Ayer', '20/10']);
  });

  it('una recepción de varios clientes, o de un cilindro que ya estaba en stock', () => {
    const estado = estadoCon([
      mov({ loteId: 'l-1', tipo: 'devolucion', clienteId: 'k-ancap' }),
      mov({ loteId: 'l-1', tipo: 'devolucion', clienteId: 'k-armada' }),
      mov({ loteId: 'l-2', tipo: 'devolucion', clienteId: null }),
    ]);

    expect(ultimosLotes(estado, HOY).map((l) => l.cliente)).toEqual(['Sin cliente', 'Varios clientes']);
  });

  it('trae solo los cinco más recientes', () => {
    const estado = estadoCon(['l-1', 'l-2', 'l-3', 'l-4', 'l-5', 'l-6', 'l-7'].map((loteId) => mov({ loteId })));

    expect(ultimosLotes(estado, HOY).map((l) => l.loteId)).toEqual(['l-7', 'l-6', 'l-5', 'l-4', 'l-3']);
  });

  it('sin movimientos, la lista está vacía', () => {
    expect(ultimosLotes(estadoCon([]), HOY)).toEqual([]);
  });
});
