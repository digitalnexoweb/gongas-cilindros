import { useState } from 'react';

import type { LoteConfirmado } from '../../datos/repositorio';
import { formatearFecha } from '../../dominio/arriendo';
import { linkWhatsApp, textoComprobante } from '../../dominio/mensajes';
import type { Cliente, TipoMovimiento } from '../../dominio/tipos';
import { Encabezado } from '../Encabezado';

/** El comprobante de 6.1: las series, el cliente y la fecha, para copiar o mandar. */
export function Comprobante({
  lote,
  tipo,
  cliente,
  alTerminar,
}: {
  /** Lo que la base confirmó que grabó: sus series y su fecha, no las del celular. */
  lote: LoteConfirmado;
  tipo: TipoMovimiento;
  cliente: Cliente | null;
  alTerminar(): void;
}) {
  const [copiado, setCopiado] = useState(false);

  const texto = textoComprobante({ tipo, series: lote.series, cliente, fecha: lote.fecha });

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <>
      <Encabezado
        titulo={tipo === 'entrega' ? 'Entrega confirmada' : 'Devolución confirmada'}
        bajada={`${formatearFecha(lote.fecha)}${cliente === null ? '' : ` · ${cliente.nombre}`}`}
      />

      <div className="px-4 pt-4 pb-6">
        <div className="rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
            {lote.series.length === 1 ? '1 cilindro' : `${lote.series.length} cilindros`}
          </p>

          <ul className="divide-y divide-slate-100">
            {lote.series.map((serie, i) => (
              <li key={`${serie}-${i}`} className="px-4 py-3 font-mono text-base font-semibold">
                {serie}
              </li>
            ))}
          </ul>
        </div>

        {lote.avisos.length > 0 && (
          <div className="mt-4 rounded-xl border border-vencer-borde bg-vencer-suave p-4">
            <p className="text-sm font-semibold text-vencer">Avisos del lote</p>
            <ul className="mt-2 space-y-1">
              {lote.avisos.map((a, i) => (
                <li key={`${a.serie}-${i}`} className="text-sm text-vencer">
                  {a.mensaje}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={() => void copiar()}
            className="h-13 w-full rounded-xl border border-slate-900 py-3.5 text-base font-semibold active:bg-slate-100"
          >
            {copiado ? 'Copiado' : 'Copiar como texto'}
          </button>

          {cliente !== null && cliente.telefono.trim() !== '' && (
            <a
              href={linkWhatsApp(cliente.telefono, texto)}
              target="_blank"
              rel="noreferrer"
              className="flex h-13 w-full items-center justify-center rounded-xl border border-slate-900 py-3.5 text-base font-semibold active:bg-slate-100"
            >
              Mandar por WhatsApp
            </a>
          )}

          <button
            type="button"
            onClick={alTerminar}
            className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700"
          >
            Listo
          </button>
        </div>
      </div>
    </>
  );
}
