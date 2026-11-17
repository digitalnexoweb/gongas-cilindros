import { formatearPesos } from '../../dominio/arriendo';
import { nombreDelMes, type Mes } from '../../dominio/resumen';
import { SelectorMes } from './SelectorMes';

/**
 * La plata del mes, arriba de todo: DISENO.md dice que la plata va arriba.
 * En el mes en curso muestra lo que va y lo que daría si nada cambia; en un
 * mes cerrado, el total. Las dos cosas comparadas contra el mes anterior.
 */
export function TarjetaPlata({
  mes,
  meses,
  alElegirMes,
  esMesActual,
  total,
  proyeccion,
  anterior,
  variacion,
  porDia,
}: {
  mes: Mes;
  meses: Mes[];
  alElegirMes(mes: Mes): void;
  esMesActual: boolean;
  /** Lo devengado en el mes. `null` si falta alguna tarifa. */
  total: number | null;
  proyeccion: number | null;
  /** El mes anterior y lo que dio, para la comparación. */
  anterior: { mes: Mes; total: number } | null;
  /** En por ciento, contra el anterior. `null` si no hay base para comparar. */
  variacion: number | null;
  /** Lo que corre por día hoy. Solo en el mes en curso. */
  porDia: number | null;
}) {
  return (
    <section className="mx-4 mt-4 rounded-2xl bg-marca px-5 py-5 text-white">
      <SelectorMes mes={mes} meses={meses} alElegir={alElegirMes} oscuro />

      {total === null ? (
        <p className="mt-4 text-sm text-marca-clara">
          A algún cilindro con cargo en {nombreDelMes(mes)} le falta la tarifa, así que el total no se puede
          calcular. Se pone en Ajustes → Tarifas.
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs font-semibold tracking-wider text-marca-clara uppercase">
            {esMesActual ? 'Va devengado' : 'Total del mes'}
          </p>
          <p className="mt-1 font-titulo text-[42px] leading-none font-bold tabular-nums">{formatearPesos(total)}</p>

          {esMesActual && proyeccion !== null && (
            <p className="mt-3 text-base">
              Si nada cambia, cierra en <span className="font-bold tabular-nums">{formatearPesos(proyeccion)}</span>
            </p>
          )}

          {anterior !== null && (
            <p className="mt-2 text-sm text-marca-clara">
              {variacion === null ? (
                <>
                  {nombreDelMes(anterior.mes)}: {formatearPesos(anterior.total)}
                </>
              ) : (
                <>
                  <span className="font-bold text-white">
                    {variacion > 0 ? '▲ +' : variacion < 0 ? '▼ −' : '= '}
                    {Math.abs(variacion)} %
                  </span>{' '}
                  {esMesActual ? 'si cierra así, ' : ''}contra {nombreDelMes(anterior.mes)} (
                  {formatearPesos(anterior.total)})
                </>
              )}
            </p>
          )}

          {esMesActual && porDia !== null && (
            <p className="mt-4 border-t border-white/15 pt-3 text-sm text-marca-clara">
              {porDia > 0 ? (
                <>
                  Hoy corren <span className="font-bold text-white tabular-nums">{formatearPesos(porDia)}</span> por
                  día
                </>
              ) : (
                'Hoy no corre ningún cargo'
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
