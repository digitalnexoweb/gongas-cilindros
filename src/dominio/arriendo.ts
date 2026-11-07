/**
 * Lógica de arriendo de cilindros — GONGAS.
 *
 * Implementa las reglas de la sección 5 del SPEC. Todo son funciones puras y
 * acá no se importa nada de React, por la restricción de la sección 3.
 *
 * Sobre fechas: se manejan como texto 'YYYY-MM-DD' y se parsean con `Date.UTC`.
 * Está prohibido parsear una fecha con getters locales (`new Date(texto).getDate()`
 * y parientes), porque en Montevideo (UTC−3) devuelven el día anterior.
 */

/** Fecha sin hora, como texto 'YYYY-MM-DD'. */
export type FechaISO = string;

export type EstadoArriendo = 'en_gracia' | 'por_vencer' | 'generando_cargo';

/** Los primeros 60 días de cada arriendo son gratis: el cargo arranca el día 61. */
export const DIAS_GRACIA = 60;

/** La tarifa mensual se divide por 30 para sacar la diaria, sin redondear. */
export const DIAS_POR_MES = 30;

/** Desde este día el arriendo pasa a ámbar y entra en la pantalla de avisos. */
export const DIAS_POR_VENCER = 54;

const MS_POR_DIA = 86_400_000;
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

// ───────────────────────────────────────────────────────────── Fechas

/**
 * Convierte 'YYYY-MM-DD' a milisegundos de la medianoche UTC de ese día.
 * Tira si el texto no tiene el formato esperado o si el día no existe.
 */
export function parseFechaISO(fecha: FechaISO): number {
  const partes = FORMATO_FECHA.exec(fecha);
  if (!partes) {
    throw new Error(`Fecha inválida: "${fecha}". Se espera el formato YYYY-MM-DD.`);
  }

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  const ms = Date.UTC(anio, mes - 1, dia);
  const control = new Date(ms);

  // Date.UTC desborda en silencio: el 32 de noviembre se vuelve 2 de diciembre.
  if (
    control.getUTCFullYear() !== anio ||
    control.getUTCMonth() !== mes - 1 ||
    control.getUTCDate() !== dia
  ) {
    throw new Error(`Fecha inexistente: "${fecha}".`);
  }

  return ms;
}

/** Convierte milisegundos a texto 'YYYY-MM-DD', siempre leyendo en UTC. */
export function aFechaISO(ms: number): FechaISO {
  const fecha = new Date(ms);
  const anio = String(fecha.getUTCFullYear()).padStart(4, '0');
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * El día de hoy según el reloj de pared del dispositivo.
 *
 * Es la única función del módulo que mira la hora, y por eso `ahora` se puede
 * inyectar en los tests. Acá sí se usan los getters locales a propósito: lo que
 * importa es qué día es para el operador en Montevideo, no en UTC. Un celular a
 * las 23:30 del 4 de noviembre tiene que ver el 4, aunque en UTC ya sea el 5.
 */
export function hoyISO(ahora: Date = new Date()): FechaISO {
  const anio = String(ahora.getFullYear()).padStart(4, '0');
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Días enteros entre dos fechas. Negativo si `hasta` es anterior a `desde`. */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return Math.round((parseFechaISO(hasta) - parseFechaISO(desde)) / MS_POR_DIA);
}

/**
 * Corre una fecha `dias` hacia adelante, o hacia atrás si es negativo.
 * La usan los datos de demo de la sección 7, que se calculan como `hoy − N días`
 * y nunca se escriben fijos.
 */
export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  return aFechaISO(parseFechaISO(fecha) + dias * MS_POR_DIA);
}

// ───────────────────────────────────────────────────── Reglas de negocio

/**
 * Días que el cilindro estuvo en el cliente.
 *
 * El reloj arranca el día de la entrega y se detiene el de la devolución. Si el
 * arriendo sigue abierto (`fechaDevolucion` en `null`), corre hasta hoy.
 *
 * No se recorta a cero a propósito: si el cálculo de fechas se rompiera y diera
 * −1, se tiene que ver en el test en vez de quedar tapado.
 */
export function diasTranscurridos(
  fechaEntrega: FechaISO,
  fechaDevolucion: FechaISO | null,
  hoy: FechaISO,
): number {
  return diasEntre(fechaEntrega, fechaDevolucion ?? hoy);
}

/** Días que generan cargo: los que pasan de la gracia de 60. */
export function diasFacturables(dias: number): number {
  return Math.max(0, dias - DIAS_GRACIA);
}

/** Tarifa por día, sin redondear. El redondeo es una sola vez, al final. */
export function tarifaDiaria(tarifaMensual: number): number {
  return tarifaMensual / DIAS_POR_MES;
}

/**
 * Importe acumulado, redondeado a peso entero.
 * Recibe los días **transcurridos**; la gracia se descuenta acá adentro.
 */
export function importeArriendo(dias: number, tarifaMensual: number): number {
  return Math.round(diasFacturables(dias) * tarifaDiaria(tarifaMensual));
}

/** Estado del arriendo según la tabla de la sección 5. */
export function estadoArriendo(dias: number): EstadoArriendo {
  if (dias > DIAS_GRACIA) return 'generando_cargo';
  if (dias >= DIAS_POR_VENCER) return 'por_vencer';
  return 'en_gracia';
}

export type CalculoArriendo = {
  /** Días transcurridos desde la entrega. */
  dias: number;
  /** Días que generan cargo. */
  diasFacturables: number;
  /** Tarifa por día, sin redondear. */
  tarifaDiaria: number;
  /** Importe acumulado en pesos enteros. */
  importe: number;
  estado: EstadoArriendo;
  /** `false` si el cilindro ya se devolvió. */
  abierto: boolean;
};

/**
 * Calcula todo lo de un arriendo de una sola pasada.
 * Es la función que consume la UI; `hoy` se pasa siempre desde afuera para que
 * el cálculo sea determinista.
 */
export function calcularArriendo(
  arriendo: { fechaEntrega: FechaISO; fechaDevolucion: FechaISO | null },
  tarifaMensual: number,
  hoy: FechaISO,
): CalculoArriendo {
  const dias = diasTranscurridos(arriendo.fechaEntrega, arriendo.fechaDevolucion, hoy);

  return {
    dias,
    diasFacturables: diasFacturables(dias),
    tarifaDiaria: tarifaDiaria(tarifaMensual),
    importe: importeArriendo(dias, tarifaMensual),
    estado: estadoArriendo(dias),
    abierto: arriendo.fechaDevolucion === null,
  };
}

// ───────────────────────────────────────────────────────────── Formato

/**
 * Pesos uruguayos con el formato de la sección 3: `$ 1.234`.
 * El agrupado se hace a mano para no depender del ICU del entorno.
 */
export function formatearPesos(monto: number): string {
  const entero = Math.round(monto);
  const signo = entero < 0 ? '-' : '';
  const digitos = Math.abs(entero)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$ ${digitos}`;
}

/**
 * Una fecha para mostrar en pantalla: `05/08/2026`.
 * Es el mismo formato que usa el texto de WhatsApp de la sección 6.4.
 */
export function formatearFecha(fecha: FechaISO): string {
  parseFechaISO(fecha); // valida el formato y que el día exista
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}
