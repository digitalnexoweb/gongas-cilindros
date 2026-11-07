import type { CalculoArriendo, EstadoArriendo } from '../dominio/arriendo';

/** Los tres estados de la sección 5, más el stock, que no es un arriendo. */
export type EstadoVisible = EstadoArriendo | 'stock';

/** Sin arriendo abierto no hay estado de arriendo: el cilindro está en stock. */
export function estadoVisible(calculo: CalculoArriendo | null): EstadoVisible {
  return calculo?.estado ?? 'stock';
}

const etiquetas: Record<EstadoVisible, string> = {
  en_gracia: 'En gracia',
  por_vencer: 'Por vencer',
  generando_cargo: 'Generando cargo',
  stock: 'En stock',
};

const clases: Record<EstadoVisible, string> = {
  en_gracia: 'bg-gracia-suave text-gracia border-gracia-borde',
  por_vencer: 'bg-vencer-suave text-vencer border-vencer-borde',
  generando_cargo: 'bg-cargo-suave text-cargo border-cargo-borde',
  stock: 'bg-white text-slate-500 border-slate-300',
};

export function ChipEstado({ estado }: { estado: EstadoVisible }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${clases[estado]}`}
    >
      {etiquetas[estado]}
    </span>
  );
}
