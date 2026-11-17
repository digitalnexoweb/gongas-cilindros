import { useMemo, useState } from 'react';

import { formatearFecha, formatearPesos } from '../../dominio/arriendo';
import { vistaCilindros } from '../../dominio/consultas';
import {
  cargoPorDia,
  csvDelResumen,
  devengadoPorMes,
  empiezanACobrar,
  mesAnterior,
  mesDe,
  mesesConMovimiento,
  nombreArchivoCSV,
  nombreDelMes,
  proyeccionDelMes,
  resumenDelMes,
  ultimosMeses,
  variacion,
  type Mes,
  type ResumenMensual,
} from '../../dominio/resumen';
import { useEstado } from '../../estado/ProveedorEstado';
import { descargarTexto } from '../descargar';
import { Encabezado } from '../Encabezado';
import { GraficoMeses } from '../panel/GraficoMeses';
import { MovimientoDelMes } from '../panel/MovimientoDelMes';
import { conteoDeHoy, movimientoDelMes, stockPorGasYPeso } from '../panel/panel';
import { SelectorMes } from '../panel/SelectorMes';
import { StockPorGas } from '../panel/StockPorGas';
import { TarjetaPlata } from '../panel/TarjetaPlata';
import { LoQueViene, TarjetasHoy } from '../panel/TarjetasHoy';
import type { FiltroInicial } from './filtroCilindros';

/**
 * El panel: cómo está el negocio de un vistazo. Lo abren todos; la plata la ve
 * solo el administrador.
 *
 * La plata del mes muestra lo **devengado en ese mes**, no el acumulado: así los
 * meses se suman sin pisarse y el CSV sirve para cobrar (sección 6.5).
 */
export function PantallaResumen({ alVerCilindros }: { alVerCilindros(filtro: FiltroInicial): void }) {
  const { estado, hoy, puedeVerPlata } = useEstado();

  const mesActual = mesDe(hoy);
  const meses = useMemo(() => mesesConMovimiento(estado, hoy), [estado, hoy]);
  const [mes, setMes] = useState<Mes>(mesActual);

  const vistas = useMemo(() => vistaCilindros(estado, hoy), [estado, hoy]);
  const conteo = useMemo(() => conteoDeHoy(vistas), [vistas]);
  const stock = useMemo(() => stockPorGasYPeso(vistas), [vistas]);
  const viene = useMemo(() => empiezanACobrar(estado, hoy), [estado, hoy]);
  const movimiento = useMemo(() => movimientoDelMes(estado, mes), [estado, mes]);

  // La plata: todo `null` si quien mira no puede ver tarifas.
  const plata = useMemo(() => {
    if (!puedeVerPlata) return null;
    const resumen = resumenDelMes(estado, mes, hoy);
    const proyeccion = proyeccionDelMes(estado, mes, hoy);
    const anteriorMes = mesAnterior(mes);
    const anteriorTotal = resumenDelMes(estado, anteriorMes, hoy)?.total ?? null;
    // Se compara lo que daría el mes entero, no lo que va: si no, todo mes en
    // curso parecería peor que el anterior.
    const base = proyeccion ?? resumen?.total ?? null;
    return {
      resumen,
      proyeccion,
      anterior: anteriorTotal === null ? null : { mes: anteriorMes, total: anteriorTotal },
      variacion: base === null || anteriorTotal === null ? null : variacion(base, anteriorTotal),
      porDia: cargoPorDia(estado, hoy),
      seisMeses: devengadoPorMes(estado, ultimosMeses(mesActual, 6), hoy),
      proyeccionActual: proyeccionDelMes(estado, mesActual, hoy),
    };
  }, [puedeVerPlata, estado, mes, hoy, mesActual]);

  // El gráfico también elige mes, y puede elegir uno anterior al primer movimiento.
  const elegirMes = (m: Mes) => setMes(m);
  const opcionesDeMes = meses.includes(mes) ? meses : [...meses, mes].sort().reverse();

  return (
    <>
      <Encabezado titulo="Panel" bajada={`Hoy, ${formatearFecha(hoy)}`} />

      {plata !== null && (
        <TarjetaPlata
          mes={mes}
          meses={opcionesDeMes}
          alElegirMes={elegirMes}
          esMesActual={mes === mesActual}
          total={plata.resumen?.total ?? null}
          proyeccion={plata.proyeccion}
          anterior={plata.anterior}
          variacion={plata.variacion}
          porDia={plata.porDia}
        />
      )}

      <TarjetasHoy conteo={conteo} alVer={alVerCilindros} />
      <LoQueViene cantidad={viene.cantidad} porDia={puedeVerPlata ? viene.porDia : null} alVer={alVerCilindros} />
      <StockPorGas filas={stock} alVer={alVerCilindros} />

      {plata?.seisMeses != null && (
        <GraficoMeses
          totales={plata.seisMeses}
          mesActual={mesActual}
          proyeccion={plata.proyeccionActual}
          elegido={mes}
          alElegir={elegirMes}
        />
      )}

      <MovimientoDelMes
        mes={mes}
        movimiento={movimiento}
        selector={
          plata === null ? <SelectorMes mes={mes} meses={opcionesDeMes} alElegir={elegirMes} /> : undefined
        }
      />

      {plata !== null && <DetalleDelMes mes={mes} resumen={plata.resumen} />}

      <div className="h-6" />
    </>
  );
}

/** La planilla de cobro del mes, por cliente, con el CSV. Es la de siempre. */
function DetalleDelMes({ mes, resumen }: { mes: Mes; resumen: ResumenMensual | null }) {
  return (
    <section className="mt-6">
      <h2 className="mx-4 mb-2 text-xs font-bold tracking-wider text-tinta-2 uppercase">
        Por cliente, {nombreDelMes(mes)}
      </h2>

      {resumen === null ? (
        <p className="mx-4 text-sm text-tinta-2">
          A algún cilindro con cargo en {nombreDelMes(mes)} le falta la tarifa, así que el detalle no se puede
          calcular.
        </p>
      ) : resumen.filas.length === 0 ? (
        <p className="mx-4 text-sm text-tinta-2">En {nombreDelMes(mes)} ningún cilindro generó cargo.</p>
      ) : (
        <>
          <ul className="divide-y divide-linea border-y border-linea bg-white">
            {resumen.filas.map((fila) => (
              <li key={fila.cliente.id} className="px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-base font-semibold">{fila.cliente.nombre}</span>
                  <span className="shrink-0 text-base font-semibold tabular-nums text-cargo">
                    {formatearPesos(fila.total)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-tinta-2">
                  {fila.cilindros === 1 ? '1 cilindro' : `${fila.cilindros} cilindros`} · {fila.diasFacturables} días
                  facturables
                </p>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between gap-4 border-b border-linea bg-white px-4 py-4">
            <span className="text-base font-semibold">Total del mes</span>
            <span className="text-xl font-bold tabular-nums text-cargo">{formatearPesos(resumen.total)}</span>
          </div>
        </>
      )}

      <div className="px-4 pt-4">
        <button
          type="button"
          disabled={resumen === null}
          onClick={() => {
            if (resumen !== null) descargarTexto(nombreArchivoCSV(mes), csvDelResumen(resumen));
          }}
          className="h-13 w-full rounded-[15px] border-2 border-tinta py-3 text-base font-semibold active:bg-fondo disabled:opacity-40"
        >
          Exportar a CSV
        </button>
      </div>
    </section>
  );
}
