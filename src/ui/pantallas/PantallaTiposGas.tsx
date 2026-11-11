import { useState } from 'react';

import { useEstado } from '../../estado/ProveedorEstado';
import { Encabezado } from '../Encabezado';
import { Campo, ErrorDeFormulario, claseBotonPrincipal } from '../Formulario';

/**
 * Los gases que se pueden elegir al entregar. Solo el administrador.
 *
 * Un gas no se borra: si ya salió algún cilindro con él, el historial lo
 * nombra. Se deja de ofrecer, y se puede volver a ofrecer cuando haga falta.
 */
export function PantallaTiposGas({ alVolver }: { alVolver(): void }) {
  const { estado, agregarTipoGas, cambiarTipoGas } = useEstado();
  const tipos = estado.tiposGas ?? [];

  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repetido = tipos.some((t) => t.nombre.toLowerCase() === nuevo.trim().toLowerCase());
  const listo = nuevo.trim() !== '' && !repetido && !guardando;

  function alternar(nombre: string, activo: boolean) {
    setError(null);
    cambiarTipoGas(nombre, activo).catch((falla: unknown) => {
      setError(falla instanceof Error ? falla.message : 'No se pudo cambiar.');
    });
  }

  return (
    <>
      <Encabezado titulo="Tipos de gas" bajada="Los que se eligen al entregar" alVolver={alVolver} />

      <div className="space-y-5 px-4 pt-4 pb-6">
        <ul className="divide-y divide-linea rounded-2xl border border-linea bg-white">
          {tipos.map((t) => (
            <li key={t.nombre} className="flex items-center gap-3 py-2 pr-2 pl-4">
              <span className={`min-w-0 flex-1 text-base ${t.activo ? 'font-semibold' : 'text-tinta-3 line-through'}`}>
                {t.nombre}
              </span>
              <button
                type="button"
                onClick={() => alternar(t.nombre, !t.activo)}
                className={`h-11 shrink-0 rounded-[12px] border-[1.5px] px-3 text-sm font-semibold ${
                  t.activo ? 'border-linea-fuerte text-tinta-2' : 'border-tinta bg-tinta text-white'
                }`}
              >
                {t.activo ? 'Dejar de ofrecer' : 'Volver a ofrecer'}
              </button>
            </li>
          ))}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!listo) return;

            setGuardando(true);
            setError(null);
            const orden = Math.max(0, ...tipos.map((t) => t.orden)) + 10;
            agregarTipoGas(nuevo.trim(), orden)
              .then(() => setNuevo(''))
              .catch((falla: unknown) => {
                setError(falla instanceof Error ? falla.message : 'No se pudo agregar.');
              })
              .finally(() => setGuardando(false));
          }}
          className="space-y-3 rounded-2xl border border-linea bg-white p-4"
        >
          <Campo
            etiqueta="Agregar un gas"
            valor={nuevo}
            alCambiar={setNuevo}
            ayuda={repetido ? 'Ese ya está en la lista.' : 'Aparece al final de la lista al entregar.'}
          />
          <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
            {guardando ? 'Agregando…' : 'Agregar'}
          </button>
        </form>

        <ErrorDeFormulario mensaje={error} />

        <p className="text-sm text-tinta-2">
          Un gas no se borra: si ya salió algún cilindro con él, el historial lo sigue nombrando. Se
          deja de ofrecer, y vuelve cuando haga falta.
        </p>
      </div>
    </>
  );
}
