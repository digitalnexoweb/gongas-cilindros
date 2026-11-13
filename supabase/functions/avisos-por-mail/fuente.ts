/**
 * Los avisos automáticos por mail. Corre todos los días a las 9:00 de
 * Montevideo: lo llama la base con pg_cron (supabase/una-vez/0012).
 *
 * 1. Pide a la base los arriendos que podrían necesitar mail.
 * 2. Decide cuáles tocan y arma cada texto con src/dominio/avisosPorMail.ts,
 *    el mismo código de la app: la plata se calcula en un solo lugar.
 * 3. Manda cada mail por Brevo y, solo si Brevo lo acepta, lo registra.
 *
 * Esto es la fuente. Lo que se despliega es index.js, que arma
 * `npm run funcion:armar` juntando este archivo con lo que importa.
 *
 * Variables del servidor:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   las pone Supabase solo
 *   BREVO_API_KEY                             la carga el usuario en Secrets
 *   MAIL_REMITENTE                            opcional; por defecto vanesa@gongasuruguay.com
 *
 * Con el cuerpo `{"simular": true}` no manda nada: devuelve lo que mandaría.
 */

import { mailsPendientes, type DatosAvisosPorMail, type MailDeAviso } from '../../../src/dominio/avisosPorMail';

declare const Deno: {
  env: { get(nombre: string): string | undefined };
  serve(manejador: (pedido: Request) => Response | Promise<Response>): void;
};

const REMITENTE_POR_DEFECTO = 'vanesa@gongasuruguay.com';

function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo, null, 2), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function llamarALaBase<T>(funcion: string, argumentos: Record<string, unknown> = {}): Promise<T> {
  const url = Deno.env.get('SUPABASE_URL');
  const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url === undefined || clave === undefined) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');

  const respuesta = await fetch(`${url}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: { apikey: clave, authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
    body: JSON.stringify(argumentos),
  });
  if (!respuesta.ok) throw new Error(`${funcion}: ${respuesta.status} ${await respuesta.text()}`);
  return (await respuesta.json()) as T;
}

async function mandarPorBrevo(mail: MailDeAviso, clave: string, remitente: string): Promise<void> {
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': clave, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'GONGAS', email: remitente },
      replyTo: { name: 'GONGAS', email: remitente },
      to: [{ email: mail.para.email, name: mail.para.nombre }],
      ...(mail.copiaOculta === null ? {} : { bcc: [{ email: mail.copiaOculta }] }),
      subject: mail.asunto,
      textContent: mail.texto,
      htmlContent: mail.html,
    }),
  });
  if (!respuesta.ok) throw new Error(`Brevo ${respuesta.status}: ${await respuesta.text()}`);
}

Deno.serve(async (pedido) => {
  if (pedido.method !== 'POST') return json({ error: 'Solo POST.' }, 405);

  // Solo la llamada programada trae la clave de la base. Igual, aunque alguien
  // la llamara de afuera, no podría mandar un mail que no toque: cada etapa
  // sale una sola vez, lo garantiza la base.
  const token = pedido.headers.get('x-token') ?? '';
  const valido = await llamarALaBase<boolean>('token_avisos_mail_valido', { p_token: token }).catch(() => false);
  if (!valido) return json({ error: 'No autorizado.' }, 401);

  const cuerpo = (await pedido.json().catch(() => ({}))) as { simular?: boolean };
  const datos = await llamarALaBase<DatosAvisosPorMail>('datos_para_avisos_por_mail');
  const mails = mailsPendientes(datos);

  if (cuerpo.simular === true) {
    return json({ simulado: true, hoy: datos.hoy, cantidad: mails.length, mails });
  }

  const clave = Deno.env.get('BREVO_API_KEY');
  if (clave === undefined || clave.trim() === '') {
    return json({ error: 'Falta BREVO_API_KEY en Edge Functions → Secrets. No se mandó nada.', pendientes: mails.length }, 503);
  }
  const remitente = Deno.env.get('MAIL_REMITENTE') ?? REMITENTE_POR_DEFECTO;

  const resultado: { arriendoId: string; etapa: string; para: string; estado: string }[] = [];

  for (const mail of mails) {
    try {
      await mandarPorBrevo(mail, clave, remitente);
      const registrado = await llamarALaBase<boolean>('registrar_aviso_por_mail', {
        p_arriendo_id: mail.arriendoId,
        p_etapa: mail.etapa,
        p_destino: mail.para.email,
      });
      resultado.push({ arriendoId: mail.arriendoId, etapa: mail.etapa, para: mail.para.email, estado: registrado ? 'enviado' : 'enviado, ya estaba registrado' });
    } catch (error) {
      // No se registra: mañana se vuelve a intentar.
      resultado.push({
        arriendoId: mail.arriendoId,
        etapa: mail.etapa,
        para: mail.para.email,
        estado: `falló: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return json({ hoy: datos.hoy, cantidad: mails.length, resultado });
});
