import { formatearPesos } from '../../dominio/arriendo';
import { coloresEstado, etiquetas, IconoEstado, type EstadoVisible } from '../ChipEstado';
import { Reloj } from '../iconos';
import type { FiltroInicial } from '../pantallas/filtroCilindros';
import type { ConteoDeHoy } from './panel';

const ORDEN: EstadoVisible[] = ['stock', 'en_gracia', 'por_vencer', 'generando_cargo'];

/** Cuántos cilindros hay en cada estado. Cada tarjeta abre Cilindros con ese filtro. */
export function TarjetasHoy({
  conteo,
  alVer,
}: {
  conteo: ConteoDeHoy;
  alVer(filtro: FiltroInicial): void;
}) {
  return (
    <section className="mx-4 mt-6">
      <h2 className="mb-1 text-xs font-bold tracking-wider text-tinta-2 uppercase">Hoy</h2>
      <p className="mb-3 text-sm text-tinta-2">
        {conteo.total === 1 ? '1 cilindro' : `${conteo.total} cilindros`} · {conteo.enClientes} en clientes ·{' '}
        {conteo.stock} en stock
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        {ORDEN.map((estado) => (
          <button
            key={estado}
            type="button"
            onClick={() => alVer({ estado })}
            className={`flex min-h-[92px] flex-col justify-between rounded-2xl border p-3.5 text-left active:opacity-80 ${coloresEstado[estado]}`}
          >
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <IconoEstado estado={estado} className="size-4" />
              {etiquetas[estado]}
            </span>
            <span className="font-titulo text-[34px] leading-none font-bold tabular-nums">{conteo[estado]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Los que empiezan a generar cargo en los próximos 7 días. Son justo los que
 * están por vencer, así que abre ese filtro. Si no hay ninguno, no aparece.
 */
export function LoQueViene({
  cantidad,
  porDia,
  alVer,
}: {
  cantidad: number;
  /** `null` si quien mira no ve plata. */
  porDia: number | null;
  alVer(filtro: FiltroInicial): void;
}) {
  if (cantidad === 0) return null;

  return (
    <section className="mx-4 mt-3">
      <button
        type="button"
        onClick={() => alVer({ estado: 'por_vencer' })}
        className="flex w-full items-center gap-3 rounded-2xl border border-vencer-borde bg-vencer-suave px-4 py-3.5 text-left text-vencer active:opacity-80"
      >
        <Reloj className="size-6 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">
            En los próximos 7 días, {cantidad === 1 ? '1 cilindro empieza' : `${cantidad} cilindros empiezan`} a
            generar cargo
          </span>
          {porDia !== null && (
            <span className="mt-0.5 block text-sm">
              Suman <span className="font-bold tabular-nums">+{formatearPesos(porDia)}</span> por día
            </span>
          )}
        </span>
      </button>
    </section>
  );
}
