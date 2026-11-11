import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base } from './base';

/**
 * La etapa C: lo que solo el administrador puede hacer desde la app, probado
 * como lo pediría cada uno, con las reglas por fila aplicadas.
 */

let base: Base;
let joaquin: string;
let empleado: string;
let desactivado: string;
let pendiente: string;
let ancap: string;

beforeAll(async () => {
  base = await crearBase();

  joaquin = await base.crearUsuario('Joaquín', 'admin');
  empleado = await base.crearUsuario('Empleado Uno');
  desactivado = await base.crearUsuario('Ex Empleado', 'operador', false);
  pendiente = await base.crearUsuario('Recién Llegado', 'operador', false);

  ancap = await base.crearCliente('ANCAP');
}, 60_000);

afterAll(async () => {
  await base.cerrar();
});

async function tarifaDe(serie: string): Promise<number> {
  const [fila] = await base.duenio.filas<{ t: string }>(
    `select t.tarifa_mensual as t from public.tarifas t
     join public.cilindros c on c.id = t.cilindro_id where c.serie = $1`,
    [serie],
  );
  return Number(fila?.t);
}

async function tarifaDeTamano(tamano: string): Promise<number> {
  const [fila] = await base.duenio.filas<{ t: string }>(
    'select tarifa_mensual as t from public.tarifas_por_tamano where tamano = $1',
    [tamano],
  );
  return Number(fila?.t);
}

// ───────────────────────────────────────────────────────── usuarios()

describe('usuarios()', () => {
  it('le da a Joaquín cada cuenta con su mail, primero las que esperan activación', async () => {
    const filas = await base.como(joaquin, (s) =>
      s.filas<{ email: string; nombre: string; activo: boolean }>('select * from public.usuarios()'),
    );

    expect(filas).toHaveLength(4);
    expect(filas.find((f) => f.nombre === 'Recién Llegado')?.email).toBe('recién.llegado@gongas.test');
    // Las inactivas van arriba.
    expect(filas.slice(0, 2).every((f) => !f.activo)).toBe(true);
  });

  it.each([
    ['el empleado', () => empleado],
    ['un usuario desactivado', () => desactivado],
  ])('%s no puede ver la lista ni los mails', async (_quien, id) => {
    await expect(base.como(id(), (s) => s.filas('select * from public.usuarios()'))).rejects.toThrow(
      /No autorizado/,
    );
  });

  it('sin sesión ni siquiera se puede llamar', async () => {
    await expect(base.como(null, (s) => s.filas('select * from public.usuarios()'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

// ───────────────────────────────────────────────────────── Perfiles

describe('activar y editar cuentas', () => {
  it('Joaquín activa una cuenta pendiente, le pone nombre y rol', async () => {
    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas("update public.perfiles set activo = true, nombre = 'Juan' where id = $1", [pendiente]),
    );
    expect(tocadas).toBe(1);

    const [perfil] = await base.duenio.filas<{ nombre: string; activo: boolean; rol: string }>(
      'select nombre, activo, rol from public.perfiles where id = $1',
      [pendiente],
    );
    expect(perfil).toEqual({ nombre: 'Juan', activo: true, rol: 'operador' });
  });

  it('el empleado no puede activarse ni subirse de rol', async () => {
    const tocadas = await base.como(empleado, (s) =>
      s.afectadas("update public.perfiles set rol = 'admin' where id = $1", [empleado]),
    );
    expect(tocadas).toBe(0);
  });

  it('Joaquín no puede dejar el sistema sin administrador', async () => {
    await expect(
      base.como(joaquin, (s) =>
        s.afectadas("update public.perfiles set rol = 'operador' where id = $1", [joaquin]),
      ),
    ).rejects.toThrow(/al menos un administrador/);
  });
});

// ───────────────────────────────────────────────────────── Clientes

describe('editar clientes', () => {
  it('Joaquín corrige los datos de un cliente', async () => {
    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas("update public.clientes set telefono = '+59899222333' where id = $1", [ancap]),
    );
    expect(tocadas).toBe(1);
  });

  it('el empleado no puede, aunque lo intente directo', async () => {
    const tocadas = await base.como(empleado, (s) =>
      s.afectadas("update public.clientes set nombre = 'Otro' where id = $1", [ancap]),
    );
    expect(tocadas).toBe(0);
  });
});

// ───────────────────────────────────────────────────────── Tarifas

describe('cambiar_tarifa_por_tamano', () => {
  it('cambia el tamaño y sus cilindros, menos los que tienen precio propio', async () => {
    await base.crearCilindro('CIL-00101', 'grande');
    await base.crearCilindro('CIL-00102', 'grande');
    await base.crearCilindro('CIL-00103', 'chico');
    // Un precio propio, puesto a mano.
    await base.duenio.afectadas(
      `update public.tarifas set tarifa_mensual = 500
       where cilindro_id = (select id from public.cilindros where serie = 'CIL-00102')`,
    );

    const [resultado] = await base.como(joaquin, (s) =>
      s.filas<{ cambiados: number }>("select public.cambiar_tarifa_por_tamano('grande', 480) as cambiados"),
    );

    expect(resultado?.cambiados).toBe(1);
    expect(await tarifaDeTamano('grande')).toBe(480);
    expect(await tarifaDe('CIL-00101')).toBe(480);
    expect(await tarifaDe('CIL-00102')).toBe(500);
    expect(await tarifaDe('CIL-00103')).toBe(380);
  });

  it('un cilindro nuevo nace con el precio nuevo', async () => {
    await base.como(joaquin, (s) => s.filas("select public.alta_cilindro('CIL-00104', 'grande')"));
    expect(await tarifaDe('CIL-00104')).toBe(480);
  });

  it('rechaza un precio negativo y un tamaño que no existe', async () => {
    await expect(
      base.como(joaquin, (s) => s.filas("select public.cambiar_tarifa_por_tamano('grande', -1)")),
    ).rejects.toThrow(/mayor o igual a cero/);
    await expect(
      base.como(joaquin, (s) => s.filas("select public.cambiar_tarifa_por_tamano('mediano', 400)")),
    ).rejects.toThrow(/Tamaño inválido/);
  });

  it.each([
    ['el empleado', () => empleado],
    ['un usuario desactivado', () => desactivado],
  ])('%s no puede cambiar precios', async (_quien, id) => {
    await expect(
      base.como(id(), (s) => s.filas("select public.cambiar_tarifa_por_tamano('chico', 1)")),
    ).rejects.toThrow(/No autorizado/);
    expect(await tarifaDeTamano('chico')).toBe(380);
  });
});

// ───────────────────────────────────────────────────────── Cilindros

describe('editar_cilindro', () => {
  it('cambia tamaño, gas y tarifa juntos', async () => {
    const id = await base.crearCilindro('CIL-00201', 'chico');

    await base.como(joaquin, (s) =>
      s.filas("select public.editar_cilindro($1, 'grande', 'oxígeno', 450, true)", [id]),
    );

    const [cilindro] = await base.duenio.filas<{ tamano: string; tipo_gas: string; serie: string }>(
      'select tamano, tipo_gas, serie from public.cilindros where id = $1',
      [id],
    );
    expect(cilindro).toEqual({ tamano: 'grande', tipo_gas: 'oxígeno', serie: 'CIL-00201' });
    expect(await tarifaDe('CIL-00201')).toBe(450);
  });

  it('da de baja un cilindro que está en stock', async () => {
    const id = await base.crearCilindro('CIL-00202', 'chico');

    await base.como(joaquin, (s) =>
      s.filas("select public.editar_cilindro($1, 'chico', 'acetileno', 380, false)", [id]),
    );

    const [cilindro] = await base.duenio.filas<{ activo: boolean }>(
      'select activo from public.cilindros where id = $1',
      [id],
    );
    expect(cilindro?.activo).toBe(false);
  });

  it('NO da de baja un cilindro que está en un cliente, y no cambia nada', async () => {
    const id = await base.crearCilindro('CIL-00203', 'chico');
    await base.entregarHace('CIL-00203', ancap, 10, empleado);

    await expect(
      base.como(joaquin, (s) =>
        s.filas("select public.editar_cilindro($1, 'grande', 'acetileno', 999, false)", [id]),
      ),
    ).rejects.toThrow(/Primero hay que recibirlo/);

    expect(await tarifaDe('CIL-00203')).toBe(380);
  });

  it('el empleado no puede editar un cilindro', async () => {
    const id = await base.crearCilindro('CIL-00204', 'chico');

    await expect(
      base.como(empleado, (s) =>
        s.filas("select public.editar_cilindro($1, 'grande', 'acetileno', 0, true)", [id]),
      ),
    ).rejects.toThrow(/No autorizado/);
    expect(await tarifaDe('CIL-00204')).toBe(380);
  });

  it('rechaza una tarifa negativa', async () => {
    const id = await base.crearCilindro('CIL-00205', 'chico');

    await expect(
      base.como(joaquin, (s) =>
        s.filas("select public.editar_cilindro($1, 'chico', 'acetileno', -5, true)", [id]),
      ),
    ).rejects.toThrow(/mayor o igual a cero/);
  });
});
