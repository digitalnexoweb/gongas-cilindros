export function Buscador({
  valor,
  alCambiar,
  marcador,
}: {
  valor: string;
  alCambiar(nuevo: string): void;
  marcador: string;
}) {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        type="search"
        inputMode="search"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={marcador}
        aria-label={marcador}
        className="h-12 w-full rounded-xl border border-slate-300 bg-white pr-4 pl-11 text-base placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
      />

      {valor !== '' && (
        <button
          type="button"
          onClick={() => alCambiar('')}
          aria-label="Limpiar la búsqueda"
          className="absolute top-1/2 right-1 size-10 -translate-y-1/2 rounded-lg text-slate-400 active:bg-slate-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
