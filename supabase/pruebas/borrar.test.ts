import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base } from './base';

/** Migración 0017: borrar lo deshecho y borrar clientes sin historia. */

let base: Base;
let joaquin: string;
let operario: string;

beforeAll(async () => {
  base = await crearBase();
  joaquin = await base.crearUsuario('Joaquín', 'admin');
  operario = await base.crearUsuario('Ana');
}, 60_000);

afterAll(async () => {
  await base.cerrar();
});

type Lote = { movimientos: { id: string; serie: string }[] };

async function lote(tipo: 'entrega' | 'devolucion', series: string[], cliente: string | null = null): Promise<string[]> {
  const [fila] = await base.como(operario, (s) =>
    s.filas<{ lote: Lote }>('select public.confirmar_lote($1, $2, $3) as lote', [tipo, series, cliente]),
  );
  if (fila === undefined) throw new Error('Sin lote');
  return fila.lote.movimientos.map((m) => m.id);
}

async function deshacer(ids: string[]): Promise<void> {
  await base.como(operario, (s) => s.filas('select public.deshacer_movimientos($1)', [ids]));
}

async function borrarDeshechos(ids: string[], usuario: string | null = operario): Promise<number> {
  const [fila] = await base.como(usuario, (s) => s.filas<{ n: number }>('select public.borrar_deshechos($1) as n', [ids]));
  return fila?.n ?? 0;
}

async function borrarCliente(id: string, usuario: string | null = joaquin): Promise<void> {
  await base.como(usuario, (s) => s.filas('select public.borrar_cliente($1)', [id]));
}

async function existe(tabla: 'movimientos' | 'anulaciones' | 'clientes', columna: string, id: string): Promise<boolean> {
  const filas = await base.duenio.filas(`select 1 from public.${tabla} where ${columna} = $1`, [id]);
  return filas.length > 0;
}

describe('borrar_deshechos', () => {
  it('borra el movimiento deshecho y su anulación, del todo', async () => {
    const cliente = await base.crearCliente('Borrar 1');
    await base.crearCilindro('BOR-1');
    const ids = await lote('entrega', ['BOR-1'], cliente);
    await deshacer(ids);

    expect(await borrarDeshechos(ids)).toBe(1);

    expect(await existe('movimientos', 'id', ids[0] ?? '')).toBe(false);
    expect(await existe('anulaciones', 'movimiento_id', ids[0] ?? '')).toBe(false);
  });

  it('uno vigente, no', async () => {
    const cliente = await base.crearCliente('Borrar 2');
    await base.crearCilindro('BOR-2');
    const ids = await lote('entrega', ['BOR-2'], cliente);

    await expect(borrarDeshechos(ids)).rejects.toThrow(/BOR-2 no está deshecho/);
    expect(await existe('movimientos', 'id', ids[0] ?? '')).toBe(true);
  });

  it('todo o nada: con uno vigente en el pedido, no borra ninguno', async () => {
    const cliente = await base.crearCliente('Borrar 3');
    await base.crearCilindro('BOR-3');
    await base.crearCilindro('BOR-4');
    const ids = await lote('entrega', ['BOR-3', 'BOR-4'], cliente);
    await deshacer([ids[0] ?? '']);

    await expect(borrarDeshechos(ids)).rejects.toThrow(/no está deshecho/);
    expect(await existe('movimientos', 'id', ids[0] ?? '')).toBe(true);
  });

  it('una devolución deshecha también se borra, y el cilindro sigue en el cliente', async () => {
    const cliente = await base.crearCliente('Borrar 4');
    await base.crearCilindro('BOR-5');
    await lote('entrega', ['BOR-5'], cliente);
    const devolucion = await lote('devolucion', ['BOR-5']);
    await deshacer(devolucion);

    expect(await borrarDeshechos(devolucion)).toBe(1);
    const abiertos = await base.duenio.filas(
      `select 1 from public.arriendos a join public.cilindros c on c.id = a.cilindro_id
       where c.serie = 'BOR-5' and a.fecha_devolucion is null`,
    );
    expect(abiertos).toHaveLength(1);
  });

  it('sin sesión, no', async () => {
    await expect(borrarDeshechos(['00000000-0000-0000-0000-000000000000'], null)).rejects.toThrow(/permission denied/);
  });

  it('la excepción no se usa desde afuera: nadie borra movimientos a mano', async () => {
    const cliente = await base.crearCliente('Borrar 5');
    await base.crearCilindro('BOR-6');
    const ids = await lote('entrega', ['BOR-6'], cliente);
    await deshacer(ids);

    // Un usuario, aunque marque la transacción, no tiene permiso de borrar.
    await expect(
      base.como(joaquin, async (s) => {
        await s.filas("select set_config('gongas.borrando_deshechos', 'si', true)");
        return s.afectadas('delete from public.movimientos where id = $1', [ids[0]]);
      }),
    ).rejects.toThrow(/permission denied/);

    // Y la función interna no se le ofrece a nadie.
    await expect(
      base.como(joaquin, (s) => s.filas('select public.borrar_movimientos_deshechos($1)', [ids])),
    ).rejects.toThrow(/permission denied/);

    // El dueño de la base, sin la marca, tampoco.
    await expect(base.duenio.afectadas('delete from public.movimientos where id = $1', [ids[0]])).rejects.toThrow(
      /no se editan ni se borran/,
    );
  });
});

describe('borrar_cliente', () => {
  it('uno que nunca tuvo nada', async () => {
    const cliente = await base.crearCliente('Nuevo sin nada');
    await borrarCliente(cliente);
    expect(await existe('clientes', 'id', cliente)).toBe(false);
  });

  it('uno con solo entregas deshechas: se borran con él', async () => {
    const cliente = await base.crearCliente('Solo deshechos');
    await base.crearCilindro('BOR-10');
    const ids = await lote('entrega', ['BOR-10'], cliente);
    await deshacer(ids);

    await borrarCliente(cliente);

    expect(await existe('clientes', 'id', cliente)).toBe(false);
    expect(await existe('movimientos', 'id', ids[0] ?? '')).toBe(false);
  });

  it('con cilindros en su poder, no', async () => {
    const cliente = await base.crearCliente('Con cilindro');
    await base.crearCilindro('BOR-11');
    await lote('entrega', ['BOR-11'], cliente);

    await expect(borrarCliente(cliente)).rejects.toThrow(/cilindros en su poder/);
  });

  it('con historia real (ya devolvió), no', async () => {
    const cliente = await base.crearCliente('Con historia');
    await base.crearCilindro('BOR-12');
    await lote('entrega', ['BOR-12'], cliente);
    await lote('devolucion', ['BOR-12']);

    await expect(borrarCliente(cliente)).rejects.toThrow(/entregas registradas/);
    expect(await existe('clientes', 'id', cliente)).toBe(true);
  });

  it('un operario, no', async () => {
    const cliente = await base.crearCliente('Del operario');
    await expect(borrarCliente(cliente, operario)).rejects.toThrow(/Solo el administrador/);
    expect(await existe('clientes', 'id', cliente)).toBe(true);
  });

  it('sin sesión, no', async () => {
    const cliente = await base.crearCliente('Sin sesión');
    await expect(borrarCliente(cliente, null)).rejects.toThrow(/permission denied/);
  });
});
