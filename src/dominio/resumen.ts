/**
 * El resumen mensual de la sección 6.5.
 *
 * El mes muestra **lo devengado en ese mes**, no el acumulado hasta esa fecha.
 * Esa elección es la que hace que los meses se puedan sumar sin pisarse: la
 * suma de todos los meses de un cilindro da exactamente su acumulado de
 * siempre, y hay un test que lo amarra. Sin eso, un CSV no sirve para cobrar.
 */

import {
  DIAS_GRACIA,
  diasEntre,
  sumarDias,
  tarifaDiaria,
  type FechaISO,
} from './arriendo';
import type { Arriendo, Cliente, EstadoApp } from './tipos';

/** Un mes, como texto `YYYY-MM`. */
export type Mes = string;

const FORMATO_MES = /^(\d{4})-(\d{2})$/;

const NOMBRES_DE_MES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function partirMes(mes: Mes): { anio: number; numero: number } {
  const partes = FORMATO_MES.exec(mes);
  if (!partes) throw new Error(`Mes inválido: "${mes}". Se espera el formato YYYY-MM.`);

  const anio = Number(partes[1]);
  const numero = Number(partes[2]);
  if (numero < 1 || numero > 12) throw new Error(`Mes inexistente: "${mes}".`);

  return { anio, numero };
}

export function mesDe(fecha: FechaISO): Mes {
  return fecha.slice(0, 7);
}

export function primerDiaDelMes(mes: Mes): FechaISO {
  partirMes(mes);
  return `${mes}-01`;
}

export function ultimoDiaDelMes(mes: Mes): FechaISO {
  const { anio, numero } = partirMes(mes);
  // El día 0 del mes siguiente es el último de este, y así febrero se arregla solo.
  const ultimo = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, '0')}`;
}

export function mesSiguiente(mes: Mes): Mes {
  const { anio, numero } = partirMes(mes);
  return numero === 12 ? `${anio + 1}-01` : `${anio}-${String(numero + 1).padStart(2, '0')}`;
}

export function nombreDelMes(mes: Mes): string {
  const { anio, numero } = partirMes(mes);
  return `${NOMBRES_DE_MES[numero - 1] ?? ''} de ${anio}`;
}

/**
 * Cuántos días facturables de ese arriendo caen dentro del mes.
 *
 * Es el cruce de dos intervalos: el de los días que generan cargo, que arranca
 * el día 61 y termina en la devolución o en hoy, y el del mes. Como las fechas
 * son texto `YYYY-MM-DD`, compararlas con `<` ya es compararlas en orden
 * cronológico y no hay que convertir nada.
 */
export function diasFacturablesEnMes(
  arriendo: Pick<Arriendo, 'fechaEntrega' | 'fechaDevolucion'>,
  mes: Mes,
  hoy: FechaISO,
): number {
  const inicioDelCargo = sumarDias(arriendo.fechaEntrega, DIAS_GRACIA + 1);
  const finDelArriendo = arriendo.fechaDevolucion ?? hoy;

  const primero = primerDiaDelMes(mes);
  const ultimo = ultimoDiaDelMes(mes);

  const desde = inicioDelCargo > primero ? inicioDelCargo : primero;
  const hasta = finDelArriendo < ultimo ? finDelArriendo : ultimo;

  return hasta < desde ? 0 : diasEntre(desde, hasta) + 1;
}

/** El importe devengado por ese arriendo en ese mes, en pesos enteros. */
export function importeEnMes(
  arriendo: Pick<Arriendo, 'fechaEntrega' | 'fechaDevolucion'>,
  tarifaMensual: number,
  mes: Mes,
  hoy: FechaISO,
): number {
  return Math.round(diasFacturablesEnMes(arriendo, mes, hoy) * tarifaDiaria(tarifaMensual));
}

export type FilaResumen = {
  cliente: Cliente;
  /** Cuántos cilindros le generaron cargo en el mes. */
  cilindros: number;
  diasFacturables: number;
  total: number;
};

export type ResumenMensual = {
  mes: Mes;
  /** Solo los clientes con cargos en el mes. */
  filas: FilaResumen[];
  total: number;
};

/**
 * Devuelve `null` si falta la tarifa de algún cilindro que generó cargo en el
 * mes. Pasa cuando quien mira no puede ver tarifas: antes que un total armado
 * con datos a medias, no se calcula nada.
 */
export function resumenDelMes(
  estado: EstadoApp,
  mes: Mes,
  hoy: FechaISO,
): ResumenMensual | null {
  const porCliente = new Map<string, FilaResumen>();

  for (const arriendo of estado.arriendos) {
    const dias = diasFacturablesEnMes(arriendo, mes, hoy);
    if (dias === 0) continue;

    const cilindro = estado.cilindros.find((c) => c.id === arriendo.cilindroId);
    const cliente = estado.clientes.find((c) => c.id === arriendo.clienteId);
    if (cilindro === undefined || cliente === undefined) continue;
    if (cilindro.tarifaMensual === null) return null;

    const fila = porCliente.get(cliente.id) ?? {
      cliente,
      cilindros: 0,
      diasFacturables: 0,
      total: 0,
    };

    fila.cilindros += 1;
    fila.diasFacturables += dias;
    // Se redondea por cilindro y por mes, igual que importeArriendo redondea por cilindro.
    fila.total += Math.round(dias * tarifaDiaria(cilindro.tarifaMensual));

    porCliente.set(cliente.id, fila);
  }

  // En el orden de los clientes, no en el de los arriendos.
  const filas = estado.clientes
    .map((c) => porCliente.get(c.id))
    .filter((f): f is FilaResumen => f !== undefined);

  return { mes, filas, total: filas.reduce((suma, f) => suma + f.total, 0) };
}

/** Los meses del selector: desde el movimiento más viejo hasta hoy, el actual primero. */
export function mesesConMovimiento(estado: EstadoApp, hoy: FechaISO): Mes[] {
  const mesActual = mesDe(hoy);

  const masVieja = estado.movimientos.reduce<FechaISO | null>(
    (menor, m) => (menor === null || m.fecha < menor ? m.fecha : menor),
    null,
  );

  let mes = masVieja === null ? mesActual : mesDe(masVieja);
  if (mes > mesActual) mes = mesActual;

  const meses: Mes[] = [];
  while (mes <= mesActual) {
    meses.push(mes);
    mes = mesSiguiente(mes);
  }

  return meses.reverse();
}

// ──────────────────────────────────────────────────────────── CSV

/**
 * Punto y coma, no coma: Excel en configuración regional española espera `;`,
 * y con comas mete todas las columnas en una sola. El BOM lo agrega quien
 * descarga el archivo, en `descargar.ts`.
 */
const SEPARADOR = ';';

function campo(valor: string | number): string {
  const texto = String(valor);
  return /["\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function csvDelResumen(resumen: ResumenMensual): string {
  const lineas = [
    ['Cliente', 'Cilindros', 'Días facturables', 'Total'],
    ...resumen.filas.map((f) => [
      f.cliente.nombre,
      f.cilindros,
      f.diasFacturables,
      f.total,
    ]),
    ['TOTAL', '', '', resumen.total],
  ];

  // CRLF, que es lo que espera Excel.
  return lineas.map((fila) => fila.map(campo).join(SEPARADOR)).join('\r\n');
}

export function nombreArchivoCSV(mes: Mes): string {
  return `gongas-resumen-${mes}.csv`;
}
