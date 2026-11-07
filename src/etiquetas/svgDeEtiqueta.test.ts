import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { textoQR } from '../dominio/qr';
import { comoImagen, svgDeEtiqueta } from './svgDeEtiqueta';

/** Los módulos de lado que declara el SVG, que es el tamaño de la matriz del QR. */
function ladoDeLaMatriz(svg: string): number {
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (viewBox === null) throw new Error('el SVG no trae viewBox');
  return Number(viewBox[1]);
}

describe('svgDeEtiqueta', () => {
  it('devuelve un SVG, no un PNG: impreso tiene que salir nitido', async () => {
    const svg = await svgDeEtiqueta('CIL-00101');

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<path');
    expect(svg).not.toContain('data:image/png');
  });

  it('codifica el contenido que espera el escaner del punto 4', async () => {
    // El SVG no trae el texto escrito, pero sí se puede comparar contra el que
    // genera la librería para `GONGAS:CIL-00101`, que es lo que lee el escáner.
    const deLaEtiqueta = await svgDeEtiqueta('CIL-00101');
    const delTextoEsperado = await QRCode.toString('GONGAS:CIL-00101', {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 0,
    });

    expect(deLaEtiqueta).toBe(delTextoEsperado);
    expect(textoQR('CIL-00101')).toBe('GONGAS:CIL-00101');
  });

  it('usa de verdad el nivel H, no el nivel por defecto', async () => {
    // Más corrección de errores es más módulos: si la matriz de H no fuera más
    // grande que la de L, la opción se estaría ignorando en silencio.
    const conH = await svgDeEtiqueta('CIL-00101');
    const conL = await QRCode.toString(textoQR('CIL-00101'), {
      type: 'svg',
      errorCorrectionLevel: 'L',
      margin: 0,
    });

    expect(ladoDeLaMatriz(conH)).toBeGreaterThan(ladoDeLaMatriz(conL));
  });

  it('series distintas dan QR distintos', async () => {
    const uno = await svgDeEtiqueta('CIL-00101');
    const otro = await svgDeEtiqueta('CIL-00102');

    expect(uno).not.toBe(otro);
  });
});

describe('comoImagen', () => {
  it('arma un data URL que se puede poner en un img', () => {
    const url = comoImagen('<svg><path d="M0 0"/></svg>');

    expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(url.replace('data:image/svg+xml;utf8,', ''))).toBe(
      '<svg><path d="M0 0"/></svg>',
    );
  });

  it('escapa lo que romperia el atributo src', () => {
    const url = comoImagen('<svg viewBox="0 0 1 1"></svg>');

    expect(url).not.toContain('"');
    expect(url).not.toContain('<');
    expect(url).not.toContain('>');
  });
});
