import type { ReactNode } from 'react';

/** El encabezado fijo de cada pantalla. Con `alVolver` muestra la flecha de atrás. */
export function Encabezado({
  titulo,
  bajada,
  alVolver,
  accion,
  children,
}: {
  titulo: string;
  bajada?: string;
  alVolver?: () => void;
  /** Un botón a la derecha del título, como el engranaje de Ajustes. */
  accion?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="no-imprimir sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
      <div className="flex items-center gap-1 px-4 pt-4 pb-3">
        {alVolver !== undefined && (
          <button
            type="button"
            onClick={alVolver}
            aria-label="Volver"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-600 active:bg-slate-200"
          >
            <svg
              className="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{titulo}</h1>
          {bajada !== undefined && <p className="mt-0.5 text-sm text-slate-500">{bajada}</p>}
        </div>

        {accion !== undefined && <div className="-mr-2 shrink-0">{accion}</div>}
      </div>

      {children !== undefined && <div className="space-y-3 px-4 pb-3">{children}</div>}
    </header>
  );
}
