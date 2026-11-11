/**
 * Qué avisos automáticos por mail tocan hoy, y con qué texto.
 *
 * Lo usa la función del servidor (supabase/functions/avisos-por-mail), que
 * corre todos los días a las 9:00. Es puro a propósito: recibe lo que le da la
 * base y devuelve los mails armados, sin mandar nada. Así se prueba entero.
 *
 * La regla: un mail por arriendo y por etapa. Uno al entrar en "por vencer"
 * (54 días) y otro al empezar a generar cargo (61), se haya avisado por
 * WhatsApp o no. Un cilindro que ya pasó los 61 cuando se ve por primera vez
 * recibe solo el de cargo: avisar "le quedan días sin cargo" sería mentira.
 */

import {
  DIAS_GRACIA,
  DIAS_POR_VENCER,
  calcularArriendo,
  diasTranscurridos,
  type FechaISO,
} from './arriendo';
import { textoDelAviso } from './mensajes';

export type EtapaAviso = 'por_vencer' | 'con_cargo';

/** Lo que devuelve `datos_para_avisos_por_mail()` (migración 0011). */
export type DatosAvisosPorMail = {
  hoy: FechaISO;
  textos: { con_cargo: string; por_vencer: string; copia_mail: string };
  arriendos: {
    arriendo_id: string;
    cliente: string;
    email: string;
    serie: string;
    fecha_entrega: FechaISO;
    /** `numeric` puede llegar como texto. `null` si el cilindro no tiene tarifa. */
    tarifa_mensual: number | string | null;
    etapas_enviadas: EtapaAviso[];
  }[];
};

export type MailDeAviso = {
  arriendoId: string;
  etapa: EtapaAviso;
  para: { email: string; nombre: string };
  /** `null` si la copia oculta está vacía. */
  copiaOculta: string | null;
  asunto: string;
  texto: string;
  html: string;
};

/** La etapa de un arriendo según sus días, o `null` si todavía no hay nada que avisar. */
export function etapaDeAviso(dias: number): EtapaAviso | null {
  if (dias > DIAS_GRACIA) return 'con_cargo';
  if (dias >= DIAS_POR_VENCER) return 'por_vencer';
  return null;
}

export function asuntoDelAviso(serie: string): string {
  return `GONGAS — aviso del cilindro ${serie}`;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** El mismo texto, en un HTML mínimo: los saltos de línea se respetan. */
export function htmlDelAviso(texto: string): string {
  const parrafos = texto
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escaparHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C1116">${parrafos}</div>`;
}

export function mailsPendientes(datos: DatosAvisosPorMail): MailDeAviso[] {
  const textos = { conCargo: datos.textos.con_cargo, porVencer: datos.textos.por_vencer };
  const copia = datos.textos.copia_mail.trim() === '' ? null : datos.textos.copia_mail.trim();

  const mails: MailDeAviso[] = [];

  for (const a of datos.arriendos) {
    if (a.email.trim() === '') continue;

    const dias = diasTranscurridos(a.fecha_entrega, null, datos.hoy);
    const etapa = etapaDeAviso(dias);
    if (etapa === null || a.etapas_enviadas.includes(etapa)) continue;

    const tarifa = a.tarifa_mensual === null ? null : Number(a.tarifa_mensual);
    const importe =
      tarifa === null
        ? null
        : calcularArriendo({ fechaEntrega: a.fecha_entrega, fechaDevolucion: null }, tarifa, datos.hoy).importe;

    const texto = textoDelAviso(textos, {
      cliente: a.cliente,
      serie: a.serie,
      fechaEntrega: a.fecha_entrega,
      dias,
      importe,
    });
    // Sin tarifa no hay importe que poner: mejor no mandar que mandar "{importe}".
    if (texto === null) continue;

    mails.push({
      arriendoId: a.arriendo_id,
      etapa,
      para: { email: a.email.trim(), nombre: a.cliente },
      copiaOculta: copia,
      asunto: asuntoDelAviso(a.serie),
      texto,
      html: htmlDelAviso(texto),
    });
  }

  return mails;
}

/**
 * Lo que dice la fila de Avisos sobre el mail automático de ese arriendo, para
 * cuando todavía no salió ninguno de la etapa actual.
 */
export function proximoMail(datos: {
  email: string;
  dias: number;
  etapasEnviadas: EtapaAviso[];
}): 'sin_mail' | 'sale_a_las_9' | 'ya_salio' | 'nada' {
  if (datos.email.trim() === '') return 'sin_mail';
  const etapa = etapaDeAviso(datos.dias);
  if (etapa === null) return 'nada';
  return datos.etapasEnviadas.includes(etapa) ? 'ya_salio' : 'sale_a_las_9';
}
