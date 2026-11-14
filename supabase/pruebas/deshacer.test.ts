import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base } from './base';

/** Migración 0016: deshacer un movimiento confirmado por error. */

let base: Base;
let joaquin: string;
let operario: string;
let ancap: string;
let armada: string;

beforeAll(async () => {
  base = await crearBase();
  joaquin = await base.crearUsuario('Joaquín', 'admin');
  operario = await base.crearUsuario('Ana');
  ancap = await base.crearCliente('ANCAP');
  armada = await base.crearCliente('Armada');
}, 60_000);

afterAll(async () => {
  await base.cerrar();
});

type Lote = { movimientos: { id: string; serie: string }[]; avisos: { serie: string; tipo: string }[] };

async function lote(tipo: 'entrega' | 'devolucion', series: string[], cliente: string | null = null): Promise<Lote> {
  const [fila] = await base.como(operario, (s) =>
    s.filas<{ lote: Lote }>('select public.confirmar_lote($1, $2, $3) as lote', [tipo, series, cliente]),
  );
  if (fila === undefined) throw new Error('Sin lote');
  return fila.lote;
}

const idsDe = (l: Lote): string[] => l.movimientos.map((m) => m.id);

async function deshacer(ids: string[], usuario: string | null = operario): Promise<{ deshechos: number; series: string[] }> {
  const [fila] = await base.como(usuario, (s) =>
    s.filas<{ r: { deshechos: number; series: string[] } }>('select public.deshacer_movimientos($1) as r', [ids]),
  );
  if (fila === undefined) throw new Error('Sin respuesta');
  return fila.r;
}

/** Dónde está el cilindro: el cliente y desde cuándo, o `null` si está en stock. */
async function dondeEsta(serie: string): Promise<{ cliente: string; desde: string } | null> {
  const [fila] = await base.duenio.filas<{ cliente: string; desde: string }>(
    `select a.cliente_id as cliente, a.fecha_entrega as desde
     from public.arriendos a join public.cilindros c on c.id = a.cilindro_id
     where c.serie = $1 and a.fecha_devolucion is null`,
    [serie],
  );
  return fila ?? null;
}

async function cuantosArriendos(serie: string): Promise<number> {
  const [fila] = await base.duenio.filas<{ n: number }>(
    'select count(*)::int as n from public.arriendos a join public.cilindros c on c.id = a.cilindro_id where c.serie = $1',
    [serie],
  );
  return fila?.n ?? 0;
}

describe('deshacer una entrega', () => {
  it('el cilindro vuelve a stock y el arriendo desaparece', async () => {
    await base.crearCilindro('DES-1');
    const l = await lote('entrega', ['DES-1'], ancap);
    expect(await dondeEsta('DES-1')).not.toBeNull();

    expect(await deshacer(idsDe(l))).toEqual({ deshechos: 1, series: ['DES-1'] });

    expect(await dondeEsta('DES-1')).toBeNull();
    expect(await cuantosArriendos('DES-1')).toBe(0);
  });

  it('el movimiento sigue ahí, con quién lo deshizo', async () => {
    await base.crearCilindro('DES-2');
    const l = await lote('entrega', ['DES-2'], ancap);
    await deshacer(idsDe(l));

    const filas = await base.como(operario, (s) =>
      s.filas<{ tipo: string; operador: string }>(
        `select m.tipo, a.operador from public.movimientos m
         join public.anulaciones a on a.movimiento_id = m.id where m.id = $1`,
        [idsDe(l)[0]],
      ),
    );
    expect(filas).toEqual([{ tipo: 'entrega', operador: 'Ana' }]);
  });

  it('si lo había sacado de otro cliente, vuelve a ese cliente con su fecha original', async () => {
    await base.crearCilindro('DES-3');
    await base.entregarHace('DES-3', ancap, 20, operario);
    const antes = await dondeEsta('DES-3');

    const l = await lote('entrega', ['DES-3'], armada);
    expect((await dondeEsta('DES-3'))?.cliente).toBe(armada);

    await deshacer(idsDe(l));

    expect(await dondeEsta('DES-3')).toEqual(antes);
    expect(antes?.cliente).toBe(ancap);
    expect(await cuantosArriendos('DES-3')).toBe(1);
  });

  it('"ya estaba en este cliente": se deshace sin tocar el arriendo', async () => {
    await base.crearCilindro('DES-4');
    await base.entregarHace('DES-4', ancap, 10, operario);
    const antes = await dondeEsta('DES-4');

    const l = await lote('entrega', ['DES-4'], ancap);
    expect(l.avisos).toEqual([{ serie: 'DES-4', tipo: 'ya_en_este_cliente' }]);

    await deshacer(idsDe(l));
    expect(await dondeEsta('DES-4')).toEqual(antes);
  });

  it('el gas vuelve al de la entrega anterior', async () => {
    await base.crearCilindro('DES-5');
    await lote('entrega', ['DES-5'], ancap);
    await lote('devolucion', ['DES-5']);

    const [fila] = await base.como(operario, (s) =>
      s.filas<{ lote: Lote }>("select public.confirmar_lote('entrega', $1, $2, $3) as lote", [['DES-5'], armada, ['Helio']]),
    );
    if (fila === undefined) throw new Error('Sin lote');
    await deshacer(idsDe(fila.lote));

    const [gas] = await base.duenio.filas<{ tipo_gas: string }>("select tipo_gas from public.cilindros where serie = 'DES-5'");
    expect(gas?.tipo_gas).toBe('Acetileno');
  });
});

describe('deshacer una devolución', () => {
  it('el cilindro vuelve al cliente, con su fecha original', async () => {
    await base.crearCilindro('DES-10');
    await base.entregarHace('DES-10', ancap, 30, operario);
    const antes = await dondeEsta('DES-10');

    const l = await lote('devolucion', ['DES-10']);
    expect(await dondeEsta('DES-10')).toBeNull();

    await deshacer(idsDe(l));
    expect(await dondeEsta('DES-10')).toEqual(antes);
  });

  it('"ya estaba en stock": se deshace y sigue en stock', async () => {
    await base.crearCilindro('DES-11');
    const l = await lote('devolucion', ['DES-11']);
    expect(l.avisos).toEqual([{ serie: 'DES-11', tipo: 'ya_en_stock' }]);

    expect((await deshacer(idsDe(l))).deshechos).toBe(1);
    expect(await dondeEsta('DES-11')).toBeNull();
  });
});

describe('qué se puede deshacer', () => {
  it('parte de un lote: el resto queda como estaba', async () => {
    await base.crearCilindro('DES-20');
    await base.crearCilindro('DES-21');
    const l = await lote('entrega', ['DES-20', 'DES-21'], ancap);
    const id21 = l.movimientos.find((m) => m.serie === 'DES-21')?.id ?? '';

    await deshacer([id21]);

    expect((await dondeEsta('DES-20'))?.cliente).toBe(ancap);
    expect(await dondeEsta('DES-21')).toBeNull();
  });

  it('solo el último movimiento de cada cilindro', async () => {
    await base.crearCilindro('DES-30');
    const entrega = await lote('entrega', ['DES-30'], ancap);
    await lote('devolucion', ['DES-30']);

    await expect(deshacer(idsDe(entrega))).rejects.toThrow(/DES-30 tuvo otro movimiento después/);
  });

  it('los dos juntos sí: primero se deshace el último', async () => {
    await base.crearCilindro('DES-31');
    const entrega = await lote('entrega', ['DES-31'], ancap);
    const devolucion = await lote('devolucion', ['DES-31']);

    expect((await deshacer([...idsDe(entrega), ...idsDe(devolucion)])).deshechos).toBe(2);
    expect(await cuantosArriendos('DES-31')).toBe(0);
  });

  it('no dos veces', async () => {
    await base.crearCilindro('DES-32');
    const l = await lote('entrega', ['DES-32'], ancap);
    await deshacer(idsDe(l));

    await expect(deshacer(idsDe(l))).rejects.toThrow(/DES-32 ya estaba deshecho/);
  });

  it('todo o nada: si uno no se puede, no se deshace ninguno', async () => {
    await base.crearCilindro('DES-33');
    await base.crearCilindro('DES-34');
    const l = await lote('entrega', ['DES-33', 'DES-34'], ancap);
    await lote('devolucion', ['DES-34']);

    await expect(deshacer(idsDe(l))).rejects.toThrow(/DES-34/);
    expect((await dondeEsta('DES-33'))?.cliente).toBe(ancap);
  });

  it('no si al cliente ya se le mandó un aviso', async () => {
    await base.crearCilindro('DES-35');
    await base.entregarHace('DES-35', ancap, 58, operario);
    const [arriendo] = await base.duenio.filas<{ id: string; mov: string }>(
      `select a.id, a.abierto_por as mov from public.arriendos a
       join public.cilindros c on c.id = a.cilindro_id where c.serie = 'DES-35'`,
    );
    await base.como(operario, (s) => s.filas('select public.registrar_aviso($1)', [arriendo?.id]));

    await expect(deshacer([arriendo?.mov ?? ''])).rejects.toThrow(/ya se le mandó un aviso/);
    expect(await dondeEsta('DES-35')).not.toBeNull();
  });

  it('un movimiento que no existe', async () => {
    await expect(deshacer(['00000000-0000-0000-0000-000000000000'])).rejects.toThrow(/no existe/);
  });
});

describe('permisos', () => {
  it('el administrador también puede', async () => {
    await base.crearCilindro('DES-40');
    const l = await lote('entrega', ['DES-40'], ancap);
    expect((await deshacer(idsDe(l), joaquin)).deshechos).toBe(1);
  });

  it('sin sesión, no', async () => {
    await base.crearCilindro('DES-41');
    const l = await lote('entrega', ['DES-41'], ancap);
    await expect(deshacer(idsDe(l), null)).rejects.toThrow(/permission denied/);
  });

  it('un usuario desactivado, no', async () => {
    const inactivo = await base.crearUsuario('Pedro', 'operador', false);
    await base.crearCilindro('DES-42');
    const l = await lote('entrega', ['DES-42'], ancap);
    await expect(deshacer(idsDe(l), inactivo)).rejects.toThrow(/No autorizado/);
  });

  it('nadie escribe ni borra anulaciones a mano', async () => {
    await expect(
      base.como(joaquin, (s) => s.afectadas('delete from public.anulaciones')),
    ).rejects.toThrow(/permission denied/);
    await expect(base.duenio.afectadas('delete from public.anulaciones')).rejects.toThrow(
      /no se edita ni se borra/,
    );
  });
});

describe('la migración empareja los arriendos que ya existían', () => {
  it('cada arriendo apunta al movimiento que lo abrió y al que lo cerró', async () => {
    // Una base nueva con un historial grabado "a la antigua", sin abierto_por ni cerrado_por.
    const vieja = await crearBase();
    try {
      const ana = await vieja.crearUsuario('Ana');
      const cliente = await vieja.crearCliente('ANCAP');
      const otro = await vieja.crearCliente('Armada');
      await vieja.crearCilindro('VIE-1');
      // confirmar_lote ya anota todo; se borran las anotaciones para simular datos viejos
      // y se vuelve a correr el emparejamiento de 0016.
      await vieja.como(ana, (s) => s.filas("select public.confirmar_lote('entrega', '{VIE-1}', $1)", [cliente]));
      await vieja.como(ana, (s) => s.filas("select public.confirmar_lote('entrega', '{VIE-1}', $1)", [otro]));
      const correctas = await vieja.duenio.filas<{ abierto_por: string; cerrado_por: string | null }>(
        'select abierto_por, cerrado_por from public.arriendos order by fecha_entrega, cliente_id',
      );
      await vieja.duenio.afectadas('update public.arriendos set abierto_por = null, cerrado_por = null');

      const { readFileSync } = await import('node:fs');
      const sql = readFileSync(new URL('../migrations/0016_deshacer.sql', import.meta.url), 'utf8');
      const emparejar = sql.slice(sql.indexOf('do $$'), sql.indexOf('$$;', sql.indexOf('do $$')) + 3);
      await vieja.duenio.filas(emparejar);

      const emparejadas = await vieja.duenio.filas<{ abierto_por: string; cerrado_por: string | null }>(
        'select abierto_por, cerrado_por from public.arriendos order by fecha_entrega, cliente_id',
      );
      expect(emparejadas).toEqual(correctas);
      expect(emparejadas.filter((a) => a.cerrado_por !== null)).toHaveLength(1);
    } finally {
      await vieja.cerrar();
    }
  }, 60_000);
});
