/**
 * Lee de vuelta cada QR de entregables/etiquetas-qr/ con zxing, el mismo lector
 * que usa la app como respaldo, y comprueba que diga GONGAS:<código>.
 *
 * Sirve para no mandar etiquetas que el escáner no pueda leer: verifica las
 * imágenes que se generaron, no las vuelve a generar.
 *
 *   node scripts/verificar-etiquetas.ts
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import zxing from '@zxing/library';
import pngjs from 'pngjs';

import { serieDesdeQR } from '../src/dominio/qr.ts';

// Los dos son CommonJS: se importan enteros y se desarman acá.
const { BinaryBitmap, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } = zxing;
const { PNG } = pngjs;

const CARPETA = 'entregables/etiquetas-qr';
const lector = new QRCodeReader();
const pistas = new Map([[DecodeHintType.TRY_HARDER, true]]);

let fallas = 0;

for (const archivo of readdirSync(CARPETA).filter((a) => a.endsWith('.png')).sort()) {
  const esperada = archivo.replace(/\.png$/, '');
  const png = PNG.sync.read(readFileSync(join(CARPETA, archivo)));

  // zxing quiere un píxel por entero: 0xRRGGBB.
  const pixeles = new Int32Array(png.width * png.height);
  for (let i = 0; i < pixeles.length; i += 1) {
    const r = png.data[i * 4] ?? 0;
    const g = png.data[i * 4 + 1] ?? 0;
    const b = png.data[i * 4 + 2] ?? 0;
    pixeles[i] = (r << 16) | (g << 8) | b;
  }

  try {
    const fuente = new RGBLuminanceSource(pixeles, png.width, png.height);
    const texto = lector.decode(new BinaryBitmap(new HybridBinarizer(fuente)), pistas).getText();
    const serie = serieDesdeQR(texto);
    const bien = serie === esperada;
    if (!bien) fallas += 1;
    console.log(`${bien ? 'OK   ' : 'MAL  '} ${archivo.padEnd(12)} → ${texto}`);
  } catch (error) {
    fallas += 1;
    console.log(`MAL   ${archivo.padEnd(12)} → no se pudo leer (${error instanceof Error ? error.name : String(error)})`);
  }
}

console.log(fallas === 0 ? '\nTodas se leen bien.' : `\n${fallas} etiqueta(s) con problemas.`);
process.exit(fallas === 0 ? 0 : 1);
