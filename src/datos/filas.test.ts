import { describe, expect, it } from 'vitest';

import { historialDe, vistaCilindros, vistaClientes } from '../dominio/consultas';
import { resumenDelMes } from '../dominio/resumen';
import { armarEstado, type Filas } from './filas';

const HOY = '2026-11-06';

/** Lo que devolvería la base para Joaquín: los mismos números de la demo. */
function filasDeJoaquin(): Filas {
  return {
    clientes: [
      { id: 'k-ancap', nombre: 'ANCAP', tipo: 'empresa', documento: '211003420017', telefono: '+59899100101' },
      { id: 'k-pereira', nombre: 'Taller Pereira', tipo: 'particular', documento: '41234567', telefono: '' },
    ],
    cilindros: [
      { id: 'c-1', serie: 'CIL-00001', tipo_gas: 'acetileno', tamano: 'grande', activo: true },
      { id: 'c-2', serie: 'CIL-00002', tipo_gas: 'acetileno', tamano: 'chico', activo: true },
      { id: 'c-3', serie: 'CIL-00003', tipo_gas: 'acetileno', tamano: 'chico', activo: true },
    ],
    tarifas: [
      { cilindro_id: 'c-1', tarifa_mensual: 440 },
      // `numeric` a veces llega como texto.
      { cilindro_id: 'c-2', tarifa_mensual: '380.00' },
      { cilindro_id: 'c-3', tarifa_mensual: '380.00' },
    ],
    arriendos: [
      { id: 'a-1', cilindro_id: 'c-1', cliente_id: 'k-ancap', fecha_entrega: '2026-08-06', fecha_devolucion: null },
      { id: 'a-2', cilindro_id: 'c-2', cliente_id: 'k-pereira', fecha_entrega: '2026-08-18', fecha_devolucion: '2026-10-27' },
    ],
    movimientos: [
      // Desordenados a propósito: la base no garantiza el orden.
      { id: 'm-3', tipo: 'devolucion', cilindro_id: 'c-2', cliente_id: 'k-pereira', fecha: '2026-10-27', lote_id: 'l-3', operador: 'Beto', creado_en: '2026-10-27T15:00:00+00:00' },
      { id: 'm-1', tipo: 'entrega', cilindro_id: 'c-1', cliente_id: 'k-ancap', fecha: '2026-08-06', lote_id: 'l-1', operador: 'Ana', creado_en: '2026-08-06T12:00:00+00:00' },
      { id: 'm-2', tipo: 'entrega', cilindro_id: 'c-2', cliente_id: 'k-pereira', fecha: '2026-08-18', lote_id: 'l-2', operador: 'Ana', creado_en: '2026-08-18T12:00:00+00:00' },
    ],
  };
}

/** Lo mismo, como lo recibe un empleado: sin una sola tarifa. */
function filasDeEmpleado(): Filas {
  return { ...filasDeJoaquin(), tarifas: [] };
}

describe('armarEstado', () => {
  it('pasa los nombres de columna de la base a los del dominio', () => {
    const estado = armarEstado(filasDeJoaquin(), 'Joaquín');

    expect(estado.operador).toBe('Joaquín');
    expect(estado.cilindros[0]).toEqual({
      id: 'c-1',
      serie: 'CIL-00001',
      tipoGas: 'acetileno',
      tamano: 'grande',
      tarifaMensual: 440,
      activo: true,
    });
    expect(estado.arriendos[0]).toEqual({
      id: 'a-1',
      cilindroId: 'c-1',
      clienteId: 'k-ancap',
      fechaEntrega: '2026-08-06',
      fechaDevolucion: null,
    });
  });

  it('convierte la tarifa a número, llegue como número o como texto', () => {
    const estado = armarEstado(filasDeJoaquin(), 'Joaquín');

    expect(estado.cilindros.map((c) => c.tarifaMensual)).toEqual([440, 380, 380]);
  });

  it('deja las fechas como texto YYYY-MM-DD, sin convertirlas', () => {
    const estado = armarEstado(filasDeJoaquin(), 'Joaquín');

    expect(estado.arriendos[1]?.fechaEntrega).toBe('2026-08-18');
    expect(estado.arriendos[1]?.fechaDevolucion).toBe('2026-10-27');
    expect(estado.movimientos.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.fecha))).toBe(true);
  });

  it('falla fuerte si una fecha llega con hora, en vez de correrla un día', () => {
    const filas = filasDeJoaquin();
    filas.arriendos[0]!.fecha_entrega = '2026-08-06T00:00:00+00:00';

    expect(() => armarEstado(filas, 'Joaquín')).toThrow(/Fecha inválida/);
  });

  it('trae el momento en que se grabó cada movimiento, para mostrar la hora', () => {
    const estado = armarEstado(filasDeJoaquin(), 'Joaquín');

    expect(estado.movimientos.map((m) => m.creadoEn)).toEqual([
      '2026-08-06T12:00:00+00:00',
      '2026-08-18T12:00:00+00:00',
      '2026-10-27T15:00:00+00:00',
    ]);
  });

  it('ordena los movimientos por el momento en que se grabaron', () => {
    const estado = armarEstado(filasDeJoaquin(), 'Joaquín');

    expect(estado.movimientos.map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-3']);
    expect(historialDe(estado, 'c-2').map((m) => m.tipo)).toEqual(['devolucion', 'entrega']);
  });

  it('con esa foto, el dominio da los números de siempre', () => {
    // CIL-00001 es grande y lleva 92 días al 06/11: los $ 469 del criterio 9.3.
    const estado = armarEstado(filasDeJoaquin(), 'Joaquín');
    const vista = vistaCilindros(estado, HOY).find((v) => v.cilindro.serie === 'CIL-00001');

    expect(vista?.calculo?.dias).toBe(92);
    expect(vista?.calculo?.importe).toBe(469);
    expect(resumenDelMes(estado, '2026-10', HOY)?.total).toBe(381 + 127);
  });
});

describe('armarEstado con los avisos de la etapa D', () => {
  it('trae los avisos ordenados y el texto editado', () => {
    const filas: Filas = {
      ...filasDeJoaquin(),
      avisos: [
        { id: 'v-2', arriendo_id: 'a-1', cilindro_id: 'c-1', cliente_id: 'k-ancap', dias: 92, operador: 'Joaquín', creado_en: '2026-11-06T15:00:00+00:00' },
        { id: 'v-1', arriendo_id: 'a-1', cilindro_id: 'c-1', cliente_id: 'k-ancap', dias: 85, operador: 'Ana', creado_en: '2026-10-30T15:00:00+00:00' },
      ],
      textosAviso: { con_cargo: 'Hola {cliente} {importe}', por_vencer: 'Hola {cliente}', copia_mail: 'info@gongas.test' },
    };

    const estado = armarEstado(filas, 'Joaquín');

    expect(estado.avisos?.map((a) => [a.operador, a.dias, a.arriendoId])).toEqual([
      ['Ana', 85, 'a-1'],
      ['Joaquín', 92, 'a-1'],
    ]);
    expect(estado.textosAviso).toEqual({
      conCargo: 'Hola {cliente} {importe}',
      porVencer: 'Hola {cliente}',
      copiaMail: 'info@gongas.test',
    });
    // Un aviso de antes de los mails se lee como WhatsApp, con su etapa según los días.
    expect(estado.avisos?.map((a) => [a.canal, a.etapa])).toEqual([
      ['whatsapp', 'con_cargo'],
      ['whatsapp', 'con_cargo'],
    ]);
  });

  it('sin fila de texto, no inventa uno: la app usa el original', () => {
    const estado = armarEstado({ ...filasDeJoaquin(), textosAviso: null }, 'Joaquín');
    expect(estado.textosAviso).toBeUndefined();
  });
});

describe('armarEstado para un empleado, sin tarifas', () => {
  it('deja la tarifa en null, que no es lo mismo que cero', () => {
    const estado = armarEstado(filasDeEmpleado(), 'Ana');

    expect(estado.cilindros.map((c) => c.tarifaMensual)).toEqual([null, null, null]);
  });

  it('el reloj anda igual y el importe no existe', () => {
    const estado = armarEstado(filasDeEmpleado(), 'Ana');
    const vista = vistaCilindros(estado, HOY).find((v) => v.cilindro.serie === 'CIL-00001');

    expect(vista?.calculo?.dias).toBe(92);
    expect(vista?.calculo?.estado).toBe('generando_cargo');
    expect(vista?.calculo?.importe).toBeNull();
  });

  it('ni el total del cliente ni el resumen del mes se pueden calcular', () => {
    const estado = armarEstado(filasDeEmpleado(), 'Ana');

    expect(vistaClientes(estado, HOY).find((v) => v.cliente.nombre === 'ANCAP')?.total).toBeNull();
    expect(resumenDelMes(estado, '2026-10', HOY)).toBeNull();
  });

  it('si la base entrega la tarifa de un solo cilindro, los demás siguen en null', () => {
    const filas: Filas = { ...filasDeJoaquin(), tarifas: [{ cilindro_id: 'c-1', tarifa_mensual: 440 }] };
    const estado = armarEstado(filas, 'Ana');

    expect(estado.cilindros.map((c) => c.tarifaMensual)).toEqual([440, null, null]);
  });
});
