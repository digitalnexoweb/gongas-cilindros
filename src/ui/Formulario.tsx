/**
 * Las piezas de formulario que comparten el alta y la edición: un campo de
 * texto, un selector de dos o tres opciones, el cartel de error y el botón
 * principal. Con los tokens de DISENO.md, sección 4.
 */

export const claseBotonPrincipal =
  'h-[58px] w-full rounded-[15px] bg-tinta font-titulo text-[17px] font-bold text-white active:bg-marca-tinta disabled:bg-linea-fuerte disabled:text-tinta-2';

export const claseBotonSecundario =
  'h-[50px] w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white text-base font-semibold active:bg-fondo';

export function Campo({
  etiqueta,
  valor,
  alCambiar,
  modo,
  ayuda,
  autoFoco = false,
  prefijo,
}: {
  etiqueta: string;
  valor: string;
  alCambiar(nuevo: string): void;
  modo?: 'numeric' | 'tel' | 'decimal' | 'email';
  ayuda?: string;
  autoFoco?: boolean;
  /** Un texto fijo a la izquierda, como "$". */
  prefijo?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-tinta-2">{etiqueta}</span>
      <span className="relative mt-1.5 block">
        {prefijo !== undefined && (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base text-tinta-2">
            {prefijo}
          </span>
        )}
        <input
          type="text"
          inputMode={modo}
          autoCapitalize={modo === 'email' ? 'none' : undefined}
          autoFocus={autoFoco}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          className={`h-12 w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white text-base focus:border-marca focus:outline-none ${
            prefijo === undefined ? 'px-4' : 'pr-4 pl-9'
          }`}
        />
      </span>
      {ayuda !== undefined && <span className="mt-1 block text-sm text-tinta-2">{ayuda}</span>}
    </label>
  );
}

export function Opciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  opciones: readonly { valor: T; texto: string }[];
  valor: T;
  alCambiar(nuevo: T): void;
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-tinta-2">{etiqueta}</span>
      <div
        className="mt-2 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}
      >
        {opciones.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => alCambiar(opcion.valor)}
            aria-pressed={valor === opcion.valor}
            className={`h-12 rounded-[15px] border-[1.5px] text-base ${
              valor === opcion.valor
                ? 'border-tinta bg-tinta font-semibold text-white'
                : 'border-linea-fuerte bg-white text-tinta-2'
            }`}
          >
            {opcion.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ErrorDeFormulario({ mensaje }: { mensaje: string | null }) {
  if (mensaje === null) return null;
  return (
    <p role="alert" className="rounded-xl border border-cargo-borde bg-cargo-suave p-3 text-sm text-cargo">
      {mensaje}
    </p>
  );
}

/** Un número escrito a la uruguaya ("1.250,50" o "480") a número, o `null` si no lo es. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.trim().replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Number(limpio);
}
