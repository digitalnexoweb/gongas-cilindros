import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearBase, type Base, type Sesion } from './base';

/**
 * `confirmar_lote` y `alta_cilindro`, contra la base real.
 *
 * Son los mismos casos que ya cubre `confirmarLote` en storage.test.ts, más
 * los que solo existen cuando hay varios usuarios: quién firma el movimiento,
 * quién pone la fecha, y qué pasa cuando dos personas tocan el mismo cilindro.
 */

type Lote = {
  lote_id: string;
  numero: number | null;
  fecha: string;
  hora: string;
  movimientos: { id: string; tipo: string; serie: string; cliente_id: string | null }[];
  avisos: { serie: string; tipo: string }[];
};

let base: Base;
let joaquin: string;
let ana: string;
let beto: string;
let ancap: string;
let armada: string;
let hoy: string;

/** Cada test usa series propias, así no se pisan entre ellos. */
let contador = 0;
async function cilindrosNuevos(cuantos: number): Promise<string[]> {
  const series: string[] = [];
  for (let i = 0; i < cuantos; i += 1) {
    contador += 1;
    const serie = `CIL-${String(contador).padStart(5, '0')}`;
    await base.crearCilindro(serie, 'grande');
    series.push(serie);
  }
  return series;
}

async function confirmar(
  usuario: string,
  tipo: string,
  series: string[],
  clienteId: string | null = null,
): Promise<Lote> {
  const [fila] = await base.como(usuario, (s: Sesion) =>
    s.filas<{ lote: Lote }>('select public.confirmar_lote($1, $2, $3) as lote', [
      tipo,
      series,
      clienteId,
    ]),
  );
  if (fila === undefined) throw new Error('confirmar_lote no devolvió nada');
  return fila.lote;
}

type ArriendoVisto = { cliente_id: string; fecha_entrega: string; fecha_devolucion: string | null };

function arriendosDe(serie: string): Promise<ArriendoVisto[]> {
  return base.duenio.filas<ArriendoVisto>(
    `select a.cliente_id, a.fecha_entrega, a.fecha_devolucion
     from public.arriendos a join public.cilindros c on c.id = a.cilindro_id
     where c.serie = $1
     order by a.fecha_entrega, a.fecha_devolucion nulls last`,
    [serie],
  );
}

async function abiertoDe(serie: string): Promise<ArriendoVisto | null> {
  return (await arriendosDe(serie)).find((a) => a.fecha_devolucion === null) ?? null;
}

beforeAll(async () => {
  base = await crearBase();

  joaquin = await base.crearUsuario('Joaquín', 'admin');
  ana = await base.crearUsuario('Ana');
  beto = await base.crearUsuario('Beto');

  ancap = await base.crearCliente('ANCAP');
  armada = await base.crearCliente('Armada Nacional');

  hoy = await base.hoy();
}, 60_000);

afterAll(async () => {
  await base.cerrar();
});

// ───────────────────────────────────────────────────────── Entregar y recibir

describe('confirmar_lote', () => {
  it('la entrega abre el arriendo y graba el movimiento, juntos', async () => {
    const [serie] = await cilindrosNuevos(1);

    const lote = await confirmar(ana, 'entrega', [serie!], ancap);

    expect(lote.avisos).toEqual([]);
    expect(lote.movimientos).toHaveLength(1);
    expect(lote.movimientos[0]).toMatchObject({ tipo: 'entrega', serie, cliente_id: ancap });
    expect(await abiertoDe(serie!)).toEqual({
      cliente_id: ancap,
      fecha_entrega: hoy,
      fecha_devolucion: null,
    });
  });

  it('entrega tres cilindros en un solo lote, como pide el criterio 9.2', async () => {
    const series = await cilindrosNuevos(3);

    const lote = await confirmar(ana, 'entrega', series, ancap);

    expect(lote.movimientos.map((m) => m.serie)).toEqual(series);
    for (const serie of series) {
      expect((await abiertoDe(serie))?.cliente_id).toBe(ancap);
    }

    const lotes = await base.duenio.filas<{ lote_id: string }>(
      'select distinct lote_id from public.movimientos where id = any($1)',
      [lote.movimientos.map((m) => m.id)],
    );
    expect(lotes).toEqual([{ lote_id: lote.lote_id }]);
  });

  it('la devolución cierra el arriendo y anota de qué cliente volvió', async () => {
    const [serie] = await cilindrosNuevos(1);
    await base.entregarHace(serie!, ancap, 92, ana);

    const lote = await confirmar(beto, 'devolucion', [serie!]);

    expect(lote.avisos).toEqual([]);
    expect(lote.movimientos[0]).toMatchObject({ tipo: 'devolucion', cliente_id: ancap });
    expect(await abiertoDe(serie!)).toBeNull();
    expect((await arriendosDe(serie!))[0]?.fecha_devolucion).toBe(hoy);
  });

  it('entregar algo que figura en otro cliente cierra ese arriendo y abre el nuevo', async () => {
    const [serie] = await cilindrosNuevos(1);
    await base.entregarHace(serie!, ancap, 30, ana);

    const lote = await confirmar(ana, 'entrega', [serie!], armada);

    expect(lote.avisos).toEqual([{ serie, tipo: 'ya_en_otro_cliente' }]);

    const arriendos = await arriendosDe(serie!);
    expect(arriendos).toHaveLength(2);
    expect(arriendos.filter((a) => a.fecha_devolucion === null)).toEqual([
      { cliente_id: armada, fecha_entrega: hoy, fecha_devolucion: null },
    ]);
    expect(arriendos.find((a) => a.cliente_id === ancap)?.fecha_devolucion).toBe(hoy);
  });

  it('re-entregar al mismo cliente NO pone el reloj en cero', async () => {
    // Si cerrara y abriera de nuevo, los 92 días y lo acumulado desaparecerían.
    const [serie] = await cilindrosNuevos(1);
    await base.entregarHace(serie!, ancap, 92, ana);
    const antes = await abiertoDe(serie!);

    const lote = await confirmar(ana, 'entrega', [serie!], ancap);

    expect(lote.avisos).toEqual([{ serie, tipo: 'ya_en_este_cliente' }]);
    expect(await abiertoDe(serie!)).toEqual(antes);
    expect(await arriendosDe(serie!)).toHaveLength(1);
    // El movimiento queda registrado igual: el historial cuenta lo que pasó.
    expect(lote.movimientos).toHaveLength(1);
  });

  it('recibir algo que ya figura en stock avisa y registra el movimiento igual', async () => {
    const [serie] = await cilindrosNuevos(1);

    const lote = await confirmar(ana, 'devolucion', [serie!]);

    expect(lote.avisos).toEqual([{ serie, tipo: 'ya_en_stock' }]);
    expect(lote.movimientos[0]).toMatchObject({ tipo: 'devolucion', cliente_id: null });
    expect(await arriendosDe(serie!)).toEqual([]);
  });

  it('una serie repetida en el lote se toma una sola vez', async () => {
    const [uno, otro] = await cilindrosNuevos(2);

    const lote = await confirmar(ana, 'entrega', [uno!, uno!, otro!], ancap);

    expect(lote.avisos).toEqual([{ serie: uno, tipo: 'serie_repetida' }]);
    expect(lote.movimientos.map((m) => m.serie)).toEqual([uno, otro]);
  });

  it('una serie desconocida avisa, se saltea y no crea el cilindro', async () => {
    const [conocida] = await cilindrosNuevos(1);

    const lote = await confirmar(ana, 'entrega', ['CIL-99999', conocida!], ancap);

    expect(lote.avisos).toEqual([{ serie: 'CIL-99999', tipo: 'serie_desconocida' }]);
    expect(lote.movimientos.map((m) => m.serie)).toEqual([conocida]);
    expect(
      await base.duenio.filas("select 1 from public.cilindros where serie = 'CIL-99999'"),
    ).toEqual([]);
  });

  it('Joaquín también puede operar: dar de alta un cliente, un cilindro y entregar', async () => {
    const [cliente] = await base.como(joaquin, (s) =>
      s.filas<{ id: string }>(
        "insert into public.clientes (nombre, tipo) values ('Cliente de Joaquín', 'empresa') returning id",
      ),
    );
    await base.como(joaquin, (s) => s.filas("select public.alta_cilindro('JOA-00001', 4)"));

    const lote = await confirmar(joaquin, 'entrega', ['JOA-00001'], cliente!.id);

    expect(lote.avisos).toEqual([]);
    expect((await abiertoDe('JOA-00001'))?.cliente_id).toBe(cliente!.id);
  });

  it('acepta la serie en minúsculas o con espacios', async () => {
    const [serie] = await cilindrosNuevos(1);

    const lote = await confirmar(ana, 'entrega', [`  ${serie!.toLowerCase()} `], ancap);

    expect(lote.avisos).toEqual([]);
    expect(lote.movimientos[0]?.serie).toBe(serie);
  });
});

// ─────────────────────────────────────── Lo que decide el servidor, no el celular

describe('lo que no depende del celular', () => {
  it('el movimiento queda a nombre de quien tiene la sesión', async () => {
    const [serie] = await cilindrosNuevos(1);

    const lote = await confirmar(beto, 'entrega', [serie!], ancap);

    const [movimiento] = await base.duenio.filas<{ operador: string; operador_id: string }>(
      'select operador, operador_id from public.movimientos where id = $1',
      [lote.movimientos[0]?.id],
    );
    expect(movimiento).toEqual({ operador: 'Beto', operador_id: beto });
  });

  it('la fecha la pone el servidor, en hora de Montevideo', async () => {
    const [serie] = await cilindrosNuevos(1);

    const lote = await confirmar(ana, 'entrega', [serie!], ancap);

    expect(lote.fecha).toBe(hoy);
    expect(lote.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('no hay forma de pasarle una fecha ni un operador a la función', async () => {
    // Si alguien agrega un parámetro de fecha, este test lo frena: es lo que
    // impide antedatar una devolución desde un celular.
    const [firma] = await base.duenio.filas<{ argumentos: string }>(
      `select pg_get_function_identity_arguments(p.oid) as argumentos
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'confirmar_lote'`,
    );
    expect(firma?.argumentos).toBe('p_tipo text, p_series text[], p_cliente_id uuid, p_gases text[]');
  });
});

// ───────────────────────────────────────────────────────── Varios usuarios a la vez

describe('varias personas sobre el mismo cilindro', () => {
  it('dos entregas seguidas del mismo cilindro dejan un solo arriendo abierto', async () => {
    const [serie] = await cilindrosNuevos(1);

    await confirmar(ana, 'entrega', [serie!], ancap);
    const segunda = await confirmar(beto, 'entrega', [serie!], armada);

    expect(segunda.avisos).toEqual([{ serie, tipo: 'ya_en_otro_cliente' }]);

    const abiertos = (await arriendosDe(serie!)).filter((a) => a.fecha_devolucion === null);
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]?.cliente_id).toBe(armada);
  });

  it('cada movimiento queda firmado por quien lo hizo', async () => {
    const [serie] = await cilindrosNuevos(1);

    await confirmar(ana, 'entrega', [serie!], ancap);
    await confirmar(beto, 'devolucion', [serie!]);

    const firmas = await base.duenio.filas<{ tipo: string; operador: string }>(
      `select m.tipo, m.operador
       from public.movimientos m join public.cilindros c on c.id = m.cilindro_id
       where c.serie = $1 order by m.creado_en, m.tipo desc`,
      [serie],
    );
    expect(firmas).toEqual([
      { tipo: 'entrega', operador: 'Ana' },
      { tipo: 'devolucion', operador: 'Beto' },
    ]);
  });

  it('la base rechaza un segundo arriendo abierto, aunque se lo inserten a mano', async () => {
    // Es la red de seguridad si dos lotes llegaran exactamente al mismo tiempo.
    const [serie] = await cilindrosNuevos(1);
    await confirmar(ana, 'entrega', [serie!], ancap);

    await expect(
      base.duenio.afectadas(
        `insert into public.arriendos (cilindro_id, cliente_id, fecha_entrega)
         select c.id, $2, public.hoy_montevideo() from public.cilindros c where c.serie = $1`,
        [serie, armada],
      ),
    ).rejects.toThrow(/arriendos_un_abierto_por_cilindro/);
  });
});

// ───────────────────────────────────────────────────────── Lo que no se acepta

describe('lo que confirmar_lote rechaza entero', () => {
  async function cuantosMovimientos(): Promise<number> {
    const [fila] = await base.duenio.filas<{ n: number }>(
      'select count(*)::int as n from public.movimientos',
    );
    return fila?.n ?? 0;
  }

  it('una entrega sin cliente', async () => {
    const [serie] = await cilindrosNuevos(1);
    const antes = await cuantosMovimientos();

    await expect(confirmar(ana, 'entrega', [serie!], null)).rejects.toThrow(/necesita un cliente/);
    expect(await cuantosMovimientos()).toBe(antes);
  });

  it('una entrega a un cliente que no existe', async () => {
    const [serie] = await cilindrosNuevos(1);

    await expect(
      confirmar(ana, 'entrega', [serie!], '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/El cliente no existe/);
    expect(await abiertoDe(serie!)).toBeNull();
  });

  it('un tipo de movimiento inventado', async () => {
    const [serie] = await cilindrosNuevos(1);

    await expect(confirmar(ana, 'regalo', [serie!], ancap)).rejects.toThrow(/inválido/);
  });
});

// ───────────────────────────────────────────────────────── Alta de cilindro

describe('alta_cilindro', () => {
  // 'chico' y 'grande' son atajos de 4 y 7 kg, que conservan las tarifas de 380 y 440.
  function alta(usuario: string, serie: string, peso: number | 'chico' | 'grande') {
    const kg = peso === 'chico' ? 4 : peso === 'grande' ? 7 : peso;
    return base
      .como(usuario, (s) =>
        s.filas<{ serie: string; kg: string; activo: boolean }>(
          'select serie, kg, activo from public.alta_cilindro($1, $2)',
          [serie, kg],
        ),
      )
      .then((filas) => filas.map((f) => ({ ...f, kg: Number(f.kg) })));
  }

  function tarifaDe(serie: string) {
    return base.duenio.filas<{ tarifa_mensual: string }>(
      `select t.tarifa_mensual from public.tarifas t
       join public.cilindros c on c.id = t.cilindro_id where c.serie = $1`,
      [serie],
    );
  }

  it('un empleado da de alta un cilindro al escanearlo', async () => {
    const [cilindro] = await alta(ana, 'ALTA-00001', 'grande');

    expect(cilindro).toEqual({ serie: 'ALTA-00001', kg: 7, activo: true });
  });

  it('la tarifa la pone la base según el peso: 440 a 7 kg, 380 a 4 kg', async () => {
    await alta(ana, 'ALTA-00002', 'grande');
    await alta(ana, 'ALTA-00003', 'chico');

    expect(Number((await tarifaDe('ALTA-00002'))[0]?.tarifa_mensual)).toBe(440);
    expect(Number((await tarifaDe('ALTA-00003'))[0]?.tarifa_mensual)).toBe(380);
  });

  it('quien dio de alta el cilindro sigue sin ver su tarifa', async () => {
    await alta(ana, 'ALTA-00004', 'grande');

    const tarifas = await base.como(ana, (s) => s.filas('select * from public.tarifas'));
    expect(tarifas).toEqual([]);
  });

  it('si cambia la tarifa de un peso, los cilindros nuevos nacen con la nueva', async () => {
    await base.como(joaquin, (s) =>
      s.afectadas('update public.tarifas_por_kilos set tarifa_mensual = 500 where kg = 7'),
    );

    await alta(ana, 'ALTA-00005', 'grande');
    expect(Number((await tarifaDe('ALTA-00005'))[0]?.tarifa_mensual)).toBe(500);
    // Los que ya existían no cambian solos.
    expect(Number((await tarifaDe('ALTA-00002'))[0]?.tarifa_mensual)).toBe(440);

    await base.como(joaquin, (s) =>
      s.afectadas('update public.tarifas_por_kilos set tarifa_mensual = 440 where kg = 7'),
    );
  });

  it('pasa la serie a mayúsculas', async () => {
    const [cilindro] = await alta(ana, ' alta-00006 ', 'chico');
    expect(cilindro?.serie).toBe('ALTA-00006');
  });

  it('rechaza una serie que ya existe', async () => {
    await alta(ana, 'ALTA-00007', 'chico');
    await expect(alta(beto, 'ALTA-00007', 'chico')).rejects.toThrow(/ya existe/);
  });

  it('rechaza un peso que no está en la lista', async () => {
    await expect(alta(ana, 'ALTA-00008', 5)).rejects.toThrow(/no está en la lista/);
  });

  it('rechaza una serie que no parece una serie', async () => {
    await expect(alta(ana, 'https://www.ancap.com.uy', 'chico')).rejects.toThrow(/check/);
    await expect(alta(ana, '', 'chico')).rejects.toThrow(/check/);
  });

  it('el cilindro recién dado de alta se puede entregar en el mismo momento', async () => {
    // Es el flujo real: se escanea una etiqueta nueva, se da de alta y entra al lote.
    await alta(ana, 'ALTA-00009', 'chico');

    const lote = await confirmar(ana, 'entrega', ['ALTA-00009'], ancap);

    expect(lote.avisos).toEqual([]);
    expect((await abiertoDe('ALTA-00009'))?.cliente_id).toBe(ancap);
  });
});

// ───────────────────────────────────────── El número de remito (0007)

describe('el número de lote', () => {
  it('cada lote toma el número siguiente al anterior', async () => {
    const [uno, otro] = await cilindrosNuevos(2);

    const primero = await confirmar(ana, 'entrega', [uno!], ancap);
    const segundo = await confirmar(beto, 'entrega', [otro!], armada);

    expect(primero.numero).not.toBeNull();
    expect(segundo.numero).toBe(primero.numero! + 1);
  });

  it('todos los movimientos de un lote llevan el mismo número', async () => {
    const series = await cilindrosNuevos(3);

    const lote = await confirmar(ana, 'entrega', series, ancap);

    const numeros = await base.duenio.filas<{ lote_numero: number }>(
      'select distinct lote_numero from public.movimientos where lote_id = $1',
      [lote.lote_id],
    );
    expect(numeros).toEqual([{ lote_numero: lote.numero }]);
  });

  it('un lote sin ningún movimiento no gasta número', async () => {
    const [antes] = await cilindrosNuevos(1);
    const [despues] = await cilindrosNuevos(1);

    const primero = await confirmar(ana, 'entrega', [antes!], ancap);
    // Solo series desconocidas: no se graba nada, así que no hay remito.
    const vacio = await confirmar(ana, 'entrega', ['NO-EXISTE-1', 'NO-EXISTE-2'], ancap);
    const siguiente = await confirmar(ana, 'entrega', [despues!], ancap);

    expect(vacio.numero).toBeNull();
    expect(vacio.movimientos).toEqual([]);
    expect(siguiente.numero).toBe(primero.numero! + 1);
  });

  it('dos personas que confirman lotes nunca reciben el mismo número', async () => {
    const series = await cilindrosNuevos(6);
    const usuarios = [ana, beto, ana, beto, ana, beto];

    const numeros: (number | null)[] = [];
    for (const [i, serie] of series.entries()) {
      numeros.push((await confirmar(usuarios[i]!, 'entrega', [serie], ancap)).numero);
    }

    expect(new Set(numeros).size).toBe(6);
    expect(numeros.every((n) => n !== null)).toBe(true);
  });

  it('devuelve la hora del servidor en Montevideo', async () => {
    const [serie] = await cilindrosNuevos(1);

    const lote = await confirmar(ana, 'entrega', [serie!], ancap);

    expect(lote.hora).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    const [esperada] = await base.duenio.filas<{ hora: string }>(
      "select to_char(now() at time zone 'America/Montevideo', 'HH24:MI') as hora",
    );
    expect(lote.hora).toBe(esperada?.hora);
  });

  it('nadie puede tocar la numeración directamente', async () => {
    await expect(
      base.como(ana, (s) => s.filas("select nextval('public.numero_de_lote')")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      base.como(joaquin, (s) => s.filas("select setval('public.numero_de_lote', 1)")),
    ).rejects.toThrow(/permission denied/);
  });
});
