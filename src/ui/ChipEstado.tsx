import type { ReactNode } from 'react';

import type { EstadoArriendo } from '../dominio/arriendo';

/** Los tres estados de la sección 5, más el stock, que no es un arriendo. */
export type EstadoVisible = EstadoArriendo | 'stock';

/** Sin arriendo abierto no hay estado de arriendo: el cilindro está en stock. */
export function estadoVisible(calculo: { estado: EstadoArriendo } | null): EstadoVisible {
  return calculo?.estado ?? 'stock';
}

const etiquetas: Record<EstadoVisible, string> = {
  en_gracia: 'En gracia',
  por_vencer: 'Por vencer',
  generando_cargo: 'Generando cargo',
  stock: 'En stock',
};

const clases: Record<EstadoVisible, string> = {
  stock: 'bg-stock-suave text-stock border-stock-borde',
  en_gracia: 'bg-gracia-suave text-gracia border-gracia-borde',
  por_vencer: 'bg-vencer-suave text-vencer border-vencer-borde',
  generando_cargo: 'bg-cargo-suave text-cargo border-cargo-borde',
};

/**
 * Un icono por estado, porque ningún estado se puede distinguir solo por color
 * (DISENO.md, sección 6): quien no separa el rojo del verde los separa por forma.
 */
const iconos: Record<EstadoVisible, ReactNode> = {
  // Caja: está en el depósito.
  stock: (
    <>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </>
  ),
  // Tilde: todo bien.
  en_gracia: <path d="m4.5 12.5 5 5 10-11" />,
  // Reloj: falta poco.
  por_vencer: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2.5" />
    </>
  ),
  // Triángulo de alerta: ya cuesta plata.
  generando_cargo: (
    <>
      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5M12 17.5h.01" />
    </>
  ),
};

/** Medidas de DISENO.md, sección 4: 25 px de alto, 12 px bold, icono de 12 px. */
export function ChipEstado({ estado }: { estado: EstadoVisible }) {
  return (
    <span
      className={`inline-flex h-[25px] shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-bold ${clases[estado]}`}
    >
      <svg
        className="size-3 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {iconos[estado]}
      </svg>
      {etiquetas[estado]}
    </span>
  );
}
