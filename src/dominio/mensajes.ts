/**
 * Los textos que salen de la app hacia afuera: el comprobante del lote y los
 * links de WhatsApp. Funciones puras, así se pueden testear sin abrir nada.
 */

import {
  DIAS_GRACIA,
  formatearFecha,
  formatearPesos,
  type FechaISO,
} from './arriendo';
import type { Cliente, TextosAviso, TipoMovimiento } from './tipos';

/** El comprobante de la sección 6.1: las series, el cliente y la fecha. */
export function textoComprobante(datos: {
  tipo: TipoMovimiento;
  series: string[];
  cliente: Cliente | null;
  fecha: FechaISO;
}): string {
  const { tipo, series, cliente, fecha } = datos;

  const titulo = tipo === 'entrega' ? 'Entrega' : 'Devolución';
  const cuantos = series.length === 1 ? '1 cilindro' : `${series.length} cilindros`;

  const lineas = [`GONGAS — ${titulo} del ${formatearFecha(fecha)}`];
  if (cliente !== null) lineas.push(`Cliente: ${cliente.nombre}`);
  lineas.push(`${cuantos}:`);
  for (const serie of series) lineas.push(`- ${serie}`);

  return lineas.join('\n');
}

/**
 * El aviso de mora de la sección 6.4.
 *
 * De 61 días en adelante es el texto del SPEC palabra por palabra. De 54 a 60
 * el cilindro todavía no genera cargo, así que decir "de $ 0 a la fecha" sería
 * cierto pero sonaría raro: esos llevan una variante que avisa cuánto le queda.
 */
export function textoAviso(datos: {
  serie: string;
  fechaEntrega: FechaISO;
  dias: number;
  importe: number;
}): string {
  const { serie, fechaEntrega, dias, importe } = datos;

  const cabeza = `Hola, les recordamos que el cilindro ${serie} está en su poder desde el ${formatearFecha(fechaEntrega)} (${dias} días).`;
  const cola = 'Cualquier duda quedamos a las órdenes. GONGAS';

  if (dias > DIAS_GRACIA) {
    return `${cabeza} A partir del día 61 genera un arrendamiento de ${formatearPesos(importe)} a la fecha. ${cola}`;
  }

  const sinCargo = DIAS_GRACIA - dias;
  if (sinCargo === 0) {
    return `${cabeza} Mañana cumple 61 días y empieza a generar arrendamiento. ${cola}`;
  }

  const queda = sinCargo === 1 ? 'le queda 1 día sin cargo' : `le quedan ${sinCargo} días sin cargo`;
  return `${cabeza} A partir del día 61 empieza a generar arrendamiento: ${queda}. ${cola}`;
}

// ───────────────────────────────────────────────────── El texto editable

/**
 * Los textos con los que arranca la app, los mismos de la migración 0010. Son
 * los de 6.4 con un saludo al cliente por su nombre. "Volver al texto original"
 * vuelve a estos.
 */
export const TEXTOS_AVISO_ORIGINALES: TextosAviso = {
  conCargo:
    'Hola {cliente}, les recordamos que el cilindro {serie} está en su poder desde el {desde} ({dias} días). A partir del día 61 genera un arrendamiento de {importe} a la fecha. Cualquier duda quedamos a las órdenes. GONGAS',
  porVencer:
    'Hola {cliente}, les recordamos que el cilindro {serie} está en su poder desde el {desde} ({dias} días). A partir del día 61 empieza a generar arrendamiento: {sin_cargo}. Cualquier duda quedamos a las órdenes. GONGAS',
};

/** Los huecos que se pueden usar en el texto, con lo que dicen. */
export const HUECOS_AVISO = [
  { hueco: '{cliente}', explicacion: 'El nombre del cliente' },
  { hueco: '{serie}', explicacion: 'La serie del cilindro' },
  { hueco: '{desde}', explicacion: 'La fecha de entrega' },
  { hueco: '{dias}', explicacion: 'Los días que lleva' },
  { hueco: '{importe}', explicacion: 'Lo acumulado a hoy' },
  { hueco: '{sin_cargo}', explicacion: 'Cuántos días le quedan sin cargo' },
] as const;

/** "le quedan 3 días sin cargo", "le queda 1 día sin cargo" o "hoy es su último día sin cargo". */
export function textoSinCargo(dias: number): string {
  const quedan = DIAS_GRACIA - dias;
  if (quedan <= 0) return 'hoy es su último día sin cargo';
  if (quedan === 1) return 'le queda 1 día sin cargo';
  return `le quedan ${quedan} días sin cargo`;
}

/**
 * El aviso de un cilindro, armado con el texto que eligió el administrador.
 *
 * Usa el de con cargo de 61 días en adelante y el de por vencer de 54 a 60.
 * Devuelve `null` si el texto lleva el importe y quien mira no lo puede ver: un
 * aviso con "{importe}" sin completar no se puede mandar.
 *
 * Un hueco que no existe —uno mal escrito, como {dia}— queda tal cual, para que
 * se note en la vista previa.
 */
export function textoDelAviso(
  textos: TextosAviso,
  datos: {
    cliente: string;
    serie: string;
    fechaEntrega: FechaISO;
    dias: number;
    /** `null` si quien mira no puede ver la plata. */
    importe: number | null;
  },
): string | null {
  const plantilla = datos.dias > DIAS_GRACIA ? textos.conCargo : textos.porVencer;
  if (datos.importe === null && plantilla.includes('{importe}')) return null;

  const valores: Record<string, string> = {
    cliente: datos.cliente,
    serie: datos.serie,
    desde: formatearFecha(datos.fechaEntrega),
    dias: String(datos.dias),
    importe: formatearPesos(datos.importe ?? 0),
    sin_cargo: textoSinCargo(datos.dias),
  };

  return plantilla.replace(/\{(\w+)\}/g, (hueco, nombre: string) => valores[nombre] ?? hueco);
}

/**
 * Un link de WhatsApp con el texto ya armado.
 * `wa.me` quiere el teléfono en dígitos pelados: sin `+`, sin espacios, sin guiones.
 */
export function linkWhatsApp(telefono: string, texto: string): string {
  const digitos = telefono.replace(/\D/g, '');
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}
