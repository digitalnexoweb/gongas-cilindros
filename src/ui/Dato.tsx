import type { ReactNode } from 'react';

/** Una fila de dato, etiqueta a la izquierda y valor a la derecha. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <span className="shrink-0 text-sm text-slate-500">{etiqueta}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

/** Un bloque blanco con título, de los que se apilan en las fichas. */
export function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="px-4 pb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
        {titulo}
      </h2>
      <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">{children}</div>
    </section>
  );
}
