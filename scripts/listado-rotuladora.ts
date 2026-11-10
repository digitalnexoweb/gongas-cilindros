/**
 * Genera el listado de etiquetas para imprimir en una rotuladora.
 *
 *   npm run etiquetas -- 100        → 100 series, desde CIL-00001
 *   npm run etiquetas -- 50 201     → 50 series, desde CIL-00201
 *
 * Los cilindros de GONGAS no traen número propio, así que la numeración la
 * pone el sistema. El contenido de cada QR sale de `textoQR`, la misma función
 * que usa el generador de etiquetas de la app y que el escáner sabe leer: así
 * el listado nunca puede quedar desalineado con lo que la app espera.
 *
 * No hace falta cargar estos cilindros en la app antes de imprimir. La primera
 * vez que se escanea una etiqueta nueva, la app ofrece darla de alta ahí mismo.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { pareceSerie, serieDesdeQR, textoQR } from '../src/dominio/qr.ts';

/**
 * Las series de los datos de demo de la sección 7 del SPEC. Se saltean: si un
 * cilindro real llevara una de estas, al escanearlo en la demo aparecería como
 * "en ANCAP hace 92 días", que es justo la clase de susto que no queremos.
 */
const SERIES_DE_LA_DEMO = new Set([
  'CIL-00101',
  'CIL-00102',
  'CIL-00103',
  'CIL-00104',
  'CIL-00105',
  'CIL-00106',
  'CIL-00107',
]);

const SALIDA = 'entregables/etiquetas-rotuladora.csv';

function serieNumero(n: number): string {
  return `CIL-${String(n).padStart(5, '0')}`;
}

const cantidad = Number(process.argv[2] ?? 100);
const desde = Number(process.argv[3] ?? 1);

if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isInteger(desde) || desde < 1) {
  console.error('Uso: npm run etiquetas -- <cantidad> [desde]');
  process.exit(1);
}

const series: string[] = [];
const salteadas: string[] = [];

for (let n = desde; series.length < cantidad; n += 1) {
  if (n > 99_999) throw new Error('La numeración de 5 dígitos llega hasta CIL-99999.');

  const serie = serieNumero(n);
  if (SERIES_DE_LA_DEMO.has(serie)) {
    salteadas.push(serie);
    continue;
  }

  // Cada fila tiene que poder leerla el escáner. Si no, mejor no generar nada.
  if (!pareceSerie(serie) || serieDesdeQR(textoQR(serie)) !== serie) {
    throw new Error(`La serie ${serie} no pasa la validación del escáner.`);
  }

  series.push(serie);
}

// Solo ASCII, sin acentos ni BOM: lo abre igual Excel que el programa de
// cualquier rotuladora, sin pelearse con la codificación.
const lineas = ['Serie;QR', ...series.map((serie) => `${serie};${textoQR(serie)}`)];

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, lineas.join('\r\n') + '\r\n', 'ascii');

console.log(`${series.length} etiquetas: de ${series[0]} a ${series.at(-1)}`);
if (salteadas.length > 0) {
  console.log(`Se saltearon las ${salteadas.length} series de la demo: ${salteadas.join(', ')}`);
}
console.log(`Listado en ${SALIDA}`);
