import QRCode from 'qrcode';

import { textoQR } from '../dominio/qr';

/**
 * El QR de una etiqueta, en SVG.
 *
 * SVG y no PNG: un PNG generado al tamaño de pantalla sale borroso impreso, y
 * el SVG es vectorial, así que sale nítido a cualquier resolución.
 *
 * Nivel de corrección `H`, el más alto, que recupera hasta un 30 % del código.
 * La sección 8 avisa de los golpes, la humedad y el aceite: una etiqueta
 * manchada en una esquina tiene que seguir leyendo.
 */
export function svgDeEtiqueta(serie: string): Promise<string> {
  return QRCode.toString(textoQR(serie), {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 0,
  });
}

/**
 * El SVG como fuente de un `<img>`.
 *
 * Va por `<img>` y no embebido en el marcado: la librería solo emite `<path>`,
 * así que no habría inyección posible, pero las series las puede tipear una
 * persona en el alta rápida y con `<img>` ni hay que pensarlo.
 */
export function comoImagen(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
