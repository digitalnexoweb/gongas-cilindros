import type { ReactNode } from 'react';

/** Los cinco ítems de la navegación de la sección 6. */
export type Pestana = 'escanear' | 'cilindros' | 'clientes' | 'avisos' | 'resumen';

const trazo = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const items: { id: Pestana; etiqueta: string; icono: ReactNode }[] = [
  {
    id: 'escanear',
    etiqueta: 'Escanear',
    icono: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M4 12h16" />
      </>
    ),
  },
  {
    id: 'cilindros',
    etiqueta: 'Cilindros',
    icono: (
      <>
        <rect x="8" y="6" width="8" height="15" rx="3" />
        <path d="M10.5 6V4h3v2" />
      </>
    ),
  },
  {
    id: 'clientes',
    etiqueta: 'Clientes',
    icono: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </>
    ),
  },
  {
    id: 'avisos',
    etiqueta: 'Avisos',
    icono: (
      <>
        <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
        <path d="M10.5 19a2 2 0 0 0 3 0" />
      </>
    ),
  },
  {
    id: 'resumen',
    etiqueta: 'Resumen',
    icono: (
      <>
        <path d="M4 20h16" />
        <path d="M7 20v-6M12 20V7M17 20v-9" />
      </>
    ),
  },
];

export function NavegacionInferior({
  activa,
  alElegir,
  enCargo,
}: {
  activa: Pestana;
  alElegir(pestana: Pestana): void;
  /** Cuántos cilindros ya generan cargo: el globo rojo de Avisos. Es una cantidad, no plata. */
  enCargo: number;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className="no-imprimir fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const esActiva = item.id === activa;
          const globo = item.id === 'avisos' && enCargo > 0 ? enCargo : null;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => alElegir(item.id)}
                aria-current={esActiva ? 'page' : undefined}
                aria-label={globo === null ? undefined : `${item.etiqueta}, ${globo} para cobrar`}
                className={`flex h-[62px] w-full flex-col items-center justify-center gap-1 active:bg-fondo ${
                  esActiva ? 'text-marca' : 'text-tinta-3'
                }`}
              >
                <span className="relative">
                  <svg className="size-6" viewBox="0 0 24 24" aria-hidden="true" {...trazo}>
                    {item.icono}
                  </svg>
                  {globo !== null && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1.5 left-3.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cargo px-1 text-[11px] leading-none font-bold text-white ring-2 ring-white"
                    >
                      {globo > 99 ? '99+' : globo}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] ${esActiva ? 'font-bold' : 'font-medium'}`}>
                  {item.etiqueta}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
