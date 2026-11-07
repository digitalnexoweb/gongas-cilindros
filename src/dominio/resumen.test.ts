import { describe, expect, it } from 'vitest';

import { calcularArriendo, type FechaISO } from './arriendo';
import { estadoDemo } from './storage';
import type { Cliente } from './tipos';
import {
  csvDelResumen,
  diasFacturablesEnMes,
  importeEnMes,
  mesDe,
  mesSiguiente,
  mesesConMovimiento,
  nombreArchivoCSV,
  nombreDelMes,
  primerDiaDelMes,
  resumenDelMes,
  ultimoDiaDelMes,
  type ResumenMensual,
} from './resumen';

const HOY: FechaISO = '2026-11-06';

function arriendo(fechaEntrega: FechaISO, fechaDevolucion: FechaISO | null = null) {
  return { fechaEntrega, fechaDevolucion };
}

// ─────────────────────────────────────────── Los bordes del mes

describe('los limites de un mes', () => {
  it('sabe cuando termina cada mes, febrero incluido', () => {
    expect(ultimoDiaDelMes('2026-01')).toBe('2026-01-31');
    expect(ultimoDiaDelMes('2026-02')).toBe('2026-02-28');
    expect(ultimoDiaDelMes('2024-02')).toBe('2024-02-29');
    expect(ultimoDiaDelMes('2026-04')).toBe('2026-04-30');
    expect(ultimoDiaDelMes('2026-12')).toBe('2026-12-31');
  });

  it('arma el primer dia y el mes siguiente', () => {
    expect(primerDiaDelMes('2026-11')).toBe('2026-11-01');
    expect(mesSiguiente('2026-11')).toBe('2026-12');
    expect(mesSiguiente('2026-12')).toBe('2027-01');
  });

  it('saca el mes de una fecha', () => {
    expect(mesDe('2026-11-06')).toBe('2026-11');
    expect(mesDe('2026-01-01')).toBe('2026-01');
  });

  it('nombra el mes en castellano', () => {
    expect(nombreDelMes('2026-11')).toBe('noviembre de 2026');
    expect(nombreDelMes('2026-01')).toBe('enero de 2026');
  });

  it('rechaza meses que no existen', () => {
    expect(() => ultimoDiaDelMes('2026-13')).toThrow(/inexistente/);
    expect(() => ultimoDiaDelMes('2026-00')).toThrow(/inexistente/);
    expect(() => ultimoDiaDelMes('noviembre')).toThrow(/inválido/);
    expect(() => ultimoDiaDelMes('2026-1')).toThrow(/inválido/);
  });
});

// ─────────────────────────────────────────── El devengado del mes

describe('diasFacturablesEnMes', () => {
  // Entregado el 06/08, sin devolver: el cargo arranca el 06/10, el dia 61.
  const abierto = arriendo('2026-08-06');

  it('da cero en los meses enteramente dentro de la gracia', () => {
    expect(diasFacturablesEnMes(abierto, '2026-08', HOY)).toBe(0);
    expect(diasFacturablesEnMes(abierto, '2026-09', HOY)).toBe(0);
  });

  it('cuenta solo desde el dia 61 en el mes donde cae', () => {
    // Del 06/10 al 31/10 son 26 dias.
    expect(diasFacturablesEnMes(abierto, '2026-10', HOY)).toBe(26);
  });

  it('corta en hoy, no sigue hasta fin de mes', () => {
    // Del 01/11 al 06/11 son 6 dias.
    expect(diasFacturablesEnMes(abierto, '2026-11', HOY)).toBe(6);
  });

  it('da cero en los meses posteriores a hoy', () => {
    expect(diasFacturablesEnMes(abierto, '2026-12', HOY)).toBe(0);
    expect(diasFacturablesEnMes(abierto, '2027-01', HOY)).toBe(0);
  });

  it('corta en la devolucion cuando el arriendo esta cerrado', () => {
    // Entregado el 18/08, devuelto el 27/10: cobra del 18/10 al 27/10.
    const cerrado = arriendo('2026-08-18', '2026-10-27');

    expect(diasFacturablesEnMes(cerrado, '2026-10', HOY)).toBe(10);
    expect(diasFacturablesEnMes(cerrado, '2026-11', HOY)).toBe(0);
  });

  it('cuenta el mes entero cuando queda adentro de la ventana', () => {
    const viejo = arriendo('2026-01-01');

    expect(diasFacturablesEnMes(viejo, '2026-06', HOY)).toBe(30);
    expect(diasFacturablesEnMes(viejo, '2026-07', HOY)).toBe(31);
  });

  it('cuenta bien febrero de un anio bisiesto', () => {
    // Entregado el 20/12/2023: el cargo arranca el 19/02/2024.
    const cruzado = arriendo('2023-12-20');

    // Del 19/02 al 29/02 son 11 dias, porque 2024 es bisiesto.
    expect(diasFacturablesEnMes(cruzado, '2024-02', '2024-06-01')).toBe(11);
  });

  it('cuenta bien un arriendo que cruza el cambio de anio', () => {
    const cruzado = arriendo('2026-10-20');
    const hoy = '2027-02-01';

    const diciembre = diasFacturablesEnMes(cruzado, '2026-12', hoy);
    const enero = diasFacturablesEnMes(cruzado, '2027-01', hoy);
    const febrero = diasFacturablesEnMes(cruzado, '2027-02', hoy);

    expect(diciembre).toBe(12);
    expect(enero).toBe(31);
    expect(febrero).toBe(1);
    expect(diciembre + enero + febrero).toBe(44);
  });
});

// ─────────── La propiedad que amarra el resumen al reloj del punto 1

describe('los meses suman el acumulado', () => {
  it('para cada arriendo de la demo, la suma de los meses es su importe de siempre', () => {
    // Si esta propiedad se rompe, el resumen y la ficha del cilindro muestran
    // numeros distintos para la misma plata.
    const estado = estadoDemo(HOY);
    const meses = mesesConMovimiento(estado, HOY);

    for (const arr of estado.arriendos) {
      const cilindro = estado.cilindros.find((c) => c.id === arr.cilindroId);
      if (cilindro === undefined) throw new Error('arriendo sin cilindro');

      const diasPorMeses = meses.reduce((s, m) => s + diasFacturablesEnMes(arr, m, HOY), 0);
      const importePorMeses = meses.reduce(
        (s, m) => s + importeEnMes(arr, cilindro.tarifaMensual, m, HOY),
        0,
      );
      const deSiempre = calcularArriendo(arr, cilindro.tarifaMensual, HOY);

      expect(diasPorMeses).toBe(deSiempre.diasFacturables);
      expect(importePorMeses).toBe(deSiempre.importe);
    }
  });

  it('CIL-00101 reparte sus $ 469 entre octubre y noviembre', () => {
    const estado = estadoDemo(HOY);
    const cil = estado.cilindros.find((c) => c.serie === 'CIL-00101');
    const arr = estado.arriendos.find((a) => a.cilindroId === cil?.id);
    if (cil === undefined || arr === undefined) throw new Error('falta CIL-00101');

    const octubre = importeEnMes(arr, cil.tarifaMensual, '2026-10', HOY);
    const noviembre = importeEnMes(arr, cil.tarifaMensual, '2026-11', HOY);

    expect(octubre).toBe(381);
    expect(noviembre).toBe(88);
    expect(octubre + noviembre).toBe(469);
  });
});

// ─────────────────────────────────────────── El resumen por cliente

describe('resumenDelMes', () => {
  it('octubre da $ 640, con ANCAP y Taller Pereira', () => {
    const resumen = resumenDelMes(estadoDemo(HOY), '2026-10', HOY);

    expect(resumen.filas.map((f) => f.cliente.nombre)).toEqual(['ANCAP', 'Taller Pereira']);
    expect(resumen.filas[0]).toMatchObject({ cilindros: 2, diasFacturables: 35, total: 513 });
    expect(resumen.filas[1]).toMatchObject({ cilindros: 1, diasFacturables: 10, total: 127 });
    expect(resumen.total).toBe(640);
  });

  it('noviembre da $ 176, solo ANCAP', () => {
    const resumen = resumenDelMes(estadoDemo(HOY), '2026-11', HOY);

    expect(resumen.filas.map((f) => f.cliente.nombre)).toEqual(['ANCAP']);
    expect(resumen.filas[0]).toMatchObject({ cilindros: 2, diasFacturables: 12, total: 176 });
    expect(resumen.total).toBe(176);
  });

  it('un mes sin cargos no trae filas', () => {
    const resumen = resumenDelMes(estadoDemo(HOY), '2026-09', HOY);

    expect(resumen.filas).toEqual([]);
    expect(resumen.total).toBe(0);
  });

  it('el total es la suma de las filas', () => {
    for (const mes of ['2026-09', '2026-10', '2026-11']) {
      const resumen = resumenDelMes(estadoDemo(HOY), mes, HOY);
      expect(resumen.total).toBe(resumen.filas.reduce((s, f) => s + f.total, 0));
    }
  });

  it('deja afuera a los clientes sin cargos en el mes', () => {
    // Armada Nacional tiene CIL-00103 con 58 dias: todavia no cobra nada.
    const resumen = resumenDelMes(estadoDemo(HOY), '2026-11', HOY);
    expect(resumen.filas.map((f) => f.cliente.nombre)).not.toContain('Armada Nacional');
  });
});

describe('mesesConMovimiento', () => {
  it('va del movimiento mas viejo hasta hoy, sin huecos y el actual primero', () => {
    const estado = estadoDemo(HOY);
    const meses = mesesConMovimiento(estado, HOY);

    expect(meses[0]).toBe('2026-11');
    expect(meses).toEqual(['2026-11', '2026-10', '2026-09', '2026-08']);
  });

  it('sin movimientos, devuelve solo el mes actual', () => {
    const vacio = { ...estadoDemo(HOY), movimientos: [] };
    expect(mesesConMovimiento(vacio, HOY)).toEqual(['2026-11']);
  });
});

// ─────────────────────────────────────────── El CSV del criterio 9.8

describe('csvDelResumen', () => {
  const cliente = (nombre: string): Cliente => ({
    id: nombre,
    nombre,
    tipo: 'empresa',
    documento: '1',
    telefono: '+598',
  });

  const resumen: ResumenMensual = {
    mes: '2026-10',
    filas: [
      { cliente: cliente('ANCAP'), cilindros: 2, diasFacturables: 35, total: 513 },
      { cliente: cliente('Taller Pereira'), cilindros: 1, diasFacturables: 10, total: 127 },
    ],
    total: 640,
  };

  it('usa punto y coma, que es lo que espera Excel en espanol', () => {
    const csv = csvDelResumen(resumen);

    expect(csv.split('\r\n')[0]).toBe('Cliente;Cilindros;Días facturables;Total');
    expect(csv).toContain('ANCAP;2;35;513');
    expect(csv).toContain('Taller Pereira;1;10;127');
  });

  it('cierra con la fila del total general', () => {
    expect(csvDelResumen(resumen).split('\r\n').at(-1)).toBe('TOTAL;;;640');
  });

  it('separa las lineas con CRLF', () => {
    expect(csvDelResumen(resumen).split('\r\n')).toHaveLength(4);
  });

  it('escapa los nombres que traen punto y coma o comillas', () => {
    const conflictivo: ResumenMensual = {
      mes: '2026-10',
      filas: [
        { cliente: cliente('Gases; del Sur'), cilindros: 1, diasFacturables: 5, total: 60 },
        { cliente: cliente('Taller "El Rayo"'), cilindros: 1, diasFacturables: 5, total: 60 },
      ],
      total: 120,
    };

    const csv = csvDelResumen(conflictivo);

    expect(csv).toContain('"Gases; del Sur";1;5;60');
    expect(csv).toContain('"Taller ""El Rayo""";1;5;60');
  });

  it('un mes sin cargos sale con encabezado y total en cero', () => {
    const vacio: ResumenMensual = { mes: '2026-09', filas: [], total: 0 };
    expect(csvDelResumen(vacio).split('\r\n')).toEqual([
      'Cliente;Cilindros;Días facturables;Total',
      'TOTAL;;;0',
    ]);
  });

  it('nombra el archivo con el mes adentro', () => {
    expect(nombreArchivoCSV('2026-11')).toBe('gongas-resumen-2026-11.csv');
  });
});
