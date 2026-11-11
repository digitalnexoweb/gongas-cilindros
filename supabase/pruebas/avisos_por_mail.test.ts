import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base } from './base';

/**
 * Los avisos automáticos por mail, del lado de la base: quién puede leer los
 * datos y registrar un mail, y que cada etapa salga una sola vez.
 *
 * Los tests corren "como el servidor" con el dueño de la base: en Supabase la
 * función del servidor entra con su clave propia, que tampoco pasa por las
 * reglas por fila.
 */

let base: Base;
let joaquin: string;
let empleado: string;
let ancap: string;
let sinMail: string;

type Datos = {
  hoy: string;
  textos: { con_cargo: string; por_vencer: string; copia_mail: string };
  arriendos: {
    arriendo_id: string;
    cliente: string;
    email: string;
    serie: string;
    fecha_entrega: string;
    tarifa_mensual: number | string | null;
    etapas_enviadas: string[];
  }[];
};

async function datos(): Promise<Datos> {
  const [fila] = await base.duenio.filas<{ d: Datos }>('select public.datos_para_avisos_por_mail() as d');
  if (fila === undefined) throw new Error('Sin datos');
  return fila.d;
}

async function idDeArriendo(serie: string): Promise<string> {
  const [fila] = await base.duenio.filas<{ id: string }>(
    `select a.id from public.arriendos a join public.cilindros c on c.id = a.cilindro_id
     where c.serie = $1 and a.fecha_devolucion is null`,
    [serie],
  );
  if (fila === undefined) throw new Error(`Sin arriendo abierto para ${serie}`);
  return fila.id;
}

beforeAll(async () => {
  base = await crearBase();

  joaquin = await base.crearUsuario('Joaquín', 'admin');
  empleado = await base.crearUsuario('Ana');

  ancap = await base.crearCliente('ANCAP');
  await base.duenio.afectadas("update public.clientes set email = 'compras@ancap.test' where id = $1", [ancap]);
  sinMail = await base.crearCliente('Taller Sin Mail');

  await base.crearCilindro('CIL-00101', 'grande');
  await base.entregarHace('CIL-00101', ancap, 92, empleado); // con cargo
  await base.crearCilindro('CIL-00102', 'chico');
  await base.entregarHace('CIL-00102', ancap, 57, empleado); // por vencer
  await base.crearCilindro('CIL-00103', 'chico');
  await base.entregarHace('CIL-00103', ancap, 20, empleado); // todavía nada
  await base.crearCilindro('CIL-00104', 'chico');
  await base.entregarHace('CIL-00104', sinMail, 92, empleado); // sin mail
}, 60_000);

afterAll(async () => {
  await base.cerrar();
});

describe('el mail del cliente', () => {
  it('Joaquín lo carga y lo corrige', async () => {
    const tocadas = await base.como(joaquin, (s) =>
      s.afectadas("update public.clientes set email = 'pagos@taller.test' where id = $1", [sinMail]),
    );
    expect(tocadas).toBe(1);
    await base.duenio.afectadas("update public.clientes set email = '' where id = $1", [sinMail]);
  });

  it('rechaza algo que no es un mail', async () => {
    await expect(
      base.duenio.afectadas("update public.clientes set email = 'no es un mail' where id = $1", [ancap]),
    ).rejects.toThrow(/check/);
  });
});

describe('datos_para_avisos_por_mail', () => {
  it('trae solo los arriendos de 54 días o más cuyo cliente tiene mail', async () => {
    const d = await datos();

    expect(d.arriendos.map((a) => a.serie).sort()).toEqual(['CIL-00101', 'CIL-00102']);
    expect(d.arriendos.every((a) => a.email === 'compras@ancap.test')).toBe(true);
    expect(d.hoy).toBe(await base.hoy());
    expect(d.textos.copia_mail).toBe('info@gongasuruguay.com');
  });

  it('el empleado y Joaquín no la pueden llamar: es solo del servidor', async () => {
    for (const quien of [empleado, joaquin]) {
      await expect(
        base.como(quien, (s) => s.filas('select public.datos_para_avisos_por_mail()')),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      base.como(null, (s) => s.filas('select public.datos_para_avisos_por_mail()')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('registrar_aviso_por_mail', () => {
  it('registra el mail como automático, con su etapa y su destino', async () => {
    const arriendo = await idDeArriendo('CIL-00101');

    const [r] = await base.duenio.filas<{ ok: boolean }>(
      "select public.registrar_aviso_por_mail($1, 'con_cargo', 'compras@ancap.test') as ok",
      [arriendo],
    );
    expect(r?.ok).toBe(true);

    const [aviso] = await base.duenio.filas<Record<string, unknown>>(
      "select canal, etapa, destino, operador, operador_id, dias from public.avisos where arriendo_id = $1 and canal = 'mail'",
      [arriendo],
    );
    expect(aviso).toEqual({
      canal: 'mail',
      etapa: 'con_cargo',
      destino: 'compras@ancap.test',
      operador: 'Automático',
      operador_id: null,
      dias: 92,
    });
  });

  it('la misma etapa no se registra dos veces', async () => {
    const arriendo = await idDeArriendo('CIL-00101');

    const [r] = await base.duenio.filas<{ ok: boolean }>(
      "select public.registrar_aviso_por_mail($1, 'con_cargo', 'compras@ancap.test') as ok",
      [arriendo],
    );
    expect(r?.ok).toBe(false);

    const [n] = await base.duenio.filas<{ n: number }>(
      "select count(*)::int as n from public.avisos where arriendo_id = $1 and canal = 'mail'",
      [arriendo],
    );
    expect(n?.n).toBe(1);
  });

  it('después de registrarlo, los datos dicen qué etapa ya salió', async () => {
    const d = await datos();
    expect(d.arriendos.find((a) => a.serie === 'CIL-00101')?.etapas_enviadas).toEqual(['con_cargo']);
    expect(d.arriendos.find((a) => a.serie === 'CIL-00102')?.etapas_enviadas).toEqual([]);
  });

  it('un WhatsApp de la misma etapa no le impide al mail salir', async () => {
    const arriendo = await idDeArriendo('CIL-00102');
    await base.como(joaquin, (s) => s.filas('select public.registrar_aviso($1)', [arriendo]));

    const [r] = await base.duenio.filas<{ ok: boolean }>(
      "select public.registrar_aviso_por_mail($1, 'por_vencer', 'compras@ancap.test') as ok",
      [arriendo],
    );
    expect(r?.ok).toBe(true);
  });

  it('nadie con sesión lo puede llamar', async () => {
    const arriendo = await idDeArriendo('CIL-00103');
    await expect(
      base.como(joaquin, (s) =>
        s.filas("select public.registrar_aviso_por_mail($1, 'por_vencer', 'x@y.test')", [arriendo]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('registrar_aviso (WhatsApp) después de la 0011', () => {
  it('guarda canal WhatsApp, la etapa según los días, y quién fue', async () => {
    const arriendo = await idDeArriendo('CIL-00103');
    await base.como(empleado, (s) => s.filas('select public.registrar_aviso($1)', [arriendo]));

    const [aviso] = await base.duenio.filas<Record<string, unknown>>(
      'select canal, etapa, operador, destino from public.avisos where arriendo_id = $1',
      [arriendo],
    );
    expect(aviso).toEqual({ canal: 'whatsapp', etapa: 'por_vencer', operador: 'Ana', destino: null });
  });

  it('un mail sin destino, o un WhatsApp sin persona, no entran ni por el dueño', async () => {
    const arriendo = await idDeArriendo('CIL-00103');
    await expect(
      base.duenio.afectadas(
        `insert into public.avisos (arriendo_id, cilindro_id, cliente_id, dias, etapa, canal, operador)
         select id, cilindro_id, cliente_id, 1, 'por_vencer', 'mail', 'x' from public.arriendos where id = $1`,
        [arriendo],
      ),
    ).rejects.toThrow(/avisos_canal_coherente/);
  });
});

describe('la copia oculta', () => {
  it('Joaquín la cambia o la deja vacía; el empleado no', async () => {
    expect(
      await base.como(joaquin, (s) => s.afectadas("update public.textos_aviso set copia_mail = ''")),
    ).toBe(1);
    expect(
      await base.como(empleado, (s) => s.afectadas("update public.textos_aviso set copia_mail = 'yo@ana.test'")),
    ).toBe(0);

    const [t] = await base.duenio.filas<{ copia_mail: string }>('select copia_mail from public.textos_aviso');
    expect(t?.copia_mail).toBe('');
  });
});
