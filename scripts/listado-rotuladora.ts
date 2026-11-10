/**
 * Genera las etiquetas de los cilindros, en los tres formatos que puede
 * necesitar quien las imprime:
 *
 *   entregables/etiquetas-para-imprimir.pdf   hojas A4 con el QR ya dibujado,
 *                                             para cualquier impresora
 *   entregables/etiquetas-qr/CIL-00001.png    una imagen por etiqueta, para
 *                                             importar en una rotuladora
 *   entregables/etiquetas-rotuladora.csv      el texto de cada QR, para las
 *                                             rotuladoras que los dibujan solas
 *
 *   npm run etiquetas -- 40         → 40 series, desde CIL-00001
 *   npm run etiquetas -- 20 41      → 20 series, desde CIL-00041
 *
 * Los cilindros de GONGAS no traen número propio, así que la numeración la
 * pone el sistema. El contenido de cada QR sale de `textoQR`, la misma función
 * que usa la app, y las medidas de la hoja son las de `hojas.ts`: lo que sale
 * de acá es lo mismo que imprime la pantalla de Etiquetas.
 *
 * No hace falta cargar estos cilindros en la app antes de imprimir. La primera
 * vez que se escanea una etiqueta nueva, la app ofrece darla de alta ahí mismo.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import QRCode from 'qrcode';

import { pareceSerie, serieDesdeQR, textoQR } from '../src/dominio/qr.ts';
import {
  ALTO_ETIQUETA_MM,
  ANCHO_ETIQUETA_MM,
  COLUMNAS,
  LADO_QR_MM,
  repartirEnHojas,
} from '../src/etiquetas/hojas.ts';

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

const CARPETA = 'entregables';
const CSV = join(CARPETA, 'etiquetas-rotuladora.csv');
const IMAGENES = join(CARPETA, 'etiquetas-qr');
const HTML = join(CARPETA, 'etiquetas-para-imprimir.html');
const PDF = join(CARPETA, 'etiquetas-para-imprimir.pdf');

/** El mismo nivel que usa la app: aguanta una etiqueta manchada o rayada. */
const NIVEL = 'H';

function serieNumero(n: number): string {
  return `CIL-${String(n).padStart(5, '0')}`;
}

const cantidad = Number(process.argv[2] ?? 40);
const desde = Number(process.argv[3] ?? 1);

if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isInteger(desde) || desde < 1) {
  console.error('Uso: npm run etiquetas -- <cantidad> [desde]');
  process.exit(1);
}

// ───────────────────────────────────────────────────────── Las series

const series: string[] = [];
const salteadas: string[] = [];

for (let n = desde; series.length < cantidad; n += 1) {
  if (n > 99_999) throw new Error('La numeración de 5 dígitos llega hasta CIL-99999.');

  const serie = serieNumero(n);
  if (SERIES_DE_LA_DEMO.has(serie)) {
    salteadas.push(serie);
    continue;
  }

  // Cada etiqueta tiene que poder leerla el escáner. Si no, mejor no generar nada.
  if (!pareceSerie(serie) || serieDesdeQR(textoQR(serie)) !== serie) {
    throw new Error(`La serie ${serie} no pasa la validación del escáner.`);
  }

  series.push(serie);
}

mkdirSync(CARPETA, { recursive: true });

// ───────────────────────────────────────────────────────── El listado

// Solo ASCII, sin acentos ni BOM: lo abre igual Excel que el programa de
// cualquier rotuladora, sin pelearse con la codificación.
const lineas = ['Serie;QR', ...series.map((serie) => `${serie};${textoQR(serie)}`)];
writeFileSync(CSV, lineas.join('\r\n') + '\r\n', 'ascii');

// ───────────────────────────────────────────────────────── Una imagen por etiqueta

// La carpeta es de este script: se vacía para que no queden imágenes de una
// corrida anterior con más etiquetas.
rmSync(IMAGENES, { recursive: true, force: true });
mkdirSync(IMAGENES, { recursive: true });

for (const serie of series) {
  // Con su margen blanco alrededor, que el QR necesita para leerse.
  await QRCode.toFile(join(IMAGENES, `${serie}.png`), textoQR(serie), {
    errorCorrectionLevel: NIVEL,
    margin: 4,
    width: 600,
  });
}

// ───────────────────────────────────────────────────────── Las hojas A4

const etiquetas = await Promise.all(
  series.map(async (serie) => {
    const svg = await QRCode.toString(textoQR(serie), {
      type: 'svg',
      errorCorrectionLevel: NIVEL,
      margin: 0,
    });
    return `<div class="etiqueta">${svg}<span class="serie">${serie}</span></div>`;
  }),
);

const hojas = repartirEnHojas(etiquetas)
  .map((hoja) => `<section class="hoja">${hoja.join('')}</section>`)
  .join('\n');

const pagina = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>GONGAS — etiquetas ${series[0]} a ${series.at(-1)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Consolas, 'Courier New', monospace; color: #000; }
  .hoja {
    display: grid;
    grid-template-columns: repeat(${COLUMNAS}, ${ANCHO_ETIQUETA_MM}mm);
    width: ${COLUMNAS * ANCHO_ETIQUETA_MM}mm;
    break-after: page;
  }
  .hoja:last-child { break-after: auto; }
  .etiqueta {
    width: ${ANCHO_ETIQUETA_MM}mm;
    height: ${ALTO_ETIQUETA_MM}mm;
    border: 0.2mm dashed #94a3b8;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .etiqueta svg { width: ${LADO_QR_MM}mm; height: ${LADO_QR_MM}mm; }
  .serie { margin-top: 2mm; font-size: 4.5mm; font-weight: 700; }
  @media screen {
    body { background: #f1f5f9; padding: 10mm; }
    .hoja { background: #fff; margin: 0 auto 10mm; }
  }
</style>
</head>
<body>
${hojas}
</body>
</html>
`;

writeFileSync(HTML, pagina, 'utf8');

// ───────────────────────────────────────────────────────── El PDF

// Lo imprime un navegador de la máquina, sin ventana. Así el PDF sale con las
// mismas medidas en milímetros que va a respetar la impresora.
const NAVEGADORES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const navegador = NAVEGADORES.find((ruta) => existsSync(ruta));
let hayPdf = false;

if (navegador !== undefined) {
  rmSync(PDF, { force: true });

  spawnSync(
    navegador,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${resolve(PDF)}`,
      pathToFileURL(resolve(HTML)).href,
    ],
    { stdio: 'ignore', timeout: 60_000 },
  );

  hayPdf = existsSync(PDF);
}

// ───────────────────────────────────────────────────────── Resumen

const cuantasHojas = Math.ceil(series.length / (COLUMNAS * 5));

console.log(`${series.length} etiquetas: de ${series[0]} a ${series.at(-1)}`);
if (salteadas.length > 0) {
  console.log(`Se saltearon las ${salteadas.length} series de la demo: ${salteadas.join(', ')}`);
}
console.log('');
console.log(
  hayPdf
    ? `  ${PDF}   ${cuantasHojas} hojas A4 listas para imprimir`
    : `  ${HTML}   abrilo en un navegador e imprimilo (no encontré Edge ni Chrome para armar el PDF)`,
);
console.log(`  ${IMAGENES}/   una imagen PNG por etiqueta`);
console.log(`  ${CSV}   el texto de cada QR`);
