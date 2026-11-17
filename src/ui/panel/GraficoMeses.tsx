import { formatearPesos, formatearPesosCorto } from '../../dominio/arriendo';
import { nombreDelMes, type Mes } from '../../dominio/resumen';

const CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function corto(mes: Mes): string {
  return CORTOS[Number(mes.slice(5, 7)) - 1] ?? mes;
}

/**
 * Lo devengado de los últimos meses, en barras hechas con divs. El importe va
 * escrito arriba de cada barra: se lee sin depender del dibujo. En el mes en
 * curso, la parte punteada es lo que falta para la proyección.
 */
export function GraficoMeses({
  totales,
  mesActual,
  proyeccion,
  elegido,
  alElegir,
}: {
  totales: { mes: Mes; total: number }[];
  mesActual: Mes;
  proyeccion: number | null;
  elegido: Mes;
  alElegir(mes: Mes): void;
}) {
  const tope = Math.max(1, proyeccion ?? 0, ...totales.map((t) => t.total));

  return (
    <section className="mx-4 mt-6">
      <h2 className="mb-2 text-xs font-bold tracking-wider text-tinta-2 uppercase">Devengado por mes</h2>

      <div className="rounded-2xl border border-linea bg-white px-3 pt-4 pb-3">
        <div className="flex h-44 items-end gap-1.5">
          {totales.map(({ mes, total }) => {
            const esActual = mes === mesActual;
            const esElegido = mes === elegido;
            const falta = esActual && proyeccion !== null ? Math.max(0, proyeccion - total) : 0;
            const etiqueta = esActual && proyeccion !== null ? proyeccion : total;

            return (
              <button
                key={mes}
                type="button"
                onClick={() => alElegir(mes)}
                aria-pressed={esElegido}
                aria-label={`${nombreDelMes(mes)}: ${formatearPesos(total)}${
                  esActual && proyeccion !== null ? `, cerraría en ${formatearPesos(proyeccion)}` : ''
                }`}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <span
                  className={`mb-1 text-[11px] leading-none whitespace-nowrap tabular-nums ${
                    esElegido ? 'font-bold text-tinta' : 'font-medium text-tinta-2'
                  }`}
                >
                  {formatearPesosCorto(etiqueta)}
                </span>
                {falta > 0 && (
                  <span
                    className="w-full rounded-t-md border-2 border-b-0 border-dashed border-marca-clara"
                    style={{ height: `${(falta / tope) * 100}%` }}
                  />
                )}
                <span
                  className={`w-full ${falta > 0 ? '' : 'rounded-t-md'} ${esElegido ? 'bg-marca' : 'bg-marca-clara'}`}
                  // Una rayita aunque sea cero, para que se vea que el mes está.
                  style={{ height: `max(3px, ${(total / tope) * 100}%)` }}
                />
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex gap-1.5 border-t border-linea pt-2">
          {totales.map(({ mes }) => (
            <span
              key={mes}
              className={`flex-1 text-center text-xs ${mes === elegido ? 'font-bold text-tinta' : 'text-tinta-2'}`}
            >
              {corto(mes)}
            </span>
          ))}
        </div>
      </div>

      {proyeccion !== null && (
        <p className="mt-2 text-xs text-tinta-2">
          La parte punteada de {corto(mesActual)} es lo que falta para cerrar como viene.
        </p>
      )}
    </section>
  );
}
