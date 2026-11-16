import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base } from './base';

/** Migración 0019: pesos nuevos desde el alta, sin tarifa todavía. */

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

async function agregarPeso(kg: number, usuario: string | null = operario): Promise<number> {
  const [fila] = await base.como(usuario, (s) => s.filas<{ kg: string }>('select public.agregar_peso($1) as kg', [kg]));
  return Number(fila?.kg);
}

async function tarifaDe(serie: string): Promise<number | null> {
  const [fila] = await base.duenio.filas<{ t: string }>(
    'select t.tarifa_mensual as t from public.tarifas t join public.cilindros c on c.id = t.cilindro_id where c.serie = $1',
    [serie],
  );
  return fila === undefined ? null : Number(fila.t);
}

describe('agregar_peso', () => {
  it('un operario agrega un peso y da de alta un cilindro con él, sin tarifa', async () => {
    expect(await agregarPeso(10)).toBe(10);

    await base.como(operario, (s) => s.filas("select public.alta_cilindro('PESO-1', 10, 'Acetileno')"));

    const [cilindro] = await base.duenio.filas<{ kg: string }>("select kg from public.cilindros where serie = 'PESO-1'");
    expect(Number(cilindro?.kg)).toBe(10);
    expect(await tarifaDe('PESO-1')).toBeNull();
  });

  it('redondea a un decimal', async () => {
    expect(await agregarPeso(4.54)).toBe(4.5);
  });

  it('uno que ya está, no', async () => {
    await expect(agregarPeso(4)).rejects.toThrow(/ya está en la lista/);
  });

  it('cero o negativo, no', async () => {
    await expect(agregarPeso(0)).rejects.toThrow(/mayor que cero/);
    await expect(agregarPeso(-3)).rejects.toThrow(/mayor que cero/);
  });

  it('uno oculto vuelve a ofrecerse', async () => {
    await agregarPeso(12);
    await base.como(joaquin, (s) => s.afectadas('update public.tamanos set activo = false where kg = 12'));

    expect(await agregarPeso(12)).toBe(12);
    const [fila] = await base.duenio.filas<{ activo: boolean }>('select activo from public.tamanos where kg = 12');
    expect(fila?.activo).toBe(true);
  });

  it('sin sesión, no', async () => {
    await expect(agregarPeso(15, null)).rejects.toThrow(/permission denied/);
  });
});

describe('cambiar_tarifa_de_kilos con un peso sin tarifa', () => {
  it('Joaquín le pone tarifa y los cilindros de ese peso la reciben', async () => {
    await agregarPeso(20);
    await base.como(operario, (s) => s.filas("select public.alta_cilindro('PESO-20', 20, 'Acetileno')"));
    expect(await tarifaDe('PESO-20')).toBeNull();

    const [fila] = await base.como(joaquin, (s) =>
      s.filas<{ n: number }>('select public.cambiar_tarifa_de_kilos(20, 600) as n'),
    );
    expect(fila?.n).toBe(1);
    expect(await tarifaDe('PESO-20')).toBe(600);

    // Y los que se den de alta después ya nacen con esa tarifa.
    await base.como(operario, (s) => s.filas("select public.alta_cilindro('PESO-21', 20, 'Acetileno')"));
    expect(await tarifaDe('PESO-21')).toBe(600);
  });

  it('un operario no pone tarifas', async () => {
    await agregarPeso(25);
    await expect(
      base.como(operario, (s) => s.filas('select public.cambiar_tarifa_de_kilos(25, 100)')),
    ).rejects.toThrow(/No autorizado/);
  });

  it('un peso que no está en la lista, no', async () => {
    await expect(
      base.como(joaquin, (s) => s.filas('select public.cambiar_tarifa_de_kilos(99, 100)')),
    ).rejects.toThrow(/no está en la lista/);
  });
});
