import { useState } from 'react';

import type { Tamano } from '../../dominio/tipos';
import { useEstado } from '../../estado/ProveedorEstado';
import { ErrorDeFormulario, Opciones, claseBotonPrincipal, claseBotonSecundario } from '../Formulario';

/**
 * "Serie desconocida: ofrece darla de alta en el momento", de la sección 6.1.
 * Lo mínimo para seguir escaneando: el tamaño y el gas con el que sale.
 *
 * El tamaño queda para siempre en el cilindro: de ahí en más, cada vez que se
 * escanee esa etiqueta ya figura como grande o chico. La tarifa no se muestra
 * ni se elige acá: la pone la base según el tamaño, y quien da de alta el
 * cilindro puede ser un operario, que no ve tarifas.
 */
export function AltaCilindro({
  serie,
  gases,
  alCerrar,
  alCrear,
}: {
  serie: string;
  /** Los gases que se pueden elegir, en orden. */
  gases: string[];
  alCerrar(): void;
  /** Con el gas elegido, para que la fila del lote lo muestre ya puesto. */
  alCrear(gas: string): void;
}) {
  const { altaCilindro } = useEstado();

  const [tamano, setTamano] = useState<Tamano>('chico');
  const [gas, setGas] = useState(gases[0] ?? 'Acetileno');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function darDeAlta() {
    if (creando) return;

    setCreando(true);
    setError(null);
    altaCilindro(serie, tamano, gas)
      .then(() => {
        alCrear(gas);
        alCerrar();
      })
      .catch((falla: unknown) => {
        setError(falla instanceof Error ? falla.message : 'No se pudo dar de alta el cilindro.');
        setCreando(false);
      });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-tinta/50" onClick={alCerrar}>
      <div
        className="w-full space-y-4 rounded-t-2xl bg-white p-5 pb-[calc(32px+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-titulo text-xl font-bold">
            Dar de alta <span className="font-mono">{serie}</span>
          </h2>
          <p className="mt-1 text-sm text-tinta-2">
            No está en el sistema. El tamaño queda guardado en la etiqueta para las próximas veces.
          </p>
        </div>

        <Opciones<Tamano>
          etiqueta="Tamaño"
          opciones={[
            { valor: 'chico', texto: 'Chico' },
            { valor: 'grande', texto: 'Grande' },
          ]}
          valor={tamano}
          alCambiar={setTamano}
        />

        <label className="block">
          <span className="block text-sm font-medium text-tinta-2">Gas</span>
          <select
            value={gas}
            onChange={(e) => setGas(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white px-3 text-base"
          >
            {gases.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <ErrorDeFormulario mensaje={error} />

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={alCerrar} className={claseBotonSecundario}>
            Cancelar
          </button>
          <button type="button" onClick={darDeAlta} disabled={creando} className={claseBotonPrincipal}>
            {creando ? 'Creando…' : 'Dar de alta'}
          </button>
        </div>
      </div>
    </div>
  );
}
