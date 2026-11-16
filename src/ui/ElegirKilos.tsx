import { useState } from 'react';

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
  alAgregarPeso,
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
  /**
   * Si viene, abajo aparece "Otro peso" para sumar uno que no está en la lista.
   * Devuelve el peso como quedó, que pasa a estar elegido.
   */
  alAgregarPeso?(kg: number): Promise<number>;
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

  const otro =
    alAgregarPeso === undefined || chico ? null : (
      <OtroPeso pesos={opciones} alAgregar={alAgregarPeso} alElegir={alCambiar} />
    );

  if (etiqueta === undefined && otro === null) return botones;

  return (
    <div>
      {etiqueta !== undefined && <span className="block text-sm font-medium text-tinta-2">{etiqueta}</span>}
      {botones}
      {otro}
    </div>
  );
}

/** Kilos escritos a mano: "10", "4,5" o "4.5". Un decimal como mucho. */
export function leerKilos(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d)?$/.test(limpio)) return null;
  const kg = Number(limpio);
  return kg > 0 && kg < 1000 ? kg : null;
}

/** "Otro peso": para un cilindro de un tamaño que todavía no está en la lista. */
function OtroPeso({
  pesos,
  alAgregar,
  alElegir,
}: {
  pesos: number[];
  alAgregar(kg: number): Promise<number>;
  alElegir(kg: number): void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agregado, setAgregado] = useState<number | null>(null);

  const kg = leerKilos(texto);
  const repetido = kg !== null && pesos.includes(kg);

  function agregar() {
    if (kg === null || agregando) return;
    if (repetido) {
      alElegir(kg);
      setAbierto(false);
      return;
    }
    setAgregando(true);
    setError(null);
    alAgregar(kg)
      .then((nuevo) => {
        alElegir(nuevo);
        setAgregado(nuevo);
        setAbierto(false);
        setTexto('');
      })
      .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : 'No se pudo agregar el peso.'))
      .finally(() => setAgregando(false));
  }

  if (!abierto) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="h-11 px-1 text-sm font-semibold text-marca active:underline"
        >
          ¿Otro peso?
        </button>
        {agregado !== null && (
          <p className="text-sm text-tinta-2">
            {nombreKilos(agregado)} se sumó a la lista. Queda sin tarifa hasta que Joaquín la ponga en Ajustes →
            Tarifas.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-dashed border-linea-fuerte p-3">
      <label className="block">
        <span className="block text-sm font-medium text-tinta-2">Kilos</span>
        <div className="mt-1.5 flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="ej. 10"
            autoFocus
            className="h-12 min-w-0 flex-1 rounded-[15px] border-[1.5px] border-linea-fuerte bg-white px-3 text-base focus:border-marca focus:outline-none"
          />
          <button
            type="button"
            onClick={agregar}
            disabled={kg === null || agregando}
            className="h-12 shrink-0 rounded-[15px] bg-tinta px-4 text-base font-semibold text-white disabled:opacity-40"
          >
            {agregando ? 'Agregando…' : repetido ? 'Elegir' : 'Agregar'}
          </button>
        </div>
      </label>
      <p className="text-sm text-tinta-2">
        {texto.trim() !== '' && kg === null
          ? 'Escribí solo el número de kilos, por ejemplo 10 o 4,5.'
          : repetido
            ? 'Ese ya está en la lista.'
            : 'Se suma a la lista para todos. Queda sin tarifa hasta que Joaquín la ponga en Ajustes → Tarifas.'}
      </p>
      {error !== null && (
        <p role="alert" className="text-sm text-cargo">
          {error}
        </p>
      )}
      <button type="button" onClick={() => setAbierto(false)} className="h-10 text-sm font-semibold text-tinta-2">
        Cancelar
      </button>
    </div>
  );
}

/** Los pesos que se ofrecen, de menor a mayor. Sin datos de la base, los de arranque. */
export function pesosActivos(pesos: { kg: number; activo: boolean }[] | undefined): number[] {
  const lista = (pesos ?? []).filter((p) => p.activo).map((p) => p.kg);
  return lista.length > 0 ? lista.sort((a, b) => a - b) : [2, 4, 6, 7];
}
