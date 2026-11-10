import { useMemo } from 'react';

import { DIAS_GRACIA, formatearFecha } from '../../dominio/arriendo';
import { vistaAvisos } from '../../dominio/consultas';
import { linkWhatsApp, textoAviso } from '../../dominio/mensajes';
import { useEstado } from '../../estado/ProveedorEstado';
import { ChipEstado, estadoVisible } from '../ChipEstado';
import { Encabezado } from '../Encabezado';
import { Importe } from '../Importe';

/** La sección 6.4, que el SPEC llama el corazón del sistema. */
export function PantallaAvisos() {
  const { estado, hoy } = useEstado();
  const avisos = useMemo(() => vistaAvisos(estado, hoy), [estado, hoy]);

  return (
    <>
      <Encabezado
        titulo="Avisos"
        bajada={
          avisos.length === 0
            ? 'Nada por vencer'
            : avisos.length === 1
              ? '1 cilindro con 54 días o más'
              : `${avisos.length} cilindros con 54 días o más`
        }
      />

      {avisos.length === 0 ? (
        <p className="px-8 pt-16 text-center text-sm text-slate-500">
          Ningún cilindro llegó a los 54 días. No hay nada que avisar.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 border-b border-slate-200 bg-white">
          {avisos.map((vista) => {
            const cliente = vista.ubicacion.lugar === 'cliente' ? vista.ubicacion.cliente : null;
            if (cliente === null || vista.arriendo === null || vista.calculo === null) return null;

            // De 61 días en adelante el texto de 6.4 dice el importe. Si quien
            // mira no lo puede ver, ese aviso no lo puede mandar: es del
            // administrador. Los "por vencer" no llevan importe y salen igual.
            const necesitaImporte = vista.calculo.dias > DIAS_GRACIA;
            const texto =
              necesitaImporte && vista.calculo.importe === null
                ? null
                : textoAviso({
                    serie: vista.cilindro.serie,
                    fechaEntrega: vista.arriendo.fechaEntrega,
                    dias: vista.calculo.dias,
                    importe: vista.calculo.importe ?? 0,
                  });

            return (
              <li key={vista.cilindro.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-base font-semibold">{cliente.nombre}</span>
                  <ChipEstado estado={estadoVisible(vista.calculo)} />
                </div>

                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-slate-500">
                    <span className="font-mono">{vista.cilindro.serie}</span> ·{' '}
                    {vista.calculo.dias} días · desde el{' '}
                    {formatearFecha(vista.arriendo.fechaEntrega)}
                  </span>

                  <Importe valor={vista.calculo.importe} />
                </div>

                {texto === null ? (
                  <p className="mt-3 text-sm text-slate-400">
                    Este aviso lleva el importe: lo manda el administrador.
                  </p>
                ) : cliente.telefono.trim() === '' ? (
                  <p className="mt-3 text-sm text-slate-400">
                    Sin teléfono cargado, no se puede avisar.
                  </p>
                ) : (
                  <a
                    href={linkWhatsApp(cliente.telefono, texto)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex h-12 items-center justify-center rounded-xl border border-slate-900 text-base font-semibold active:bg-slate-100"
                  >
                    Avisar por WhatsApp
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
