const MS_POR_DIA = 864e5;
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
* Convierte 'YYYY-MM-DD' a milisegundos de la medianoche UTC de ese día.
* Tira si el texto no tiene el formato esperado o si el día no existe.
*/
function parseFechaISO(fecha) {
	const partes = FORMATO_FECHA.exec(fecha);
	if (!partes) throw new Error(`Fecha inválida: "${fecha}". Se espera el formato YYYY-MM-DD.`);
	const anio = Number(partes[1]);
	const mes = Number(partes[2]);
	const dia = Number(partes[3]);
	const ms = Date.UTC(anio, mes - 1, dia);
	const control = new Date(ms);
	if (control.getUTCFullYear() !== anio || control.getUTCMonth() !== mes - 1 || control.getUTCDate() !== dia) throw new Error(`Fecha inexistente: "${fecha}".`);
	return ms;
}
/** Días enteros entre dos fechas. Negativo si `hasta` es anterior a `desde`. */
function diasEntre(desde, hasta) {
	return Math.round((parseFechaISO(hasta) - parseFechaISO(desde)) / MS_POR_DIA);
}
/**
* Días que el cilindro estuvo en el cliente.
*
* El reloj arranca el día de la entrega y se detiene el de la devolución. Si el
* arriendo sigue abierto (`fechaDevolucion` en `null`), corre hasta hoy.
*
* No se recorta a cero a propósito: si el cálculo de fechas se rompiera y diera
* −1, se tiene que ver en el test en vez de quedar tapado.
*/
function diasTranscurridos(fechaEntrega, fechaDevolucion, hoy) {
	return diasEntre(fechaEntrega, fechaDevolucion ?? hoy);
}
/** Días que generan cargo: los que pasan de la gracia de 60. */
function diasFacturables(dias) {
	return Math.max(0, dias - 60);
}
/** Tarifa por día, sin redondear. El redondeo es una sola vez, al final. */
function tarifaDiaria(tarifaMensual) {
	return tarifaMensual / 30;
}
/**
* Importe acumulado, redondeado a peso entero.
* Recibe los días **transcurridos**; la gracia se descuenta acá adentro.
*/
function importeArriendo(dias, tarifaMensual) {
	return Math.round(diasFacturables(dias) * tarifaDiaria(tarifaMensual));
}
/** Estado del arriendo según la tabla de la sección 5. */
function estadoArriendo(dias) {
	if (dias > 60) return "generando_cargo";
	if (dias >= 54) return "por_vencer";
	return "en_gracia";
}
/**
* Calcula todo lo de un arriendo de una sola pasada.
* Es la función que consume la UI; `hoy` se pasa siempre desde afuera para que
* el cálculo sea determinista.
*/
function calcularArriendo(arriendo, tarifaMensual, hoy) {
	const dias = diasTranscurridos(arriendo.fechaEntrega, arriendo.fechaDevolucion, hoy);
	return {
		dias,
		diasFacturables: diasFacturables(dias),
		tarifaDiaria: tarifaDiaria(tarifaMensual),
		importe: importeArriendo(dias, tarifaMensual),
		estado: estadoArriendo(dias),
		abierto: arriendo.fechaDevolucion === null
	};
}
/**
* Pesos uruguayos con el formato de la sección 3: `$ 1.234`.
* El agrupado se hace a mano para no depender del ICU del entorno.
*/
function formatearPesos(monto) {
	const entero = Math.round(monto);
	return `${entero < 0 ? "-" : ""}$ ${Math.abs(entero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
/**
* Una fecha para mostrar en pantalla: `05/08/2026`.
* Es el mismo formato que usa el texto de WhatsApp de la sección 6.4.
*/
function formatearFecha(fecha) {
	parseFechaISO(fecha);
	return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}
// src/dominio/mensajes.ts
/**
* Los textos que salen de la app hacia afuera: el comprobante del lote y los
* links de WhatsApp. Funciones puras, así se pueden testear sin abrir nada.
*/
/** "le quedan 3 días sin cargo", "le queda 1 día sin cargo" o "hoy es su último día sin cargo". */
function textoSinCargo(dias) {
	const quedan = 60 - dias;
	if (quedan <= 0) return "hoy es su último día sin cargo";
	if (quedan === 1) return "le queda 1 día sin cargo";
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
function textoDelAviso(textos, datos) {
	const plantilla = datos.dias > 60 ? textos.conCargo : textos.porVencer;
	if (datos.importe === null && plantilla.includes("{importe}")) return null;
	const valores = {
		cliente: datos.cliente,
		serie: datos.serie,
		desde: formatearFecha(datos.fechaEntrega),
		dias: String(datos.dias),
		importe: formatearPesos(datos.importe ?? 0),
		sin_cargo: textoSinCargo(datos.dias)
	};
	return plantilla.replace(/\{(\w+)\}/g, (hueco, nombre) => valores[nombre] ?? hueco);
}
// src/dominio/avisosPorMail.ts
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
/** La etapa de un arriendo según sus días, o `null` si todavía no hay nada que avisar. */
function etapaDeAviso(dias) {
	if (dias > 60) return "con_cargo";
	if (dias >= 54) return "por_vencer";
	return null;
}
function asuntoDelAviso(serie) {
	return `GONGAS — aviso del cilindro ${serie}`;
}
function escaparHtml(texto) {
	return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** El mismo texto, en un HTML mínimo: los saltos de línea se respetan. */
function htmlDelAviso(texto) {
	return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C1116">${texto.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${escaparHtml(p).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
}
function mailsPendientes(datos) {
	const textos = {
		conCargo: datos.textos.con_cargo,
		porVencer: datos.textos.por_vencer
	};
	const copia = datos.textos.copia_mail.trim() === "" ? null : datos.textos.copia_mail.trim();
	const mails = [];
	for (const a of datos.arriendos) {
		if (a.email.trim() === "") continue;
		const dias = diasTranscurridos(a.fecha_entrega, null, datos.hoy);
		const etapa = etapaDeAviso(dias);
		if (etapa === null || a.etapas_enviadas.includes(etapa)) continue;
		const tarifa = a.tarifa_mensual === null ? null : Number(a.tarifa_mensual);
		const importe = tarifa === null ? null : calcularArriendo({
			fechaEntrega: a.fecha_entrega,
			fechaDevolucion: null
		}, tarifa, datos.hoy).importe;
		const texto = textoDelAviso(textos, {
			cliente: a.cliente,
			serie: a.serie,
			fechaEntrega: a.fecha_entrega,
			dias,
			importe
		});
		if (texto === null) continue;
		mails.push({
			arriendoId: a.arriendo_id,
			etapa,
			para: {
				email: a.email.trim(),
				nombre: a.cliente
			},
			copiaOculta: copia,
			asunto: asuntoDelAviso(a.serie),
			texto,
			html: htmlDelAviso(texto)
		});
	}
	return mails;
}
// supabase/functions/avisos-por-mail/fuente.ts
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
*   MAIL_REMITENTE                            opcional; por defecto info@gongasuruguay.com
*
* Con el cuerpo `{"simular": true}` no manda nada: devuelve lo que mandaría.
*/
const REMITENTE_POR_DEFECTO = "info@gongasuruguay.com";
function json(cuerpo, estado = 200) {
	return new Response(JSON.stringify(cuerpo, null, 2), {
		status: estado,
		headers: { "content-type": "application/json; charset=utf-8" }
	});
}
async function llamarALaBase(funcion, argumentos = {}) {
	const url = Deno.env.get("SUPABASE_URL");
	const clave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (url === void 0 || clave === void 0) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
	const respuesta = await fetch(`${url}/rest/v1/rpc/${funcion}`, {
		method: "POST",
		headers: {
			apikey: clave,
			authorization: `Bearer ${clave}`,
			"content-type": "application/json"
		},
		body: JSON.stringify(argumentos)
	});
	if (!respuesta.ok) throw new Error(`${funcion}: ${respuesta.status} ${await respuesta.text()}`);
	return await respuesta.json();
}
async function mandarPorBrevo(mail, clave, remitente) {
	const respuesta = await fetch("https://api.brevo.com/v3/smtp/email", {
		method: "POST",
		headers: {
			"api-key": clave,
			"content-type": "application/json",
			accept: "application/json"
		},
		body: JSON.stringify({
			sender: {
				name: "GONGAS",
				email: remitente
			},
			replyTo: {
				name: "GONGAS",
				email: remitente
			},
			to: [{
				email: mail.para.email,
				name: mail.para.nombre
			}],
			...mail.copiaOculta === null ? {} : { bcc: [{ email: mail.copiaOculta }] },
			subject: mail.asunto,
			textContent: mail.texto,
			htmlContent: mail.html
		})
	});
	if (!respuesta.ok) throw new Error(`Brevo ${respuesta.status}: ${await respuesta.text()}`);
}
Deno.serve(async (pedido) => {
	if (pedido.method !== "POST") return json({ error: "Solo POST." }, 405);
	if (!await llamarALaBase("token_avisos_mail_valido", { p_token: pedido.headers.get("x-token") ?? "" }).catch(() => false)) return json({ error: "No autorizado." }, 401);
	const cuerpo = await pedido.json().catch(() => ({}));
	const datos = await llamarALaBase("datos_para_avisos_por_mail");
	const mails = mailsPendientes(datos);
	if (cuerpo.simular === true) return json({
		simulado: true,
		hoy: datos.hoy,
		cantidad: mails.length,
		mails
	});
	const clave = Deno.env.get("BREVO_API_KEY");
	if (clave === void 0 || clave.trim() === "") return json({
		error: "Falta BREVO_API_KEY en Edge Functions → Secrets. No se mandó nada.",
		pendientes: mails.length
	}, 503);
	const remitente = Deno.env.get("MAIL_REMITENTE") ?? REMITENTE_POR_DEFECTO;
	const resultado = [];
	for (const mail of mails) try {
		await mandarPorBrevo(mail, clave, remitente);
		const registrado = await llamarALaBase("registrar_aviso_por_mail", {
			p_arriendo_id: mail.arriendoId,
			p_etapa: mail.etapa,
			p_destino: mail.para.email
		});
		resultado.push({
			arriendoId: mail.arriendoId,
			etapa: mail.etapa,
			para: mail.para.email,
			estado: registrado ? "enviado" : "enviado, ya estaba registrado"
		});
	} catch (error) {
		resultado.push({
			arriendoId: mail.arriendoId,
			etapa: mail.etapa,
			para: mail.para.email,
			estado: `falló: ${error instanceof Error ? error.message : String(error)}`
		});
	}
	return json({
		hoy: datos.hoy,
		cantidad: mails.length,
		resultado
	});
});
