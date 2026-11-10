/**
 * Un Postgres de verdad adentro de los tests.
 *
 * PGlite es Postgres compilado a WebAssembly: corre en memoria, sin instalar
 * nada y sin conectarse a ningún lado. Acá se le aplican las mismas
 * migraciones que después van a Supabase, así que lo que se prueba es el SQL
 * real, con sus reglas por fila y sus funciones.
 *
 * Lo único que hay que imitar de Supabase son tres cosas que la plataforma trae
 * puestas: los roles `anon` y `authenticated`, la tabla `auth.users` y la
 * función `auth.uid()`, que lee quién es el usuario de la sesión.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite, types } from '@electric-sql/pglite';

const MIGRACIONES = fileURLToPath(new URL('../migrations', import.meta.url));

const LO_QUE_TRAE_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;

  create schema auth;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );

  -- Igual que en Supabase: el usuario sale del token de la sesión.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
      ''
    )::uuid
  $$;

  grant usage on schema public, auth to anon, authenticated;
`;

type Ejecutor = {
  query<T>(sql: string, parametros?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
};

export type Sesion = {
  /** Las filas que devuelve la consulta. */
  filas<T = Record<string, unknown>>(sql: string, parametros?: unknown[]): Promise<T[]>;
  /** Cuántas filas tocó un insert, update o delete. */
  afectadas(sql: string, parametros?: unknown[]): Promise<number>;
};

function sesionSobre(ejecutor: Ejecutor): Sesion {
  return {
    filas: async <T,>(sql: string, parametros?: unknown[]) =>
      (await ejecutor.query<T>(sql, parametros)).rows,
    afectadas: async (sql, parametros) => (await ejecutor.query(sql, parametros)).affectedRows ?? 0,
  };
}

export type Base = {
  /** Como dueño de la base, salteando las reglas. Solo para preparar datos. */
  duenio: Sesion;

  /**
   * Como ese usuario, con las reglas por fila aplicadas, igual que cuando
   * entra desde la app. `null` es alguien sin sesión.
   */
  como<T>(usuarioId: string | null, tarea: (sesion: Sesion) => Promise<T>): Promise<T>;

  crearUsuario(nombre: string, rol?: 'admin' | 'operador', activo?: boolean): Promise<string>;
  crearCliente(nombre: string): Promise<string>;
  crearCilindro(serie: string, tamano?: 'chico' | 'grande'): Promise<string>;

  /** Deja un arriendo abierto desde hace `dias`, con su movimiento de entrega. */
  entregarHace(serie: string, clienteId: string, dias: number, operadorId: string): Promise<void>;

  /** La fecha de hoy según el servidor, en hora de Montevideo. */
  hoy(): Promise<string>;

  cerrar(): Promise<void>;
};

export async function crearBase(): Promise<Base> {
  const db = new PGlite({
    // Las fechas se quedan como texto 'YYYY-MM-DD'. Convertirlas a Date es
    // justo el error de zona horaria que el proyecto entero evita.
    parsers: { [types.DATE]: (valor: string) => valor },
  });

  await db.exec(LO_QUE_TRAE_SUPABASE);

  for (const archivo of readdirSync(MIGRACIONES).sort()) {
    if (!archivo.endsWith('.sql')) continue;
    await db.exec(readFileSync(join(MIGRACIONES, archivo), 'utf8'));
  }

  const duenio = sesionSobre(db);

  async function uno<T>(sql: string, parametros?: unknown[]): Promise<T> {
    const [fila] = await duenio.filas<T>(sql, parametros);
    if (fila === undefined) throw new Error(`La consulta no devolvió filas: ${sql}`);
    return fila;
  }

  return {
    duenio,

    como: (usuarioId, tarea) =>
      db.transaction(async (tx) => {
        await tx.exec(`set local role ${usuarioId === null ? 'anon' : 'authenticated'}`);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [
          usuarioId === null ? '' : JSON.stringify({ sub: usuarioId, role: 'authenticated' }),
        ]);
        return tarea(sesionSobre(tx));
      }),

    async crearUsuario(nombre, rol = 'operador', activo = true) {
      // Crear la cuenta dispara el trigger que le arma el perfil.
      const { id } = await uno<{ id: string }>(
        'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
        [`${nombre.toLowerCase().replace(/\s+/g, '.')}@gongas.test`, JSON.stringify({ nombre })],
      );

      // Una cuenta nueva nace desactivada (0004): acá se la deja como la pide el test.
      await duenio.afectadas('update public.perfiles set rol = $2, activo = $3 where id = $1', [
        id,
        rol,
        activo,
      ]);

      return id;
    },

    async crearCliente(nombre) {
      const { id } = await uno<{ id: string }>(
        "insert into public.clientes (nombre, tipo, telefono) values ($1, 'empresa', '+59899100100') returning id",
        [nombre],
      );
      return id;
    },

    async crearCilindro(serie, tamano = 'chico') {
      const { id } = await uno<{ id: string }>(
        'insert into public.cilindros (serie, tamano) values ($1, $2) returning id',
        [serie, tamano],
      );
      await duenio.afectadas(
        `insert into public.tarifas (cilindro_id, tarifa_mensual)
         select $1, tarifa_mensual from public.tarifas_por_tamano where tamano = $2`,
        [id, tamano],
      );
      return id;
    },

    async entregarHace(serie, clienteId, dias, operadorId) {
      const { id } = await uno<{ id: string }>('select id from public.cilindros where serie = $1', [
        serie,
      ]);

      await duenio.afectadas(
        `insert into public.arriendos (cilindro_id, cliente_id, fecha_entrega)
         values ($1, $2, public.hoy_montevideo() - $3::int)`,
        [id, clienteId, dias],
      );
      await duenio.afectadas(
        `insert into public.movimientos (tipo, cilindro_id, cliente_id, fecha, lote_id, operador_id, operador)
         select 'entrega', $1, $2, public.hoy_montevideo() - $3::int, gen_random_uuid(), p.id, p.nombre
         from public.perfiles p where p.id = $4`,
        [id, clienteId, dias, operadorId],
      );
    },

    async hoy() {
      return (await uno<{ hoy: string }>('select public.hoy_montevideo() as hoy')).hoy;
    },

    cerrar: () => db.close(),
  };
}
