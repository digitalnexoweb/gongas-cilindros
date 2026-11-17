import type { ReactNode } from 'react';

import { nombreDelMes, type Mes } from '../../dominio/resumen';
import type { MovimientoDelMes as Movimiento } from './panel';

function Numero({ titulo, valor, detalle }: { titulo: string; valor: number; detalle?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-linea bg-white px-3 py-3">
      <p className="truncate text-xs font-semibold text-tinta-2">{titulo}</p>
      <p className="mt-1 font-titulo text-[28px] leading-none font-bold tabular-nums">{valor}</p>
      {detalle !== undefined && <p className="mt-1 truncate text-xs text-tinta-2">{detalle}</p>}
    </div>
  );
}

/**
 * Lo que se movió en el mes elegido: entregas, devoluciones y avisos, y las
 * entregas y devoluciones por semana. Cuenta cilindros, no lotes.
 */
export function MovimientoDelMes({
  mes,
  movimiento,
  selector,
}: {
  mes: Mes;
  movimiento: Movimiento;
  /** El selector de mes, para quien no ve la tarjeta de plata, que es donde va siempre. */
  selector?: ReactNode;
}) {
  const avisos = movimiento.avisosWhatsapp + movimiento.avisosMail;
  const tope = Math.max(1, ...movimiento.semanas.flatMap((s) => [s.entregas, s.devoluciones]));

  return (
    <section className="mx-4 mt-6">
      <h2 className="mb-2 text-xs font-bold tracking-wider text-tinta-2 uppercase">
        Movimiento de {nombreDelMes(mes)}
      </h2>
      {selector !== undefined && <div className="mb-3">{selector}</div>}

      <div className="grid grid-cols-3 gap-2">
        <Numero titulo="Entregas" valor={movimiento.entregas} />
        <Numero titulo="Devoluciones" valor={movimiento.devoluciones} />
        <Numero
          titulo="Avisos"
          valor={avisos}
          detalle={avisos === 0 ? undefined : `${movimiento.avisosWhatsapp} WhatsApp · ${movimiento.avisosMail} mail`}
        />
      </div>

      <div className="mt-2 rounded-2xl border border-linea bg-white px-4 py-3">
        <p className="mb-2 flex gap-4 text-xs text-tinta-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-marca" aria-hidden="true" /> Entregas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-tinta-3" aria-hidden="true" /> Devoluciones
          </span>
        </p>

        <ul className="space-y-2">
          {movimiento.semanas.map((s) => (
            <li key={s.desde} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs text-tinta-2 tabular-nums">
                {Number(s.desde.slice(8, 10))}–{Number(s.hasta.slice(8, 10))}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <Barra valor={s.entregas} tope={tope} color="bg-marca" />
                <Barra valor={s.devoluciones} tope={tope} color="bg-tinta-3" />
              </span>
              <span className="w-14 shrink-0 text-right text-xs text-tinta-2 tabular-nums">
                {s.entregas} · {s.devoluciones}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Barra({ valor, tope, color }: { valor: number; tope: number; color: string }) {
  return (
    <span className="block h-2 rounded-full bg-fondo" aria-hidden="true">
      <span
        className={`block h-2 rounded-full ${valor === 0 ? '' : color}`}
        style={{ width: `${(valor / tope) * 100}%` }}
      />
    </span>
  );
}
