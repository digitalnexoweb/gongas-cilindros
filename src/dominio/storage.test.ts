import { describe, expect, it } from 'vitest';

import { diasEntre, sumarDias, type FechaISO } from './arriendo';
import { arriendoAbiertoDe, estaEnStock, ubicacionDe } from './consultas';
import {
  CLAVE_ALMACEN,
  almacenEnMemoria,
  altaCilindro,
  altaCliente,
  confirmarLote,
  estadoDemo,
  grabarEstado,
  inicializar,
  leerEstado,
  reiniciarDemo,
} from './storage';
import type { Arriendo, Cilindro, EstadoApp } from './tipos';

const HOY: FechaISO = '2026-11-05';
const OPERADOR = 'Joaquín';

function cilindro(estado: EstadoApp, serie: string): Cilindro {
  const encontrado = estado.cilindros.find((c) => c.serie === serie);
  if (encontrado === undefined) throw new Error(`No existe el cilindro ${serie}.`);
  return encontrado;
}

function arriendoAbierto(estado: EstadoApp, serie: string): Arriendo {
  const abierto = arriendoAbiertoDe(estado, cilindro(estado, serie).id);
  if (abierto === null) throw new Error(`${serie} no tiene arriendo abierto.`);
  return abierto;
}

// ────────────────────────────────── La semilla de la sección 7

describe('la semilla de demo', () => {
  it('crea los 3 clientes y los 7 cilindros, todos de acetileno', () => {
    const estado = estadoDemo(HOY);

    expect(estado.clientes.map((c) => c.nombre)).toEqual([
      'ANCAP',
      'Armada Nacional',
      'Taller Pereira',
    ]);
    expect(estado.cilindros).toHaveLength(7);
    expect(estado.cilindros.every((c) => c.tipoGas === 'acetileno')).toBe(true);
    expect(estado.cilindros.every((c) => c.activo)).toBe(true);
  });

  it('pone 380 a los chicos y 440 a los grandes', () => {
    const estado = estadoDemo(HOY);

    expect(cilindro(estado, 'CIL-00101').tarifaMensual).toBe(440);
    expect(cilindro(estado, 'CIL-00103').tarifaMensual).toBe(380);
  });

  it('deja 4 cilindros en clientes y 3 en stock', () => {
    const estado = estadoDemo(HOY);
    const enStock = estado.cilindros
      .filter((c) => estaEnStock(estado, c.id))
      .map((c) => c.serie);

    expect(enStock).toEqual(['CIL-00105', 'CIL-00106', 'CIL-00107']);
  });

  it('reparte los cilindros en los clientes que dice la seccion 7', () => {
    const estado = estadoDemo(HOY);
    const donde = (serie: string) => {
      const u = ubicacionDe(estado, cilindro(estado, serie).id);
      return u.lugar === 'cliente' ? u.cliente.nombre : 'stock';
    };

    expect(donde('CIL-00101')).toBe('ANCAP');
    expect(donde('CIL-00102')).toBe('ANCAP');
    expect(donde('CIL-00103')).toBe('Armada Nacional');
    expect(donde('CIL-00104')).toBe('Taller Pereira');
    expect(donde('CIL-00105')).toBe('stock');
  });

  it('calcula las fechas como hoy menos N dias, nunca fijas', () => {
    // El requisito de la seccion 7: la demo sigue siendo coherente la semana que viene.
    for (const hoy of ['2026-11-05', '2027-11-05', '2030-02-28']) {
      const estado = estadoDemo(hoy);

      expect(diasEntre(arriendoAbierto(estado, 'CIL-00101').fechaEntrega, hoy)).toBe(92);
      expect(diasEntre(arriendoAbierto(estado, 'CIL-00102').fechaEntrega, hoy)).toBe(75);
      expect(diasEntre(arriendoAbierto(estado, 'CIL-00103').fechaEntrega, hoy)).toBe(58);
      expect(diasEntre(arriendoAbierto(estado, 'CIL-00104').fechaEntrega, hoy)).toBe(20);
    }
  });

  it('CIL-00107 queda en stock, con su arriendo ya cerrado y su historial', () => {
    const estado = estadoDemo(HOY);
    const cil = cilindro(estado, 'CIL-00107');
    const arriendo = estado.arriendos.find((a) => a.cilindroId === cil.id);

    expect(estaEnStock(estado, cil.id)).toBe(true);
    expect(arriendo?.fechaDevolucion).toBe(sumarDias(HOY, -10));
    expect(arriendo?.clienteId).toBe('cli-pereira');
    expect(diasEntre(arriendo?.fechaEntrega ?? HOY, arriendo?.fechaDevolucion ?? HOY)).toBe(70);
    expect(estado.movimientos.filter((m) => m.cilindroId === cil.id)).toHaveLength(2);
  });

  it('graba un movimiento de entrega por cada arriendo', () => {
    const estado = estadoDemo(HOY);
    const entregas = estado.movimientos.filter((m) => m.tipo === 'entrega');

    expect(estado.arriendos).toHaveLength(5);
    expect(entregas).toHaveLength(5);
    expect(estado.movimientos.every((m) => m.operador === 'Joaquín')).toBe(true);
  });

  it('ordena los movimientos del mas viejo al mas nuevo', () => {
    const fechas = estadoDemo(HOY).movimientos.map((m) => m.fecha);
    expect([...fechas].sort()).toEqual(fechas);
  });
});

// ────────────────────────────────── Persistencia

describe('persistencia', () => {
  it('graba y lee sin perder nada', () => {
    const almacen = almacenEnMemoria();
    const estado = estadoDemo(HOY);

    grabarEstado(almacen, estado);

    expect(leerEstado(almacen)).toEqual(estado);
  });

  it('devuelve null si no hay nada guardado', () => {
    expect(leerEstado(almacenEnMemoria())).toBeNull();
  });

  it('devuelve null con JSON roto, en vez de explotar', () => {
    const almacen = almacenEnMemoria({ [CLAVE_ALMACEN]: '{esto no es json' });
    expect(leerEstado(almacen)).toBeNull();
  });

  it('devuelve null si el JSON es valido pero no es un estado', () => {
    expect(leerEstado(almacenEnMemoria({ [CLAVE_ALMACEN]: '{"version":99}' }))).toBeNull();
    expect(leerEstado(almacenEnMemoria({ [CLAVE_ALMACEN]: '"un texto"' }))).toBeNull();
  });

  it('inicializar siembra la primera vez y respeta lo guardado la segunda', () => {
    const almacen = almacenEnMemoria();

    const primera = inicializar(almacen, HOY);
    expect(primera.clientes).toHaveLength(3);

    const { estado: conUnoMas } = altaCliente(primera, {
      nombre: 'Gasería del Este',
      tipo: 'empresa',
      documento: '217000000011',
      telefono: '+59899100104',
    });
    grabarEstado(almacen, conUnoMas);

    const segunda = inicializar(almacen, HOY);
    expect(segunda.clientes).toHaveLength(4);
  });

  it('reiniciarDemo pisa los cambios', () => {
    const almacen = almacenEnMemoria();
    const { estado: conUnoMas } = altaCliente(inicializar(almacen, HOY), {
      nombre: 'Gasería del Este',
      tipo: 'empresa',
      documento: '217000000011',
      telefono: '+59899100104',
    });
    grabarEstado(almacen, conUnoMas);

    const reiniciado = reiniciarDemo(almacen, HOY);

    expect(reiniciado.clientes).toHaveLength(3);
    expect(leerEstado(almacen)?.clientes).toHaveLength(3);
  });
});

// ────────────────────────────────── Altas

describe('altas', () => {
  it('da de alta un cliente sin tocar el estado anterior', () => {
    const estado = estadoDemo(HOY);
    const { estado: nuevo, cliente } = altaCliente(estado, {
      nombre: 'Gasería del Este',
      tipo: 'empresa',
      documento: '217000000011',
      telefono: '+59899100104',
    });

    expect(cliente.id).not.toBe('');
    expect(nuevo.clientes).toHaveLength(4);
    expect(estado.clientes).toHaveLength(3);
  });

  it('da de alta un cilindro con la tarifa de su peso', () => {
    const { cilindro: grande } = altaCilindro(estadoDemo(HOY), {
      serie: 'CIL-00200',
      tipoGas: 'acetileno',
      kg: 7,
    });
    const { cilindro: chico } = altaCilindro(estadoDemo(HOY), {
      serie: 'CIL-00201',
      tipoGas: 'acetileno',
      kg: 4,
    });

    expect(grande.tarifaMensual).toBe(440);
    expect(chico.tarifaMensual).toBe(380);
    expect(grande.activo).toBe(true);
  });

  it('deja pisar la tarifa de un cilindro', () => {
    const { cilindro } = altaCilindro(estadoDemo(HOY), {
      serie: 'CIL-00202',
      tipoGas: 'acetileno',
      kg: 4,
      tarifaMensual: 500,
    });

    expect(cilindro.tarifaMensual).toBe(500);
  });
});

// ────────────────────────────────── Confirmar lote

describe('confirmarLote', () => {
  it('la entrega abre arriendo, graba movimiento y saca el cilindro de stock', () => {
    const estado = estadoDemo(HOY);
    const cil = cilindro(estado, 'CIL-00105');
    expect(estaEnStock(estado, cil.id)).toBe(true);

    const resultado = confirmarLote(estado, {
      tipo: 'entrega',
      series: ['CIL-00105'],
      clienteId: 'cli-ancap',
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(resultado.avisos).toEqual([]);
    expect(resultado.movimientos).toHaveLength(1);
    expect(resultado.movimientos[0]?.tipo).toBe('entrega');
    expect(estaEnStock(resultado.estado, cil.id)).toBe(false);
    expect(arriendoAbierto(resultado.estado, 'CIL-00105').fechaEntrega).toBe(HOY);
  });

  it('entrega tres cilindros en un solo lote, como pide el criterio 9.2', () => {
    const resultado = confirmarLote(estadoDemo(HOY), {
      tipo: 'entrega',
      series: ['CIL-00105', 'CIL-00106', 'CIL-00107'],
      clienteId: 'cli-ancap',
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(resultado.avisos).toEqual([]);
    expect(resultado.movimientos).toHaveLength(3);

    const enAncap = resultado.estado.arriendos.filter(
      (a) => a.clienteId === 'cli-ancap' && a.fechaDevolucion === null,
    );
    expect(enAncap).toHaveLength(5); // los 2 que ya tenía más los 3 del lote
  });

  it('todo el lote comparte un loteId', () => {
    const resultado = confirmarLote(estadoDemo(HOY), {
      tipo: 'entrega',
      series: ['CIL-00105', 'CIL-00106'],
      clienteId: 'cli-ancap',
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(new Set(resultado.movimientos.map((m) => m.loteId)).size).toBe(1);
    expect(resultado.movimientos[0]?.loteId).toBe(resultado.loteId);
  });

  it('la devolucion cierra el arriendo y devuelve el cilindro a stock', () => {
    // Criterio 9.7 del SPEC.
    const estado = estadoDemo(HOY);
    const cil = cilindro(estado, 'CIL-00101');

    const resultado = confirmarLote(estado, {
      tipo: 'devolucion',
      series: ['CIL-00101'],
      clienteId: null,
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(resultado.avisos).toEqual([]);
    expect(estaEnStock(resultado.estado, cil.id)).toBe(true);
    expect(
      resultado.estado.arriendos.find((a) => a.cilindroId === cil.id)?.fechaDevolucion,
    ).toBe(HOY);
    expect(resultado.movimientos[0]?.clienteId).toBe('cli-ancap');
  });

  it('nunca deja dos arriendos abiertos del mismo cilindro', () => {
    // El invariante que sostiene la regla de la seccion 4.
    const estado = estadoDemo(HOY);
    const cil = cilindro(estado, 'CIL-00101');

    const resultado = confirmarLote(estado, {
      tipo: 'entrega',
      series: ['CIL-00101'],
      clienteId: 'cli-armada',
      operador: OPERADOR,
      fecha: HOY,
    });

    const abiertos = resultado.estado.arriendos.filter(
      (a) => a.cilindroId === cil.id && a.fechaDevolucion === null,
    );

    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]?.clienteId).toBe('cli-armada');
    expect(resultado.avisos.map((a) => a.tipo)).toEqual(['ya_en_otro_cliente']);
  });

  it('solo agrega movimientos: no edita ni borra los anteriores', () => {
    const estado = estadoDemo(HOY);
    const antes = structuredClone(estado.movimientos);

    const resultado = confirmarLote(estado, {
      tipo: 'entrega',
      series: ['CIL-00105'],
      clienteId: 'cli-ancap',
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(resultado.estado.movimientos.slice(0, antes.length)).toEqual(antes);
    expect(resultado.estado.movimientos).toHaveLength(antes.length + 1);
    // Y el estado que entró quedó intacto.
    expect(estado.movimientos).toEqual(antes);
  });

  it('una entrega sin cliente es un error de programacion, no un aviso', () => {
    expect(() =>
      confirmarLote(estadoDemo(HOY), {
        tipo: 'entrega',
        series: ['CIL-00105'],
        clienteId: null,
        operador: OPERADOR,
        fecha: HOY,
      }),
    ).toThrow(/necesita un cliente/);
  });
});

// ─────────────────── Las validaciones de 6.1: avisan pero no bloquean

describe('las validaciones de 6.1 avisan y dejan seguir', () => {
  it('serie repetida en el mismo lote: la toma una vez y avisa', () => {
    const resultado = confirmarLote(estadoDemo(HOY), {
      tipo: 'entrega',
      series: ['CIL-00105', 'CIL-00105', 'CIL-00106'],
      clienteId: 'cli-ancap',
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(resultado.avisos.map((a) => a.tipo)).toEqual(['serie_repetida']);
    expect(resultado.movimientos).toHaveLength(2);
  });

  it('serie desconocida: avisa, la saltea y no crea el cilindro', () => {
    const resultado = confirmarLote(estadoDemo(HOY), {
      tipo: 'entrega',
      series: ['CIL-99999', 'CIL-00105'],
      clienteId: 'cli-ancap',
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(resultado.avisos.map((a) => a.tipo)).toEqual(['serie_desconocida']);
    expect(resultado.estado.cilindros).toHaveLength(7);
    // El conocido del mismo lote se procesó igual: avisa, no bloquea.
    expect(resultado.movimientos).toHaveLength(1);
  });

  it('entrega de un cilindro que ya figura en otro cliente: avisa y deja seguir', () => {
    const resultado = confirmarLote(estadoDemo(HOY), {
      tipo: 'entrega',
      series: ['CIL-00103'],
      clienteId: 'cli-ancap',
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(resultado.avisos.map((a) => a.tipo)).toEqual(['ya_en_otro_cliente']);
    expect(resultado.movimientos).toHaveLength(1);
    expect(arriendoAbierto(resultado.estado, 'CIL-00103').clienteId).toBe('cli-ancap');
  });

  it('devolucion de un cilindro que ya figura en stock: avisa y graba el movimiento igual', () => {
    const resultado = confirmarLote(estadoDemo(HOY), {
      tipo: 'devolucion',
      series: ['CIL-00105'],
      clienteId: null,
      operador: OPERADOR,
      fecha: HOY,
    });

    expect(resultado.avisos.map((a) => a.tipo)).toEqual(['ya_en_stock']);
    expect(resultado.movimientos).toHaveLength(1);
    expect(resultado.movimientos[0]?.clienteId).toBeNull();
  });

  it('re-entregar al mismo cliente no pone el reloj en cero', () => {
    // Si cerrara y abriera de nuevo, los 92 dias y los $ 469 desaparecerian.
    const estado = estadoDemo(HOY);
    const antes = arriendoAbierto(estado, 'CIL-00101');

    const resultado = confirmarLote(estado, {
      tipo: 'entrega',
      series: ['CIL-00101'],
      clienteId: 'cli-ancap',
      operador: OPERADOR,
      fecha: HOY,
    });

    const despues = arriendoAbierto(resultado.estado, 'CIL-00101');

    expect(resultado.avisos.map((a) => a.tipo)).toEqual(['ya_en_este_cliente']);
    expect(despues.id).toBe(antes.id);
    expect(despues.fechaEntrega).toBe(antes.fechaEntrega);
    expect(diasEntre(despues.fechaEntrega, HOY)).toBe(92);
    // El movimiento queda registrado igual, porque el historial es inmutable.
    expect(resultado.movimientos).toHaveLength(1);
  });
});
