import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base } from './base';

/** Migración 0013: el gas de cada entrega, corregir el tamaño y los datos nuevos del cliente. */

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

type Lote = { movimientos: { serie: string; tipo_gas: string | null }[]; avisos: { serie: string; tipo: string }[] };

async function entregar(series: string[], cliente: string, gases?: (string | null)[]): Promise<Lote> {
  const [fila] = await base.como(operario, (s) =>
    s.filas<{ lote: Lote }>("select public.confirmar_lote('entrega', $1, $2, $3) as lote", [series, cliente, gases ?? null]),
  );
  if (fila === undefined) throw new Error('Sin lote');
  return fila.lote;
}

async function recibir(series: string[]): Promise<Lote> {
  const [fila] = await base.como(operario, (s) =>
    s.filas<{ lote: Lote }>("select public.confirmar_lote('devolucion', $1) as lote", [series]),
  );
  if (fila === undefined) throw new Error('Sin lote');
  return fila.lote;
}

async function gasDe(serie: string): Promise<{ cilindro: string; arriendo: string | null }> {
  const [fila] = await base.duenio.filas<{ cilindro: string; arriendo: string | null }>(
    `select c.tipo_gas as cilindro,
            (select a.tipo_gas from public.arriendos a where a.cilindro_id = c.id and a.fecha_devolucion is null) as arriendo
     from public.cilindros c where c.serie = $1`,
    [serie],
  );
  if (fila === undefined) throw new Error(`No existe ${serie}`);
  return fila;
}

async function tarifaDe(serie: string): Promise<number> {
  const [fila] = await base.duenio.filas<{ t: string }>(
    `select t.tarifa_mensual as t from public.tarifas t join public.cilindros c on c.id = t.cilindro_id where c.serie = $1`,
    [serie],
  );
  return Number(fila?.t);
}

describe('tipos_gas', () => {
  it('arranca con los 8 gases, en orden', async () => {
    const filas = await base.como(operario, (s) =>
      s.filas<{ nombre: string }>('select nombre from public.tipos_gas order by orden'),
    );
    expect(filas.map((f) => f.nombre)).toEqual([
      'Acetileno',
      'Argón',
      'Etileno',
      'Helio',
      'Hexafluoruro de azufre',
      'Hidrógeno',
      'Nitrógeno',
      'Oxígeno',
    ]);
  });

  it('Joaquín agrega uno y oculta otro; el operario no puede', async () => {
    expect(
      await base.como(joaquin, (s) => s.afectadas("insert into public.tipos_gas (nombre) values ('CO2')")),
    ).toBe(1);
    expect(
      await base.como(joaquin, (s) => s.afectadas("update public.tipos_gas set activo = false where nombre = 'Etileno'")),
    ).toBe(1);

    await expect(
      base.como(operario, (s) => s.afectadas("insert into public.tipos_gas (nombre) values ('Inventado')")),
    ).rejects.toThrow(/row-level security/);
    expect(
      await base.como(operario, (s) => s.afectadas("update public.tipos_gas set activo = false where nombre = 'Helio'")),
    ).toBe(0);
  });
});

describe('confirmar_lote con gas', () => {
  it('cada cilindro sale con su gas, y queda en el movimiento, el arriendo y el cilindro', async () => {
    await base.crearCilindro('CIL-00201', 'grande');
    await base.crearCilindro('CIL-00202', 'chico');

    const lote = await entregar(['CIL-00201', 'CIL-00202'], ancap, ['oxígeno', 'Argón']);

    expect(lote.movimientos.map((m) => m.tipo_gas)).toEqual(['Oxígeno', 'Argón']);
    expect(await gasDe('CIL-00201')).toEqual({ cilindro: 'Oxígeno', arriendo: 'Oxígeno' });
    expect(await gasDe('CIL-00202')).toEqual({ cilindro: 'Argón', arriendo: 'Argón' });
  });

  it('al volver, la devolución dice con qué gas había salido', async () => {
    const lote = await recibir(['CIL-00201']);
    expect(lote.movimientos[0]?.tipo_gas).toBe('Oxígeno');
  });

  it('sin gas, sale con el último que tuvo ese cilindro', async () => {
    const lote = await entregar(['CIL-00201'], armada);
    expect(lote.movimientos[0]?.tipo_gas).toBe('Oxígeno');
  });

  it('el mismo cilindro puede salir después con otro gas', async () => {
    await recibir(['CIL-00201']);
    const lote = await entregar(['CIL-00201'], ancap, ['Helio']);
    expect(lote.movimientos[0]?.tipo_gas).toBe('Helio');
    expect((await gasDe('CIL-00201')).arriendo).toBe('Helio');
  });

  it('un gas que no está en la lista rechaza el lote entero', async () => {
    await base.crearCilindro('CIL-00203', 'chico');
    await expect(entregar(['CIL-00203'], ancap, ['Kriptonita'])).rejects.toThrow(/no está en la lista/);
    expect((await gasDe('CIL-00203')).arriendo).toBeNull();
  });

  it('un gas oculto tampoco se puede elegir', async () => {
    await expect(entregar(['CIL-00203'], ancap, ['Etileno'])).rejects.toThrow(/no está en la lista/);
  });

  it('las llamadas viejas, sin el cuarto parámetro, siguen andando', async () => {
    const [fila] = await base.como(operario, (s) =>
      s.filas<{ lote: Lote }>("select public.confirmar_lote('entrega', array['CIL-00203'], $1) as lote", [ancap]),
    );
    expect(fila?.lote.movimientos).toHaveLength(1);
  });
});

describe('corregir_tamano', () => {
  it('el operario corrige el tamaño, y la tarifa pasa a la del tamaño nuevo', async () => {
    await base.crearCilindro('CIL-00301', 'chico');

    const [r] = await base.como(operario, (s) =>
      s.filas<{ ok: boolean }>("select public.corregir_tamano('cil-00301', 'grande') as ok"),
    );

    expect(r?.ok).toBe(true);
    expect(await tarifaDe('CIL-00301')).toBe(440);
  });

  it('un precio propio, puesto por Joaquín, se respeta', async () => {
    await base.crearCilindro('CIL-00302', 'chico');
    await base.duenio.afectadas(
      "update public.tarifas set tarifa_mensual = 999 where cilindro_id = (select id from public.cilindros where serie = 'CIL-00302')",
    );

    await base.como(operario, (s) => s.filas("select public.corregir_tamano('CIL-00302', 'grande')"));

    expect(await tarifaDe('CIL-00302')).toBe(999);
  });

  it('si ya tenía ese tamaño, no hace nada', async () => {
    const [r] = await base.como(operario, (s) =>
      s.filas<{ ok: boolean }>("select public.corregir_tamano('CIL-00301', 'grande') as ok"),
    );
    expect(r?.ok).toBe(false);
  });

  it('sin sesión no se puede', async () => {
    await expect(
      base.como(null, (s) => s.filas("select public.corregir_tamano('CIL-00301', 'chico')")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('alta_cilindro con gas', () => {
  it('guarda el gas elegido, con el nombre de la lista', async () => {
    await base.como(operario, (s) => s.filas("select public.alta_cilindro('CIL-00401', 'chico', 'nitrógeno')"));
    expect((await gasDe('CIL-00401')).cilindro).toBe('Nitrógeno');
  });

  it('sin gas, Acetileno', async () => {
    await base.como(operario, (s) => s.filas("select public.alta_cilindro('CIL-00402', 'chico')"));
    expect((await gasDe('CIL-00402')).cilindro).toBe('Acetileno');
  });

  it('rechaza un gas que no está en la lista', async () => {
    await expect(
      base.como(operario, (s) => s.filas("select public.alta_cilindro('CIL-00403', 'chico', 'Kriptonita')")),
    ).rejects.toThrow(/no está en la lista/);
  });
});

describe('datos del cliente', () => {
  it('cualquiera los carga al dar de alta; Joaquín los corrige', async () => {
    const [nuevo] = await base.como(operario, (s) =>
      s.filas<{ id: string }>(
        "insert into public.clientes (nombre, tipo, direccion, ciudad, notas) values ('Taller Sur', 'empresa', 'Av. Italia 1234', 'Montevideo', 'Entregar de mañana') returning id",
      ),
    );
    expect(
      await base.como(joaquin, (s) =>
        s.afectadas("update public.clientes set ciudad = 'Canelones' where id = $1", [nuevo?.id]),
      ),
    ).toBe(1);
  });
});
