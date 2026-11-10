import { useState } from 'react';

import type { Tamano } from '../../dominio/tipos';
import { useEstado } from '../../estado/ProveedorEstado';

/**
 * "Serie desconocida: ofrece darla de alta en el momento", de la sección 6.1.
 * Lo mínimo para seguir escaneando: el tamaño.
 *
 * La tarifa no se muestra ni se elige acá: la pone la base según el tamaño, y
 * quien da de alta el cilindro puede ser un empleado, que no ve tarifas.
 */
export function AltaCilindro({ serie, alCerrar }: { serie: string; alCerrar(): void }) {
  const { altaCilindro } = useEstado();

  const [tamano, setTamano] = useState<Tamano>('chico');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function darDeAlta() {
    if (creando) return;

    setCreando(true);
    setError(null);
    altaCilindro(serie, tamano)
      .then(alCerrar)
      .catch((falla: unknown) => {
        setError(falla instanceof Error ? falla.message : 'No se pudo dar de alta el cilindro.');
        setCreando(false);
      });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-slate-900/50" onClick={alCerrar}>
      <div className="w-full rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Dar de alta {serie}</h2>
        <p className="mt-1 text-sm text-slate-500">
          No está en el sistema. Se crea como acetileno. ¿De qué tamaño es?
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['chico', 'grande'] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setTamano(opcion)}
              aria-pressed={tamano === opcion}
              className={`h-14 rounded-xl border text-base font-semibold ${
                tamano === opcion
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {opcion === 'chico' ? 'Chico' : 'Grande'}
            </button>
          ))}
        </div>

        {error !== null && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-cargo-borde bg-cargo-suave p-3 text-sm text-cargo"
          >
            {error}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={alCerrar}
            className="h-13 rounded-xl border border-slate-300 py-3.5 text-base font-semibold active:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={darDeAlta}
            disabled={creando}
            className="h-13 rounded-xl bg-slate-900 py-3.5 text-base font-semibold text-white active:bg-slate-700 disabled:bg-slate-300"
          >
            {creando ? 'Creando…' : 'Dar de alta'}
          </button>
        </div>
      </div>
    </div>
  );
}
