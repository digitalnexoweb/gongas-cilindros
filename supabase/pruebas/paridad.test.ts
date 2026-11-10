import { describe, expect, it } from 'vitest';

import { sumarDias } from '../../src/dominio/arriendo';
import { confirmarLote } from '../../src/dominio/storage';
import type { EstadoApp, TipoMovimiento } from '../../src/dominio/tipos';
import { crearBase, type Base } from './base';

/**
 * La misma regla está escrita dos veces: en TypeScript (`confirmarLote`, con
 * sus 29 tests) y en SQL (`confirmar_lote`, la que de verdad graba). Este test
 * les pasa los mismos lotes a las dos y exige que dejen todo igual.
 *
 * Si alguien cambia una regla en un lado y se olvida del otro, falla acá.
 */

type Paso = {
  tipo: TipoMovimiento;
  series: string[];
  /** Nombre del cliente, o null en las devoluciones. */
  cliente: string | null;
};

type Escenario = {
  nombre: string;
  /** Cilindros que arrancan ya entregados: serie → [cliente, hace cuántos días]. */
  yaEntregados?: Record<string, [string, number]>;
  pasos: Paso[];
};

const CLIENTES = ['ANCAP', 'Armada Nacional'];
const SERIES = ['CIL-00001', 'CIL-00002', 'CIL-00003', 'CIL-00004', 'CIL-00005'];

const escenarios: Escenario[] = [
  {
    nombre: 'un lote simple, con una serie repetida',
    pasos: [
      { tipo: 'entrega', series: ['CIL-00001', 'CIL-00002', 'CIL-00002', 'CIL-00003'], cliente: 'ANCAP' },
    ],
  },
  {
    nombre: 'un cilindro que se muda de cliente sin pasar por el depósito',
    pasos: [
      { tipo: 'entrega', series: ['CIL-00001'], cliente: 'ANCAP' },
      { tipo: 'entrega', series: ['CIL-00001'], cliente: 'Armada Nacional' },
    ],
  },
  {
    nombre: 're-entrega al mismo cliente: el reloj no se toca',
    yaEntregados: { 'CIL-00001': ['ANCAP', 92] },
    pasos: [{ tipo: 'entrega', series: ['CIL-00001'], cliente: 'ANCAP' }],
  },
  {
    nombre: 'devoluciones: una normal, una de algo en stock y una serie desconocida',
    yaEntregados: { 'CIL-00001': ['ANCAP', 75] },
    pasos: [{ tipo: 'devolucion', series: ['CIL-00001', 'CIL-00002', 'CIL-99999'], cliente: null }],
  },
  {
    nombre: 'un día movido, con de todo',
    yaEntregados: { 'CIL-00004': ['Armada Nacional', 58], 'CIL-00005': ['ANCAP', 20] },
    pasos: [
      { tipo: 'entrega', series: ['CIL-00001', 'CIL-00002'], cliente: 'ANCAP' },
      { tipo: 'devolucion', series: ['CIL-00001', 'CIL-00004'], cliente: null },
      { tipo: 'entrega', series: ['CIL-00001', 'CIL-00003', 'CIL-00005'], cliente: 'Armada Nacional' },
      { tipo: 'devolucion', series: ['CIL-00002', 'CIL-00002', 'CIL-88888'], cliente: null },
      { tipo: 'entrega', series: ['CIL-00002', 'CIL-00004'], cliente: 'ANCAP' },
      { tipo: 'devolucion', series: ['CIL-00003', 'CIL-00003'], cliente: null },
    ],
  },
];

/** Lo que tienen que tener igual los dos mundos, sin ids ni horas. */
type Foto = {
  arriendos: string[];
  movimientos: string[];
};

function fotoDeTS(estado: EstadoApp): Foto {
  const serie = (id: string) => estado.cilindros.find((c) => c.id === id)?.serie ?? '?';
  const cliente = (id: string | null) =>
    id === null ? 'stock' : (estado.clientes.find((c) => c.id === id)?.nombre ?? '?');

  return {
    arriendos: estado.arriendos
      .map((a) => `${serie(a.cilindroId)} | ${cliente(a.clienteId)} | ${a.fechaEntrega} → ${a.fechaDevolucion ?? 'abierto'}`)
      .sort(),
    movimientos: estado.movimientos
      .map((m) => `${m.fecha} | ${m.tipo} | ${serie(m.cilindroId)} | ${cliente(m.clienteId)}`)
      .sort(),
  };
}

async function fotoDeSQL(base: Base): Promise<Foto> {
  const arriendos = await base.duenio.filas<{ linea: string }>(
    `select c.serie || ' | ' || k.nombre || ' | ' || a.fecha_entrega || ' → ' || coalesce(a.fecha_devolucion::text, 'abierto') as linea
     from public.arriendos a
     join public.cilindros c on c.id = a.cilindro_id
     join public.clientes k on k.id = a.cliente_id`,
  );
  const movimientos = await base.duenio.filas<{ linea: string }>(
    `select m.fecha || ' | ' || m.tipo || ' | ' || c.serie || ' | ' || coalesce(k.nombre, 'stock') as linea
     from public.movimientos m
     join public.cilindros c on c.id = m.cilindro_id
     left join public.clientes k on k.id = m.cliente_id`,
  );

  return {
    arriendos: arriendos.map((a) => a.linea).sort(),
    movimientos: movimientos.map((m) => m.linea).sort(),
  };
}

describe('paridad entre confirmarLote (TypeScript) y confirmar_lote (SQL)', () => {
  it.each(escenarios)(
    '$nombre',
    async ({ yaEntregados = {}, pasos }) => {
      const base = await crearBase();

      try {
        const operador = await base.crearUsuario('Ana');
        const hoy = await base.hoy();

        // ── El mismo punto de partida en los dos mundos.
        const idCliente: Record<string, string> = {};
        for (const nombre of CLIENTES) idCliente[nombre] = await base.crearCliente(nombre);

        const idCilindro: Record<string, string> = {};
        for (const serie of SERIES) idCilindro[serie] = await base.crearCilindro(serie, 'grande');

        let estado: EstadoApp = {
          version: 1,
          operador: 'Ana',
          clientes: CLIENTES.map((nombre) => ({
            id: idCliente[nombre]!,
            nombre,
            tipo: 'empresa',
            documento: '',
            telefono: '',
          })),
          cilindros: SERIES.map((serie) => ({
            id: idCilindro[serie]!,
            serie,
            tipoGas: 'acetileno',
            tamano: 'grande',
            tarifaMensual: 440,
            activo: true,
          })),
          arriendos: [],
          movimientos: [],
        };

        for (const [serie, [cliente, dias]] of Object.entries(yaEntregados)) {
          await base.entregarHace(serie, idCliente[cliente]!, dias, operador);

          const fecha = sumarDias(hoy, -dias);
          estado = {
            ...estado,
            arriendos: [
              ...estado.arriendos,
              {
                id: `previo-${serie}`,
                cilindroId: idCilindro[serie]!,
                clienteId: idCliente[cliente]!,
                fechaEntrega: fecha,
                fechaDevolucion: null,
              },
            ],
            movimientos: [
              ...estado.movimientos,
              {
                id: `previo-${serie}`,
                tipo: 'entrega',
                cilindroId: idCilindro[serie]!,
                clienteId: idCliente[cliente]!,
                fecha,
                loteId: 'previo',
                operador: 'Ana',
              },
            ],
          };
        }

        expect(await fotoDeSQL(base)).toEqual(fotoDeTS(estado));

        // ── Cada lote pasa por los dos lados, y después se comparan.
        for (const [i, paso] of pasos.entries()) {
          const clienteId = paso.cliente === null ? null : idCliente[paso.cliente]!;

          const enTS = confirmarLote(estado, {
            tipo: paso.tipo,
            series: paso.series,
            clienteId,
            operador: 'Ana',
            fecha: hoy,
          });
          estado = enTS.estado;

          const [fila] = await base.como(operador, (s) =>
            s.filas<{ lote: { avisos: { serie: string; tipo: string }[] } }>(
              'select public.confirmar_lote($1, $2, $3) as lote',
              [paso.tipo, paso.series, clienteId],
            ),
          );

          const etiqueta = `paso ${i + 1} (${paso.tipo} de ${paso.series.join(', ')})`;

          expect(fila?.lote.avisos, `avisos del ${etiqueta}`).toEqual(
            enTS.avisos.map((a) => ({ serie: a.serie, tipo: a.tipo })),
          );
          expect(await fotoDeSQL(base), `estado después del ${etiqueta}`).toEqual(fotoDeTS(estado));
        }
      } finally {
        await base.cerrar();
      }
    },
    60_000,
  );
});
