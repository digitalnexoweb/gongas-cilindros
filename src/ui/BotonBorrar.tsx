import { useState } from 'react';

import { ErrorDeFormulario, claseBotonSecundario } from './Formulario';

/**
 * Al pie de una edición: borrar para siempre, con confirmación, o el motivo
 * por el que no se puede. Lo usan la edición de clientes y la de cilindros.
 */
export function BotonBorrar({
  texto,
  pregunta,
  motivo,
  alBorrar,
}: {
  /** "Borrar cliente", "Borrar cilindro". */
  texto: string;
  /** "¿Borrar a ANCAP para siempre?" */
  pregunta: string;
  /** Por qué no se puede borrar, o `null` si se puede. */
  motivo: string | null;
  alBorrar(): Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirmar() {
    if (borrando) return;
    setBorrando(true);
    setError(null);
    alBorrar().catch((falla: unknown) => {
      setError(falla instanceof Error ? falla.message : 'No se pudo borrar.');
      setBorrando(false);
      setConfirmando(false);
    });
  }

  return (
    <div className="mt-4 border-t border-linea pt-5">
      {confirmando ? (
        <div className="space-y-2 rounded-2xl border border-cargo-borde bg-cargo-suave p-4">
          <p className="text-base font-semibold text-cargo">{pregunta}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmando(false)} className={claseBotonSecundario}>
              No
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={borrando}
              className="h-[50px] w-full rounded-[15px] bg-cargo text-base font-bold text-white disabled:opacity-60"
            >
              {borrando ? 'Borrando…' : 'Sí, borrar'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={motivo !== null}
          className="h-[50px] w-full rounded-[15px] border-[1.5px] border-cargo-borde bg-white text-base font-semibold text-cargo active:bg-cargo-suave disabled:border-linea disabled:text-tinta-3"
        >
          {texto}
        </button>
      )}

      {motivo !== null && <p className="mt-2 text-sm text-tinta-2">{motivo}</p>}
      <ErrorDeFormulario mensaje={error} />
    </div>
  );
}
