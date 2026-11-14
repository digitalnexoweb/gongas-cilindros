import { useMemo, useState } from 'react';

import { alDeshacer, cilindroPorId, sePuedeDeshacer } from '../../dominio/consultas';
import { useEstado } from '../../estado/ProveedorEstado';
import { ErrorDeFormulario, claseBotonPrincipal, claseBotonSecundario } from '../Formulario';

/**
 * Deshacer movimientos confirmados por error: un lote entero, parte de él o un
 * cilindro suelto. La usan el comprobante, "Últimos lotes" y la ficha del
 * cliente.
 *
 * Arranca con todo lo que se puede deshacer marcado; lo que no se puede
 * aparece igual, sin casilla y con el motivo, para que se entienda por qué.
 * Pide confirmar antes de tocar la base.
 *
 * Lo que ya se deshizo se puede borrar del todo desde acá: no tiene ningún
 * efecto, y así no queda ensuciando "Últimos lotes" ni el historial.
 */
export function DeshacerLote({
  titulo,
  movimientos,
  alCerrar,
  alTerminar,
}: {
  /** "Entrega a ANCAP · Hoy 14:20", "729026"… */
  titulo: string;
  /** Los movimientos que se ofrecen, en el orden en que se grabaron. */
  movimientos: string[];
  alCerrar(): void;
  /** Después de deshacer, antes de cerrar. */
  alTerminar?(): void;
}) {
  const { estado, deshacerMovimientos, borrarDeshechos } = useEstado();

  const filas = useMemo(
    () =>
      movimientos.map((id) => {
        const movimiento = estado.movimientos.find((m) => m.id === id);
        const cilindro = movimiento === undefined ? null : cilindroPorId(estado, movimiento.cilindroId);
        const puede = sePuedeDeshacer(estado, id);
        return {
          id,
          serie: cilindro?.serie ?? '—',
          puede: puede === true,
          detalle: puede === true ? alDeshacer(estado, id) : puede,
        };
      }),
    [estado, movimientos],
  );

  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(filas.filter((f) => f.puede).map((f) => f.id)),
  );
  /** Qué se está por confirmar: deshacer lo marcado o borrar lo ya deshecho. */
  const [confirmando, setConfirmando] = useState<'deshacer' | 'borrar' | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegidos = filas.filter((f) => f.puede && marcados.has(f.id));
  const n = elegidos.length;
  const cuantos = n === 1 ? '1 cilindro' : `${n} cilindros`;

  const deshechos = movimientos.filter((id) => estado.movimientos.find((m) => m.id === id)?.deshecho !== undefined);
  const todoDeshecho = deshechos.length > 0 && deshechos.length === movimientos.length;

  function alternar(id: string) {
    setConfirmando(null);
    setMarcados((antes) => {
      const despues = new Set(antes);
      if (despues.has(id)) despues.delete(id);
      else despues.add(id);
      return despues;
    });
  }

  function deshacer() {
    if (deshaciendo || n === 0) return;

    setDeshaciendo(true);
    setError(null);
    deshacerMovimientos(elegidos.map((f) => f.id))
      .then(() => {
        alTerminar?.();
        alCerrar();
      })
      .catch((falla: unknown) => {
        setError(falla instanceof Error ? falla.message : 'No se pudo deshacer.');
        setDeshaciendo(false);
        setConfirmando(null);
      });
  }

  function borrar() {
    if (deshaciendo || deshechos.length === 0) return;

    setDeshaciendo(true);
    setError(null);
    borrarDeshechos(deshechos)
      .then(() => alCerrar())
      .catch((falla: unknown) => {
        setError(falla instanceof Error ? falla.message : 'No se pudo borrar.');
        setDeshaciendo(false);
        setConfirmando(null);
      });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-tinta/50" onClick={alCerrar}>
      <div
        role="dialog"
        aria-label={`Deshacer · ${titulo}`}
        className="max-h-[90dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(32px+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-titulo text-xl font-bold">{todoDeshecho ? 'Lote deshecho' : 'Deshacer'}</h2>
          <p className="mt-1 text-sm text-tinta-2">{titulo}</p>
        </div>

        <ul className="divide-y divide-linea rounded-2xl border border-linea">
          {filas.map((f) => (
            <li key={f.id}>
              <label
                className={`flex min-h-[56px] items-center gap-3 px-4 py-2.5 ${f.puede ? 'active:bg-fondo' : 'opacity-70'}`}
              >
                {f.puede ? (
                  <input
                    type="checkbox"
                    checked={marcados.has(f.id)}
                    onChange={() => alternar(f.id)}
                    className="size-6 shrink-0 accent-marca"
                  />
                ) : (
                  <span className="size-6 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[17px] font-bold">{f.serie}</span>
                  <span className="block text-sm text-tinta-2">{f.detalle}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="text-sm text-tinta-2">
          {todoDeshecho
            ? 'Este lote ya está deshecho: no tiene ningún efecto. Se puede borrar para que no quede en la lista.'
            : 'Al deshacer, el movimiento queda en el historial como deshecho, con tu nombre.'}
        </p>

        <ErrorDeFormulario mensaje={error} />

        {confirmando !== null ? (
          <div className="space-y-2 rounded-2xl border border-cargo-borde bg-cargo-suave p-4">
            <p className="text-base font-semibold text-cargo">
              {confirmando === 'deshacer'
                ? `¿Deshacer ${cuantos}?`
                : todoDeshecho
                  ? '¿Borrar este lote para siempre?'
                  : `¿Borrar ${deshechos.length === 1 ? 'el deshecho' : `los ${deshechos.length} deshechos`} para siempre?`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmando(null)} className={claseBotonSecundario}>
                No
              </button>
              <button
                type="button"
                onClick={confirmando === 'deshacer' ? deshacer : borrar}
                disabled={deshaciendo}
                className="h-[50px] w-full rounded-[15px] bg-cargo text-base font-bold text-white disabled:opacity-60"
              >
                {deshaciendo
                  ? confirmando === 'deshacer' ? 'Deshaciendo…' : 'Borrando…'
                  : confirmando === 'deshacer' ? 'Sí, deshacer' : 'Sí, borrar'}
              </button>
            </div>
          </div>
        ) : todoDeshecho ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={alCerrar} className={claseBotonSecundario}>
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando('borrar')}
              className="h-[50px] w-full rounded-[15px] bg-cargo text-base font-bold text-white"
            >
              Borrar este lote
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={alCerrar} className={claseBotonSecundario}>
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => setConfirmando('deshacer')}
                disabled={n === 0}
                className={claseBotonPrincipal}
              >
                {n === 0 ? 'Nada para deshacer' : `Deshacer ${cuantos}`}
              </button>
            </div>
            {deshechos.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmando('borrar')}
                className="h-11 w-full text-base font-semibold text-cargo active:bg-cargo-suave"
              >
                {deshechos.length === 1 ? 'Borrar el deshecho' : `Borrar los ${deshechos.length} deshechos`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
