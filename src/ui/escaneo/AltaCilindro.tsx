import { useState } from 'react';

import { TARIFA_POR_TAMANO, type Tamano } from '../../dominio/tipos';
import { formatearPesos } from '../../dominio/arriendo';
import { altaCilindro } from '../../dominio/storage';
import { useEstado } from '../../estado/ProveedorEstado';

/**
 * "Serie desconocida: ofrece darla de alta en el momento", de la sección 6.1.
 * Lo mínimo para seguir escaneando: el tamaño, que es lo que fija la tarifa.
 */
export function AltaCilindro({
  serie,
  alCerrar,
}: {
  serie: string;
  alCerrar(): void;
}) {
  const { estado, actualizar } = useEstado();
  const [tamano, setTamano] = useState<Tamano>('chico');

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-slate-900/50" onClick={alCerrar}>
      <div
        className="w-full rounded-t-2xl bg-white p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Dar de alta {serie}</h2>
        <p className="mt-1 text-sm text-slate-500">
          No está en el sistema. Se crea como acetileno, y la tarifa sale del tamaño.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['chico', 'grande'] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setTamano(opcion)}
              aria-pressed={tamano === opcion}
              className={`rounded-xl border p-3 text-left ${
                tamano === opcion ? 'border-slate-900 bg-slate-50' : 'border-slate-300'
              }`}
            >
              <span className="block text-base font-semibold">
                {opcion === 'chico' ? 'Chico' : 'Grande'}
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">
                {formatearPesos(TARIFA_POR_TAMANO[opcion])} por mes
              </span>
            </button>
          ))}
        </div>

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
            onClick={() => {
              const { estado: nuevoEstado } = altaCilindro(estado, {
                serie,
                tipoGas: 'acetileno',
                tamano,
              });
              actualizar(nuevoEstado);
              alCerrar();
            }}
            className="h-13 rounded-xl bg-slate-900 py-3.5 text-base font-semibold text-white active:bg-slate-700"
          >
            Dar de alta
          </button>
        </div>
      </div>
    </div>
  );
}
