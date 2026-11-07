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
import type { Cliente, TipoMovimiento } from './tipos';

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

/**
 * Un link de WhatsApp con el texto ya armado.
 * `wa.me` quiere el teléfono en dígitos pelados: sin `+`, sin espacios, sin guiones.
 */
export function linkWhatsApp(telefono: string, texto: string): string {
  const digitos = telefono.replace(/\D/g, '');
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}
