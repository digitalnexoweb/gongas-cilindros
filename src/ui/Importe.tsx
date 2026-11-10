import { formatearPesos } from '../dominio/arriendo';

/**
 * Un importe en pantalla. Si es `null` no dibuja nada: `null` significa que
 * quien está mirando no puede ver la plata, y eso no se muestra como "$ 0".
 */
export function Importe({ valor, grande = false }: { valor: number | null; grande?: boolean }) {
  if (valor === null) return null;

  return (
    <span
      className={`shrink-0 tabular-nums ${grande ? 'text-xl font-bold' : 'text-base font-semibold'} ${
        valor > 0 ? 'text-cargo' : 'text-slate-400'
      }`}
    >
      {formatearPesos(valor)}
    </span>
  );
}
