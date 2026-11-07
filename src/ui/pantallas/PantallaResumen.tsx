import { useMemo, useState } from 'react';

import { formatearPesos } from '../../dominio/arriendo';
import {
  csvDelResumen,
  mesDe,
  mesesConMovimiento,
  nombreArchivoCSV,
  nombreDelMes,
  resumenDelMes,
  type Mes,
} from '../../dominio/resumen';
import { useEstado } from '../../estado/ProveedorEstado';
import { descargarTexto } from '../descargar';
import { Encabezado } from '../Encabezado';

/**
 * La sección 6.5. El mes muestra lo **devengado en ese mes**, no el acumulado:
 * así los meses se suman sin pisarse y el CSV sirve para cobrar.
 */
export function PantallaResumen() {
  const { estado, hoy } = useEstado();

  const meses = useMemo(() => mesesConMovimiento(estado, hoy), [estado, hoy]);
  const [mes, setMes] = useState<Mes>(() => mesDe(hoy));
  const resumen = useMemo(() => resumenDelMes(estado, mes, hoy), [estado, mes, hoy]);

  return (
    <>
      <Encabezado titulo="Resumen del mes" bajada="Lo devengado en el mes elegido">
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          aria-label="Mes del resumen"
          className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base focus:border-slate-900 focus:outline-none"
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {nombreDelMes(m)}
            </option>
          ))}
        </select>
      </Encabezado>

      {resumen.filas.length === 0 ? (
        <p className="px-8 pt-16 text-center text-sm text-slate-500">
          En {nombreDelMes(mes)} ningún cilindro generó cargo.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-200 border-b border-slate-200 bg-white">
            {resumen.filas.map((fila) => (
              <li key={fila.cliente.id} className="px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-base font-semibold">{fila.cliente.nombre}</span>
                  <span className="shrink-0 text-base font-semibold tabular-nums text-cargo">
                    {formatearPesos(fila.total)}
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  {fila.cilindros === 1 ? '1 cilindro' : `${fila.cilindros} cilindros`} ·{' '}
                  {fila.diasFacturables} días facturables
                </p>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4">
            <span className="text-base font-semibold">Total del mes</span>
            <span className="text-xl font-bold tabular-nums text-cargo">
              {formatearPesos(resumen.total)}
            </span>
          </div>
        </>
      )}

      <div className="px-4 py-5">
        <button
          type="button"
          onClick={() => descargarTexto(nombreArchivoCSV(mes), csvDelResumen(resumen))}
          className="h-13 w-full rounded-xl border border-slate-900 py-3.5 text-base font-semibold active:bg-slate-100"
        >
          Exportar a CSV
        </button>
      </div>
    </>
  );
}
