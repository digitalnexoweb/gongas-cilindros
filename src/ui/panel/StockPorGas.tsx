import { nombreKilos } from '../../dominio/tipos';
import { Alerta } from '../iconos';
import type { FiltroInicial } from '../pantallas/filtroCilindros';
import type { FilaStock } from './panel';

/**
 * Cuántos hay de cada gas y peso, en stock y en clientes. Los que no tienen
 * ninguno en stock se marcan: no se puede entregar uno, o hay que mandar a
 * recargar. Cada fila abre Cilindros con ese gas y ese peso.
 */
export function StockPorGas({ filas, alVer }: { filas: FilaStock[]; alVer(filtro: FiltroInicial): void }) {
  if (filas.length === 0) return null;

  return (
    <section className="mx-4 mt-6">
      <h2 className="mb-2 text-xs font-bold tracking-wider text-tinta-2 uppercase">Stock por gas y peso</h2>

      <ul className="divide-y divide-linea rounded-2xl border border-linea bg-white">
        {filas.map((fila) => {
          const total = fila.enStock + fila.enClientes;
          const sinStock = fila.enStock === 0;

          return (
            <li key={`${fila.gas}|${fila.kg}`}>
              <button
                type="button"
                onClick={() => alVer({ gas: fila.gas, kg: fila.kg })}
                className="block w-full px-4 py-3 text-left active:bg-fondo"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-base font-semibold">
                    {fila.gas} · {nombreKilos(fila.kg)}
                  </span>
                  <span className="shrink-0 text-sm text-tinta-2 tabular-nums">
                    {sinStock ? (
                      <span className="inline-flex items-center gap-1 font-bold text-vencer">
                        <Alerta className="size-4" trazo={2.2} />
                        Sin stock
                      </span>
                    ) : (
                      <>
                        <span className="font-bold text-tinta">{fila.enStock}</span> en stock
                      </>
                    )}{' '}
                    · {fila.enClientes} en clientes
                  </span>
                </span>

                {/* La barra: la parte llena es lo que hay en stock. */}
                <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-linea" aria-hidden="true">
                  <span className="bg-marca" style={{ width: `${(fila.enStock / total) * 100}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-tinta-2">La barra llena es lo que hay en stock.</p>
    </section>
  );
}
