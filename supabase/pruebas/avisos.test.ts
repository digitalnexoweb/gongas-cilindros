import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base } from './base';

/** La etapa D: el registro de avisos y el texto editable, con las reglas aplicadas. */

let base: Base;
let joaquin: string;
let empleado: string;
let desactivado: string;
let ancap: string;
let abierto: string;
let cerrado: string;

beforeAll(async () => {
  base = await crearBase();

  joaquin = await base.crearUsuario('Joaquín', 'admin');
  empleado = await base.crearUsuario('Ana');
  desactivado = await base.crearUsuario('Ex Empleado', 'operador', false);

  ancap = await base.crearCliente('ANCAP');

  await base.crearCilindro('CIL-00101', 'grande');
  await base.entregarHace('CIL-00101', ancap, 92, empleado);
  abierto = await idDeArriendo('CIL-00101');

  await base.crearCilindro('CIL-00102', 'chico');
  await base.entregarHace('CIL-00102', ancap, 10, empleado);
  cerrado = await idDeArriendo('CIL-00102');
  await base.duenio.afectadas('update public.arriendos set fecha_devolucion = fecha_entrega + 5 where id = $1', [
    cerrado,
  ]);
}, 60_000);

afterAll(async () => {
  await base.cerrar();
});

async function idDeArriendo(serie: string): Promise<string> {
  const [fila] = await base.duenio.filas<{ id: string }>(
    `select a.id from public.arriendos a join public.cilindros c on c.id = a.cilindro_id
     where c.serie = $1 order by a.fecha_entrega desc limit 1`,
    [serie],
  );
  if (fila === undefined) throw new Error(`Sin arriendo para ${serie}`);
  return fila.id;
}

// ───────────────────────────────────────────────────────── registrar_aviso

describe('registrar_aviso', () => {
  it('el empleado registra un aviso; la base pone quién, cuándo y los días', async () => {
    await base.como(empleado, (s) => s.filas('select public.registrar_aviso($1)', [abierto]));

    const [aviso] = await base.duenio.filas<{
      operador: string;
      operador_id: string;
      dias: number;
      cliente_id: string;
    }>('select operador, operador_id, dias, cliente_id from public.avisos where arriendo_id = $1', [abierto]);

    expect(aviso).toEqual({ operador: 'Ana', operador_id: empleado, dias: 92, cliente_id: ancap });
  });

  it('Joaquín también, y quedan los dos', async () => {
    await base.como(joaquin, (s) => s.filas('select public.registrar_aviso($1)', [abierto]));

    const filas = await base.como(empleado, (s) =>
      s.filas<{ operador: string }>(
        'select operador from public.avisos where arriendo_id = $1 order by creado_en',
        [abierto],
      ),
    );
    expect(filas.map((f) => f.operador)).toEqual(['Ana', 'Joaquín']);
  });

  it('rechaza un arriendo ya cerrado', async () => {
    await expect(
      base.como(joaquin, (s) => s.filas('select public.registrar_aviso($1)', [cerrado])),
    ).rejects.toThrow(/ya fue devuelto/);
  });

  it('un usuario desactivado no puede registrar ni ver avisos', async () => {
    await expect(
      base.como(desactivado, (s) => s.filas('select public.registrar_aviso($1)', [abierto])),
    ).rejects.toThrow(/No autorizado/);

    const filas = await base.como(desactivado, (s) => s.filas('select * from public.avisos'));
    expect(filas).toEqual([]);
  });

  it('sin sesión, nada', async () => {
    await expect(
      base.como(null, (s) => s.filas('select public.registrar_aviso($1)', [abierto])),
    ).rejects.toThrow(/permission denied/);
    await expect(base.como(null, (s) => s.filas('select * from public.avisos'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each([
    ['insertar directo', "insert into public.avisos (arriendo_id, cilindro_id, cliente_id, dias, operador_id, operador) select id, cilindro_id, cliente_id, 1, cliente_id, 'x' from public.arriendos limit 1"],
    ['editar', "update public.avisos set operador = 'Otro'"],
    ['borrar', 'delete from public.avisos'],
  ])('nadie puede %s un aviso, ni el administrador', async (_que, sql) => {
    await expect(base.como(joaquin, (s) => s.afectadas(sql))).rejects.toThrow(/permission denied/);
  });
});

// ───────────────────────────────────────────────────────── textos_aviso

describe('textos_aviso', () => {
  it('arranca con los dos textos, con sus huecos', async () => {
    const [textos] = await base.como(empleado, (s) =>
      s.filas<{ con_cargo: string; por_vencer: string }>('select con_cargo, por_vencer from public.textos_aviso'),
    );

    expect(textos?.con_cargo).toContain('{importe}');
    expect(textos?.con_cargo).toContain('{cliente}');
    expect(textos?.por_vencer).toContain('{sin_cargo}');
    expect(textos?.por_vencer).not.toContain('{importe}');
  });

  it('Joaquín lo cambia', async () => {
    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas("update public.textos_aviso set por_vencer = 'Hola {cliente}, nuevo texto.'"),
    );
    expect(tocadas).toBe(1);
  });

  it('el empleado lo lee pero no lo puede cambiar', async () => {
    const tocadas = await base.como(empleado, (s) =>
      s.afectadas("update public.textos_aviso set por_vencer = 'Hackeado'"),
    );
    expect(tocadas).toBe(0);

    const [textos] = await base.duenio.filas<{ por_vencer: string }>(
      'select por_vencer from public.textos_aviso',
    );
    expect(textos?.por_vencer).toBe('Hola {cliente}, nuevo texto.');
  });

  it('no se puede dejar un texto vacío', async () => {
    await expect(
      base.como(joaquin, (s) => s.afectadas("update public.textos_aviso set con_cargo = '   '")),
    ).rejects.toThrow(/check/);
  });

  it('hay una sola fila: no se puede agregar otra', async () => {
    await expect(
      base.como(joaquin, (s) =>
        s.afectadas("insert into public.textos_aviso (con_cargo, por_vencer) values ('a', 'b')"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
