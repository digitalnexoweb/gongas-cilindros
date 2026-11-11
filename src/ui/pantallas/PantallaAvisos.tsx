import { useMemo, useState } from 'react';

import { diasEntre, formatearFecha, formatearPesos, type FechaISO } from '../../dominio/arriendo';
import { vistaAvisos, type CalculoVisible } from '../../dominio/consultas';
import { etapaDeAviso, proximoMail } from '../../dominio/avisosPorMail';
import { TEXTOS_AVISO_ORIGINALES, linkWhatsApp, textoDelAviso } from '../../dominio/mensajes';
import type { AvisoRegistrado, Cliente, TextosAviso } from '../../dominio/tipos';
import { useEstado } from '../../estado/ProveedorEstado';
import { ChipEstado, estadoVisible } from '../ChipEstado';
import { cuandoEnFrase, enMontevideo } from '../hora';
import { WhatsApp } from '../iconos';
import { Importe } from '../Importe';

/** La sección 6.4, que el SPEC llama el corazón del sistema. */
export function PantallaAvisos() {
  const { estado, hoy } = useEstado();
  const avisos = useMemo(() => vistaAvisos(estado, hoy), [estado, hoy]);

  // La suma de lo que acumula la lista. Si de alguno no se puede ver el importe
  // (un empleado), no hay total: un total a medias sería un número falso.
  const importes = avisos.map((v) => v.calculo?.importe ?? null);
  const total = importes.some((i) => i === null)
    ? null
    : importes.reduce<number>((suma, i) => suma + (i ?? 0), 0);

  const cuantos =
    avisos.length === 0
      ? 'Ningún cilindro con 54 días o más'
      : avisos.length === 1
        ? '1 cilindro con 54 días o más'
        : `${avisos.length} cilindros con 54 días o más`;

  return (
    <>
      {/*
        DISENO.md: "la plata va arriba". Joaquín no entra a esta pantalla a
        leer una lista, entra a ver cuánto hay para cobrar. No queda fijo al
        hacer scroll: con un número de 46 px se comería media pantalla.
      */}
      <header className="no-imprimir bg-tinta px-4 pt-5 pb-6 text-white">
        <h1 className="font-titulo text-[29px] leading-tight font-bold tracking-tight">Avisos</h1>

        {total !== null && avisos.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold tracking-wider text-marca-clara uppercase">
              Para cobrar
            </p>
            <p className="font-titulo text-[46px] leading-none font-bold tabular-nums">
              {formatearPesos(total)}
            </p>
          </>
        )}

        <p className="mt-3 text-sm text-marca-clara">
          {avisos.length === 0 ? 'Nada para cobrar' : cuantos}
        </p>
      </header>


      {avisos.length === 0 ? (
        <p className="px-8 pt-16 text-center text-sm text-tinta-2">
          Ningún cilindro llegó a los 54 días. No hay nada que avisar.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-linea border-b border-linea bg-white">
            {avisos.map((vista) => {
              const cliente = vista.ubicacion.lugar === 'cliente' ? vista.ubicacion.cliente : null;
              if (cliente === null || vista.arriendo === null || vista.calculo === null) return null;

              return (
                <FilaAviso
                  key={vista.cilindro.id}
                  cliente={cliente}
                  serie={vista.cilindro.serie}
                  arriendoId={vista.arriendo.id}
                  fechaEntrega={vista.arriendo.fechaEntrega}
                  calculo={vista.calculo}
                  ultimo={ultimoAvisoDe(estado.avisos, vista.arriendo.id, 'whatsapp')}
                  mails={(estado.avisos ?? []).filter(
                    (a) => a.arriendoId === vista.arriendo?.id && a.canal === 'mail',
                  )}
                  textos={estado.textosAviso ?? TEXTOS_AVISO_ORIGINALES}
                  hoy={hoy}
                />
              );
            })}
          </ul>

          <p className="px-4 pt-3 pb-6 text-sm text-tinta-2">
            "Avisado" quiere decir que alguien abrió WhatsApp con el mensaje. La app no puede saber
            si después tocó Enviar.
          </p>
        </>
      )}
    </>
  );
}

/** Cuántos días tiene que pasar para que volver a avisar no parezca repetido. */
const DIAS_PARA_REAVISAR = 7;

function ultimoAvisoDe(
  avisos: AvisoRegistrado[] | undefined,
  arriendoId: string,
  canal: AvisoRegistrado['canal'],
): AvisoRegistrado | null {
  // Vienen del más viejo al más nuevo.
  return (avisos ?? []).filter((a) => a.arriendoId === arriendoId && a.canal === canal).at(-1) ?? null;
}

function FilaAviso({
  cliente,
  serie,
  arriendoId,
  fechaEntrega,
  calculo,
  ultimo,
  mails,
  textos,
  hoy,
}: {
  cliente: Cliente;
  serie: string;
  arriendoId: string;
  fechaEntrega: FechaISO;
  calculo: CalculoVisible;
  /** El último aviso por WhatsApp. */
  ultimo: AvisoRegistrado | null;
  /** Los mails automáticos de este arriendo, del más viejo al más nuevo. */
  mails: AvisoRegistrado[];
  textos: TextosAviso;
  hoy: FechaISO;
}) {
  const { registrarAviso } = useEstado();
  const [error, setError] = useState<string | null>(null);

  // `null` si el texto lleva el importe y quien mira no lo puede ver: ese aviso
  // es del administrador.
  const texto = textoDelAviso(textos, {
    cliente: cliente.nombre,
    serie,
    fechaEntrega,
    dias: calculo.dias,
    importe: calculo.importe,
  });

  const estadoMail = textoDelMail({ email: cliente.email ?? '', dias: calculo.dias, mails, hoy });

  const momento = ultimo === null ? null : enMontevideo(ultimo.creadoEn);
  const reciente = momento !== null && diasEntre(momento.fecha, hoy) < DIAS_PARA_REAVISAR;

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-base font-semibold">{cliente.nombre}</span>
        <ChipEstado estado={estadoVisible(calculo)} />
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-tinta-2">
          <span className="font-mono">{serie}</span> · {calculo.dias} días · desde el{' '}
          {formatearFecha(fechaEntrega)}
        </span>

        <Importe valor={calculo.importe} />
      </div>

      {/* Los dos canales, por separado: que haya salido el mail no dice nada del WhatsApp. */}
      <dl className="mt-2 space-y-0.5 text-sm">
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-tinta-2">WhatsApp:</dt>
          <dd className={ultimo === null ? 'text-tinta-2' : 'font-medium text-gracia'}>
            {ultimo === null
              ? 'sin avisar'
              : `avisado ${cuandoEnFrase(ultimo.creadoEn, hoy)} por ${ultimo.operador}`}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-tinta-2">Mail:</dt>
          <dd className={estadoMail.enviado ? 'font-medium text-gracia' : 'text-tinta-2'}>{estadoMail.texto}</dd>
        </div>
      </dl>

      {texto === null ? (
        <p className="mt-3 text-sm text-tinta-2">Este aviso lleva el importe: lo manda el administrador.</p>
      ) : cliente.telefono.replace(/\D/g, '').length < 8 ? (
        <p className="mt-3 text-sm text-tinta-2">
          Sin teléfono cargado, no se puede avisar. Se carga en la ficha del cliente.
        </p>
      ) : (
        <a
          href={linkWhatsApp(cliente.telefono, texto)}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            // No se espera: WhatsApp se abre en el mismo toque y el registro
            // viaja en paralelo. Si falla, se avisa acá.
            setError(null);
            registrarAviso(arriendoId).catch((falla: unknown) => {
              setError(
                falla instanceof Error
                  ? `No quedó registrado: ${falla.message}`
                  : 'No quedó registrado el aviso.',
              );
            });
          }}
          className={`mt-3 flex items-center justify-center gap-2 rounded-[15px] text-base font-semibold ${
            reciente
              ? 'h-[50px] border-[1.5px] border-linea-fuerte bg-white text-tinta active:bg-fondo'
              : 'h-14 bg-tinta font-titulo font-bold text-white active:bg-marca-tinta'
          }`}
        >
          <WhatsApp className="size-5" trazo={2} />
          {reciente ? 'Avisar de nuevo' : 'Avisar por WhatsApp'}
        </a>
      )}

      {error !== null && (
        <p role="alert" className="mt-2 text-sm text-cargo">
          {error}
        </p>
      )}
    </li>
  );
}

/** Lo que dice la fila sobre el mail automático. */
function textoDelMail(datos: {
  email: string;
  dias: number;
  mails: AvisoRegistrado[];
  hoy: FechaISO;
}): { texto: string; enviado: boolean } {
  const etapa = etapaDeAviso(datos.dias);
  const deEstaEtapa = datos.mails.filter((m) => m.etapa === etapa).at(-1) ?? datos.mails.at(-1) ?? null;

  switch (
    proximoMail({ email: datos.email, dias: datos.dias, etapasEnviadas: datos.mails.map((m) => m.etapa) })
  ) {
    case 'sin_mail':
      return { texto: 'sin mail cargado, no se avisa automático', enviado: false };
    case 'sale_a_las_9': {
      const antes = deEstaEtapa === null ? '' : ` (el anterior salió ${cuandoEnFrase(deEstaEtapa.creadoEn, datos.hoy)})`;
      return { texto: `sale automático a las 9:00${antes}`, enviado: false };
    }
    case 'ya_salio':
      return {
        texto: `enviado automático ${cuandoEnFrase(deEstaEtapa?.creadoEn ?? '', datos.hoy)} a ${deEstaEtapa?.destino ?? datos.email}`,
        enviado: true,
      };
    case 'nada':
      return { texto: 'todavía no corresponde', enviado: false };
  }
}
