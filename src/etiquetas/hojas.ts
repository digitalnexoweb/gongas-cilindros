/**
 * La grilla imprimible de la sección 6.6.
 *
 * Las medidas van en milímetros porque es lo único que la impresora respeta:
 * una hoja A4 con 10 mm de margen deja 190 mm útiles, y tres columnas de 63 mm
 * son 189. En pantalla la hoja se escala para entrar en el celular.
 */

export const COLUMNAS = 3;
export const FILAS = 5;
export const ETIQUETAS_POR_HOJA = COLUMNAS * FILAS;

export const ANCHO_ETIQUETA_MM = 63;
export const ALTO_ETIQUETA_MM = 55;
export const LADO_QR_MM = 38;

/** Un milímetro en píxeles CSS, para calcular la escala de la vista previa. */
export const PX_POR_MM = 96 / 25.4;

/** Reparte las series en hojas, respetando el orden. */
export function repartirEnHojas<T>(items: T[], porHoja: number = ETIQUETAS_POR_HOJA): T[][] {
  if (porHoja < 1) throw new Error('En una hoja tiene que entrar al menos una etiqueta.');

  const hojas: T[][] = [];
  for (let i = 0; i < items.length; i += porHoja) {
    hojas.push(items.slice(i, i + porHoja));
  }

  return hojas;
}

/** Alto de una hoja a medias, para reservarle el lugar en pantalla. */
export function altoDeHojaMm(cuantasEtiquetas: number): number {
  return Math.ceil(cuantasEtiquetas / COLUMNAS) * ALTO_ETIQUETA_MM;
}
