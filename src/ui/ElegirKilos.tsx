import { nombreKilos } from '../dominio/tipos';

/**
 * Los pesos como botones: 2 kg · 4 kg · 6 kg · 7 kg. Se usa al dar de alta,
 * en la fila del lote para corregir, y al editar un cilindro.
 */
export function ElegirKilos({
  pesos,
  valor,
  alCambiar,
  etiqueta,
  chico = false,
  deshabilitado = false,
}: {
  /** Los pesos a ofrecer, de menor a mayor. */
  pesos: number[];
  valor: number | null;
  alCambiar(kg: number): void;
  /** Si viene, se muestra arriba. Sin etiqueta, el grupo se anuncia como "Peso". */
  etiqueta?: string;
  /** Más compacto, para la fila del lote. */
  chico?: boolean;
  deshabilitado?: boolean;
}) {
  // El que tiene, aunque ya no se ofrezca, para no perderlo de vista.
  const opciones = valor !== null && !pesos.includes(valor) ? [...pesos, valor].sort((a, b) => a - b) : pesos;

  const botones = (
    <div
      role="group"
      aria-label={etiqueta ?? 'Peso'}
      className={
        chico
          ? 'flex shrink-0 flex-wrap rounded-[12px] border-[1.5px] border-linea-fuerte p-0.5'
          : 'mt-2 grid gap-2'
      }
      style={chico ? undefined : { gridTemplateColumns: `repeat(${Math.min(opciones.length, 4)}, minmax(0, 1fr))` }}
    >
      {opciones.map((kg) => (
        <button
          key={kg}
          type="button"
          onClick={() => alCambiar(kg)}
          aria-pressed={valor === kg}
          disabled={deshabilitado}
          className={
            chico
              ? `h-10 rounded-[9px] px-2.5 text-sm font-semibold ${valor === kg ? 'bg-tinta text-white' : 'text-tinta-2'}`
              : `h-12 rounded-[15px] border-[1.5px] text-base ${
                  valor === kg
                    ? 'border-tinta bg-tinta font-semibold text-white'
                    : 'border-linea-fuerte bg-white text-tinta-2'
                }`
          }
        >
          {nombreKilos(kg)}
        </button>
      ))}
    </div>
  );

  if (etiqueta === undefined) return botones;

  return (
    <div>
      <span className="block text-sm font-medium text-tinta-2">{etiqueta}</span>
      {botones}
    </div>
  );
}

/** Los pesos que se ofrecen, de menor a mayor. Sin datos de la base, los de arranque. */
export function pesosActivos(pesos: { kg: number; activo: boolean }[] | undefined): number[] {
  const lista = (pesos ?? []).filter((p) => p.activo).map((p) => p.kg);
  return lista.length > 0 ? lista.sort((a, b) => a - b) : [2, 4, 6, 7];
}
