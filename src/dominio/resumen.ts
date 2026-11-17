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

export function mesAnterior(mes: Mes): Mes {
  const { anio, numero } = partirMes(mes);
  return numero === 1 ? `${anio - 1}-12` : `${anio}-${String(numero - 1).padStart(2, '0')}`;
}

/** Los `n` meses que terminan en `hasta`, del más viejo al más nuevo. */
export function ultimosMeses(hasta: Mes, n: number): Mes[] {
  const meses: Mes[] = [hasta];
  while (meses.length < n) meses.unshift(mesAnterior(meses[0] ?? hasta));
  return meses;
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

// ──────────────────────────────────────────────────────────── El panel

/**
 * Lo que va a dar el mes en curso si nadie entrega ni devuelve nada más: los
 * arriendos abiertos siguen corriendo hasta el último día, y los que pasan el
 * día 60 en lo que queda del mes entran solos. Es el mismo cálculo del resumen,
 * con el "hoy" corrido a fin de mes.
 *
 * `null` para un mes que no es el actual, o si falta alguna tarifa.
 */
export function proyeccionDelMes(estado: EstadoApp, mes: Mes, hoy: FechaISO): number | null {
  if (mes !== mesDe(hoy)) return null;
  return resumenDelMes(estado, mes, ultimoDiaDelMes(mes))?.total ?? null;
}

/** El total devengado de cada mes, en el orden dado. `null` si falta alguna tarifa. */
export function devengadoPorMes(
  estado: EstadoApp,
  meses: Mes[],
  hoy: FechaISO,
): { mes: Mes; total: number }[] | null {
  const totales: { mes: Mes; total: number }[] = [];
  for (const mes of meses) {
    // Un mes que todavía no empezó no tiene nada devengado.
    const resumen = mes > mesDe(hoy) ? { total: 0 } : resumenDelMes(estado, mes, hoy);
    if (resumen === null) return null;
    totales.push({ mes, total: resumen.total });
  }
  return totales;
}

/**
 * Cuánto cambió un importe contra otro, en por ciento entero: +12, −5.
 * `null` si el anterior fue cero, porque cualquier porcentaje sería mentira.
 */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

/** Los arriendos abiertos, con su tarifa por día y en qué fecha empiezan a cobrar. */
function abiertosConTarifa(
  estado: EstadoApp,
): { arriendo: Arriendo; porDia: number | null; inicioDelCargo: FechaISO }[] {
  return estado.arriendos
    .filter((a) => a.fechaDevolucion === null)
    .flatMap((arriendo) => {
      const cilindro = estado.cilindros.find((c) => c.id === arriendo.cilindroId);
      if (cilindro === undefined) return [];
      return [
        {
          arriendo,
          porDia: cilindro.tarifaMensual === null ? null : tarifaDiaria(cilindro.tarifaMensual),
          inicioDelCargo: sumarDias(arriendo.fechaEntrega, DIAS_GRACIA + 1),
        },
      ];
    });
}

/** Suma tarifas por día y redondea una sola vez. `null` si a alguna no se la puede ver. */
function sumarPorDia(porDia: (number | null)[]): number | null {
  if (porDia.some((p) => p === null)) return null;
  return Math.round(porDia.reduce<number>((suma, p) => suma + (p ?? 0), 0));
}

/**
 * Lo que suman por día los cilindros que hoy ya generan cargo: cuánto crece lo
 * devengado cada día que pasa sin que vuelvan.
 */
export function cargoPorDia(estado: EstadoApp, hoy: FechaISO): number | null {
  return sumarPorDia(
    abiertosConTarifa(estado)
      .filter((a) => a.inicioDelCargo <= hoy)
      .map((a) => a.porDia),
  );
}

/**
 * Los arriendos que empiezan a generar cargo en los próximos `dias` días,
 * sin contar hoy: cuántos son y cuánto van a sumar por día.
 */
export function empiezanACobrar(
  estado: EstadoApp,
  hoy: FechaISO,
  dias = 7,
): { cantidad: number; porDia: number | null } {
  const limite = sumarDias(hoy, dias);
  const proximos = abiertosConTarifa(estado).filter(
    (a) => a.inicioDelCargo > hoy && a.inicioDelCargo <= limite,
  );
  return { cantidad: proximos.length, porDia: sumarPorDia(proximos.map((a) => a.porDia)) };
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
