import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base } from './base';

/**
 * La matriz de "quién puede qué", celda por celda, contra las reglas reales.
 *
 * Hay dos formas en que la base dice que no, y las dos valen:
 *   · error de permiso, cuando el rol no tiene otorgada esa operación;
 *   · cero filas, cuando la operación existe pero ninguna fila pasa la regla.
 */

let base: Base;
let joaquin: string;
let empleado: string;
let desactivado: string;
let ancap: string;
let cilindro: string;

beforeAll(async () => {
  base = await crearBase();

  joaquin = await base.crearUsuario('Joaquín', 'admin');
  empleado = await base.crearUsuario('Empleado Uno');
  desactivado = await base.crearUsuario('Ex Empleado', 'operador', false);

  ancap = await base.crearCliente('ANCAP');
  cilindro = await base.crearCilindro('CIL-00001', 'grande');
  await base.entregarHace('CIL-00001', ancap, 92, empleado);
}, 60_000);

afterAll(async () => {
  await base.cerrar();
});

const TABLAS_DE_TRABAJO = ['clientes', 'cilindros', 'arriendos', 'movimientos'];
const TABLAS_DE_PLATA = ['tarifas', 'tarifas_por_tamano'];

// ───────────────────────────────────────────────────────── Sin sesión

describe('sin sesión', () => {
  it.each([...TABLAS_DE_TRABAJO, ...TABLAS_DE_PLATA, 'perfiles'])(
    'no puede leer %s',
    async (tabla) => {
      await expect(
        base.como(null, (s) => s.filas(`select * from public.${tabla}`)),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it('no puede confirmar un lote', async () => {
    await expect(
      base.como(null, (s) =>
        s.filas("select public.confirmar_lote('devolucion', array['CIL-00001'])"),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('no puede dar de alta un cilindro', async () => {
    await expect(
      base.como(null, (s) => s.filas("select public.alta_cilindro('CIL-09999', 'chico')")),
    ).rejects.toThrow(/permission denied/);
  });
});

// ───────────────────────────────────────────────────────── El empleado

describe('el empleado', () => {
  it.each(TABLAS_DE_TRABAJO)('ve %s, que es lo que necesita para trabajar', async (tabla) => {
    const filas = await base.como(empleado, (s) => s.filas(`select * from public.${tabla}`));
    expect(filas.length).toBeGreaterThan(0);
  });

  it.each(TABLAS_DE_PLATA)('NO ve %s: la base no le entrega ni una fila', async (tabla) => {
    // Para el dueño de la base hay datos; para el empleado, nada.
    expect((await base.duenio.filas(`select * from public.${tabla}`)).length).toBeGreaterThan(0);

    const filas = await base.como(empleado, (s) => s.filas(`select * from public.${tabla}`));
    expect(filas).toEqual([]);
  });

  it('puede dar de alta un cliente al entregar', async () => {
    const [cliente] = await base.como(empleado, (s) =>
      s.filas<{ nombre: string }>(
        "insert into public.clientes (nombre, tipo) values ('Taller Pereira', 'particular') returning nombre",
      ),
    );
    expect(cliente?.nombre).toBe('Taller Pereira');
  });

  it('NO puede editar un cliente', async () => {
    const tocadas = await base.como(empleado, (s) =>
      s.afectadas("update public.clientes set telefono = '+598000' where id = $1", [ancap]),
    );
    expect(tocadas).toBe(0);
  });

  it('NO puede editar un cilindro', async () => {
    const tocadas = await base.como(empleado, (s) =>
      s.afectadas('update public.cilindros set activo = false where id = $1', [cilindro]),
    );
    expect(tocadas).toBe(0);
  });

  it('NO puede editar una tarifa', async () => {
    const tocadas = await base.como(empleado, (s) =>
      s.afectadas('update public.tarifas set tarifa_mensual = 1 where cilindro_id = $1', [cilindro]),
    );
    expect(tocadas).toBe(0);

    const [tarifa] = await base.duenio.filas<{ tarifa_mensual: string }>(
      'select tarifa_mensual from public.tarifas where cilindro_id = $1',
      [cilindro],
    );
    expect(Number(tarifa?.tarifa_mensual)).toBe(440);
  });

  it('ve solo su propio perfil, no la lista de usuarios', async () => {
    const perfiles = await base.como(empleado, (s) =>
      s.filas<{ id: string }>('select id from public.perfiles'),
    );
    expect(perfiles.map((p) => p.id)).toEqual([empleado]);
  });

  it('NO puede hacerse administrador', async () => {
    const tocadas = await base.como(empleado, (s) =>
      s.afectadas("update public.perfiles set rol = 'admin' where id = $1", [empleado]),
    );
    expect(tocadas).toBe(0);

    const [perfil] = await base.duenio.filas<{ rol: string }>(
      'select rol from public.perfiles where id = $1',
      [empleado],
    );
    expect(perfil?.rol).toBe('operador');
  });

  it('NO puede borrar un cliente', async () => {
    await expect(
      base.como(empleado, (s) => s.afectadas('delete from public.clientes where id = $1', [ancap])),
    ).rejects.toThrow(/permission denied/);
  });
});

// ───────────────────────────────────────────────────────── Joaquín

describe('Joaquín, el administrador', () => {
  it.each(TABLAS_DE_TRABAJO)('ve %s', async (tabla) => {
    const filas = await base.como(joaquin, (s) => s.filas(`select * from public.${tabla}`));
    expect(filas.length).toBeGreaterThan(0);
  });

  it('ve las tarifas de cada cilindro', async () => {
    const tarifas = await base.como(joaquin, (s) =>
      s.filas<{ tarifa_mensual: string }>(
        'select tarifa_mensual from public.tarifas where cilindro_id = $1',
        [cilindro],
      ),
    );
    expect(tarifas.map((t) => Number(t.tarifa_mensual))).toEqual([440]);
  });

  it('ve las tarifas por tamaño: 380 chico y 440 grande', async () => {
    const tarifas = await base.como(joaquin, (s) =>
      s.filas<{ tamano: string; tarifa_mensual: string }>(
        'select tamano, tarifa_mensual from public.tarifas_por_tamano order by tamano',
      ),
    );
    expect(tarifas.map((t) => [t.tamano, Number(t.tarifa_mensual)])).toEqual([
      ['chico', 380],
      ['grande', 440],
    ]);
  });

  it('puede corregir los datos de un cliente', async () => {
    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas("update public.clientes set telefono = '+59899123456' where id = $1", [ancap]),
    );
    expect(tocadas).toBe(1);
  });

  it('puede cambiar la tarifa de un cilindro', async () => {
    const otro = await base.crearCilindro('CIL-00002', 'chico');

    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas('update public.tarifas set tarifa_mensual = 400 where cilindro_id = $1', [otro]),
    );
    expect(tocadas).toBe(1);
  });

  it('puede dar de baja un cilindro', async () => {
    const otro = await base.crearCilindro('CIL-00003', 'chico');

    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas('update public.cilindros set activo = false where id = $1', [otro]),
    );
    expect(tocadas).toBe(1);
  });

  it('ve la lista completa de usuarios', async () => {
    const perfiles = await base.como(joaquin, (s) =>
      s.filas<{ id: string }>('select id from public.perfiles'),
    );
    expect(perfiles.map((p) => p.id)).toEqual(
      expect.arrayContaining([joaquin, empleado, desactivado]),
    );
  });

  it('puede hacer administrador a otra persona', async () => {
    const socio = await base.crearUsuario('Socio');

    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas("update public.perfiles set rol = 'admin' where id = $1", [socio]),
    );
    expect(tocadas).toBe(1);

    // Y lo vuelve a empleado, para no dejar dos administradores en los demás tests.
    await base.como(joaquin, (s) =>
      s.afectadas("update public.perfiles set rol = 'operador' where id = $1", [socio]),
    );
  });
});

// ─────────────────────────────────────── Lo que no puede nadie, tampoco Joaquín

describe('arriendos y movimientos no se tocan a mano', () => {
  const intentos = [
    ['insertar un arriendo', "insert into public.arriendos (cilindro_id, cliente_id, fecha_entrega) select c.id, k.id, current_date from public.cilindros c, public.clientes k limit 1"],
    ['editar un arriendo', 'update public.arriendos set fecha_entrega = current_date'],
    ['borrar un arriendo', 'delete from public.arriendos'],
    ['editar un movimiento', "update public.movimientos set operador = 'otro'"],
    ['borrar un movimiento', 'delete from public.movimientos'],
  ] as const;

  it.each(intentos)('el empleado no puede %s', async (_que, sql) => {
    await expect(base.como(empleado, (s) => s.afectadas(sql))).rejects.toThrow(/permission denied/);
  });

  it.each(intentos)('Joaquín tampoco puede %s', async (_que, sql) => {
    await expect(base.como(joaquin, (s) => s.afectadas(sql))).rejects.toThrow(/permission denied/);
  });

  it('ni el dueño de la base puede editar un movimiento', async () => {
    // Esto vale incluso entrando por el panel de Supabase.
    await expect(
      base.duenio.afectadas("update public.movimientos set operador = 'otro'"),
    ).rejects.toThrow(/no se editan ni se borran/);
  });

  it('ni el dueño de la base puede borrar un movimiento', async () => {
    await expect(base.duenio.afectadas('delete from public.movimientos')).rejects.toThrow(
      /no se editan ni se borran/,
    );
  });
});

// ───────────────────────────────────────────────────────── Usuario desactivado

describe('un usuario desactivado', () => {
  it.each([...TABLAS_DE_TRABAJO, ...TABLAS_DE_PLATA])('no ve %s', async (tabla) => {
    const filas = await base.como(desactivado, (s) => s.filas(`select * from public.${tabla}`));
    expect(filas).toEqual([]);
  });

  it('sí ve su propio perfil, para que la app le pueda decir que está desactivado', async () => {
    const perfiles = await base.como(desactivado, (s) =>
      s.filas<{ activo: boolean }>('select activo from public.perfiles'),
    );
    expect(perfiles).toEqual([{ activo: false }]);
  });

  it('no puede dar de alta un cliente', async () => {
    await expect(
      base.como(desactivado, (s) =>
        s.afectadas("insert into public.clientes (nombre, tipo) values ('Fantasma', 'empresa')"),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('no puede confirmar un lote', async () => {
    await expect(
      base.como(desactivado, (s) =>
        s.filas("select public.confirmar_lote('devolucion', array['CIL-00001'])"),
      ),
    ).rejects.toThrow(/No autorizado/);
  });

  it('pierde el acceso en el momento en que Joaquín lo desactiva', async () => {
    const nuevo = await base.crearUsuario('Empleado Nuevo');
    const ve = () => base.como(nuevo, (s) => s.filas('select id from public.clientes'));

    expect((await ve()).length).toBeGreaterThan(0);

    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas('update public.perfiles set activo = false where id = $1', [nuevo]),
    );
    expect(tocadas).toBe(1);

    expect(await ve()).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────── Garantías

describe('garantías', () => {
  /** Crea la cuenta tal como la crearía Supabase, sin que nadie la active. */
  async function cuentaRecienCreada(nombre: string): Promise<string> {
    const [cuenta] = await base.duenio.filas<{ id: string }>(
      'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
      [`${nombre.toLowerCase()}@afuera.test`, JSON.stringify({ nombre })],
    );
    if (cuenta === undefined) throw new Error('no se creó la cuenta');
    return cuenta.id;
  }

  it('cada cuenta nueva nace con su perfil, como empleado y DESACTIVADA', async () => {
    const id = await cuentaRecienCreada('Colado');

    const [perfil] = await base.duenio.filas<{ nombre: string; rol: string; activo: boolean }>(
      'select nombre, rol, activo from public.perfiles where id = $1',
      [id],
    );
    expect(perfil).toEqual({ nombre: 'Colado', rol: 'operador', activo: false });
  });

  it('quien se registra por su cuenta no ve nada ni puede operar', async () => {
    // La segunda traba, por si el registro público quedara abierto.
    const id = await cuentaRecienCreada('Curioso');

    for (const tabla of [...TABLAS_DE_TRABAJO, ...TABLAS_DE_PLATA]) {
      expect(await base.como(id, (s) => s.filas(`select * from public.${tabla}`))).toEqual([]);
    }

    await expect(
      base.como(id, (s) => s.filas("select public.confirmar_lote('devolucion', array['CIL-00001'])")),
    ).rejects.toThrow(/No autorizado/);
  });

  it('empieza a ver recién cuando Joaquín la activa', async () => {
    const id = await cuentaRecienCreada('Nueva');
    const ve = () => base.como(id, (s) => s.filas('select id from public.clientes'));

    expect(await ve()).toEqual([]);

    await base.como(joaquin, (s) =>
      s.afectadas('update public.perfiles set activo = true where id = $1', [id]),
    );

    expect((await ve()).length).toBeGreaterThan(0);
  });

  it('el perfil se crea aunque quien crea la cuenta no pueda ejecutar la función', async () => {
    // En Supabase las cuentas las crea un servicio con su propio rol, y la
    // migración 0006 le sacó a todos el permiso de ejecutar crear_perfil. El
    // trigger tiene que dispararse igual: si no, crear un usuario daría error.
    await base.duenio.afectadas('create role servicio_de_cuentas nologin');
    await base.duenio.afectadas('grant usage on schema auth to servicio_de_cuentas');
    await base.duenio.afectadas('grant select, insert on auth.users to servicio_de_cuentas');

    const [permiso] = await base.duenio.filas<{ puede: boolean }>(
      "select has_function_privilege('servicio_de_cuentas', 'public.crear_perfil()', 'execute') as puede",
    );
    expect(permiso?.puede).toBe(false);

    let id: string | undefined;
    try {
      await base.duenio.afectadas('set role servicio_de_cuentas');
      const [cuenta] = await base.duenio.filas<{ id: string }>(
        `insert into auth.users (email, raw_user_meta_data)
         values ('por-servicio@gongas.test', '{"nombre":"Por Servicio"}') returning id`,
      );
      id = cuenta?.id;
    } finally {
      await base.duenio.afectadas('reset role');
    }

    const perfiles = await base.duenio.filas<{ nombre: string; activo: boolean }>(
      'select nombre, activo from public.perfiles where id = $1',
      [id],
    );
    expect(perfiles).toEqual([{ nombre: 'Por Servicio', activo: false }]);
  });

  it('sin sesión no se puede ejecutar ninguna función interna', async () => {
    const funciones = await base.duenio.filas<{ funcion: string }>(
      `select p.proname as funcion
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(funciones).toEqual([]);
  });

  it('el sistema no se puede quedar sin administrador', async () => {
    // Joaquín es el único administrador: ni él ni nadie lo puede desactivar.
    await expect(
      base.duenio.afectadas('update public.perfiles set activo = false where id = $1', [joaquin]),
    ).rejects.toThrow(/al menos un administrador/);

    await expect(
      base.duenio.afectadas("update public.perfiles set rol = 'operador' where id = $1", [joaquin]),
    ).rejects.toThrow(/al menos un administrador/);

    const [perfil] = await base.duenio.filas<{ rol: string; activo: boolean }>(
      'select rol, activo from public.perfiles where id = $1',
      [joaquin],
    );
    expect(perfil).toEqual({ rol: 'admin', activo: true });
  });

  it('todas las tablas tienen las reglas por fila prendidas', async () => {
    const sinReglas = await base.duenio.filas<{ tabla: string }>(
      `select c.relname as tabla
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(sinReglas).toEqual([]);
  });
});
