/**
 * El contenido de las etiquetas QR, de la sección 8 del SPEC: `GONGAS:CIL-00123`.
 *
 * El prefijo es lo que evita leer por accidente códigos ajenos pegados en el
 * depósito, que en escaneo continuo entrarían solos al lote.
 */

export const PREFIJO_QR = 'GONGAS:';

/**
 * Saca la serie de un QR leído, o `null` si el código no es nuestro.
 *
 * Es tolerante a propósito con los espacios y con las mayúsculas del prefijo:
 * su trabajo es rechazar códigos ajenos, no ser estricto con el formato.
 */
export function serieDesdeQR(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio.toUpperCase().startsWith(PREFIJO_QR)) return null;

  const serie = limpio.slice(PREFIJO_QR.length).trim().toUpperCase();
  return serie === '' ? null : serie;
}

/** Lo que se imprime en la etiqueta. Lo usa el generador del punto 6. */
export function textoQR(serie: string): string {
  return `${PREFIJO_QR}${serie}`;
}

/** Letras, números y guiones. Alcanza para descartar un pegado accidental. */
const FORMA_DE_SERIE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

export function pareceSerie(texto: string): boolean {
  return FORMA_DE_SERIE.test(texto.trim().toUpperCase());
}

/**
 * Lo que se carga a mano, que puede venir de dos formas: el contenido crudo del
 * QR, si lo pegaron, o la serie pelada, si la tipearon.
 *
 * Devuelve `null` si no parece una serie. Sin este filtro, pegar una URL en el
 * campo la mete al lote como si fuera un cilindro.
 */
export function serieTipeada(texto: string): string | null {
  const delQR = serieDesdeQR(texto);
  if (delQR !== null) return delQR;

  const serie = texto.trim().toUpperCase();
  return pareceSerie(serie) ? serie : null;
}
