import { useState } from 'react';

import { almacenLocalStorage, reiniciarDemo } from '../../dominio/storage';
import { useEstado } from '../../estado/ProveedorEstado';
import { Bloque, Dato } from '../Dato';
import { Encabezado } from '../Encabezado';

/**
 * La sección 6.6 pone Ajustes fuera de la navegación, así que se entra por el
 * engranaje de la pantalla de Escanear. Acá viven las etiquetas y el botón
 * Reiniciar demo de la sección 7.
 */
export function PantallaAjustes({
  alVolver,
  alAbrirEtiquetas,
}: {
  alVolver(): void;
  alAbrirEtiquetas(): void;
}) {
  const { estado, hoy, actualizar } = useEstado();

  const [cambiandoOperador, setCambiandoOperador] = useState(false);
  const [nombre, setNombre] = useState(estado.operador);
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false);

  return (
    <>
      <Encabezado titulo="Ajustes" alVolver={alVolver} />

      <div className="pb-6">
        <Bloque titulo="Operador">
          {cambiandoOperador ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (nombre.trim() === '') return;
                actualizar({ ...estado, operador: nombre.trim() });
                setCambiandoOperador(false);
              }}
              className="flex gap-2 p-4"
            >
              <input
                type="text"
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="h-12 shrink-0 rounded-xl bg-slate-900 px-4 text-base font-semibold text-white active:bg-slate-700"
              >
                Guardar
              </button>
            </form>
          ) : (
            <Dato etiqueta="Está operando">
              <button
                type="button"
                onClick={() => {
                  setNombre(estado.operador);
                  setCambiandoOperador(true);
                }}
                className="font-semibold underline underline-offset-4"
              >
                {estado.operador} · Cambiar
              </button>
            </Dato>
          )}
        </Bloque>

        <Bloque titulo="Etiquetas">
          <button
            type="button"
            onClick={alAbrirEtiquetas}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:bg-slate-50"
          >
            <span>
              <span className="block text-base font-semibold">Etiquetas QR</span>
              <span className="mt-0.5 block text-sm text-slate-500">
                Grilla imprimible en A4 para recortar y pegar
              </span>
            </span>

            <svg
              className="size-5 shrink-0 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </Bloque>

        <Bloque titulo="Datos de demo">
          <div className="p-4">
            {confirmandoReinicio ? (
              <>
                <p className="text-sm text-slate-600">
                  Se borra todo lo que hayas escaneado y vuelven los datos originales. No se puede
                  deshacer.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmandoReinicio(false)}
                    className="h-12 rounded-xl border border-slate-300 text-base font-semibold active:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Se conserva el operador: reiniciar la demo no es cerrar sesión.
                      const limpio = reiniciarDemo(almacenLocalStorage, hoy);
                      actualizar({ ...limpio, operador: estado.operador });
                      setConfirmandoReinicio(false);
                    }}
                    className="h-12 rounded-xl bg-cargo text-base font-semibold text-white"
                  >
                    Reiniciar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  Vuelve a los 7 cilindros y los 3 clientes de la sección 7, con las fechas
                  recalculadas desde hoy.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmandoReinicio(true)}
                  className="mt-3 h-12 w-full rounded-xl border border-cargo text-base font-semibold text-cargo active:bg-cargo-suave"
                >
                  Reiniciar demo
                </button>
              </>
            )}
          </div>
        </Bloque>
      </div>
    </>
  );
}
