import { useState } from 'react';

import { cambiarClave } from '../../datos/repositorio';
import { Encabezado } from '../Encabezado';
import { claseBotonPrincipal } from '../Formulario';
import { FormularioNuevaClave } from './PantallaNuevaClave';

/** Ajustes → Cambiar la contraseña. Para cualquier usuario. */
export function PantallaCambiarClave({ alVolver }: { alVolver(): void }) {
  const [hecho, setHecho] = useState(false);

  return (
    <>
      <Encabezado titulo="Cambiar la contraseña" alVolver={alVolver} />

      <div className="px-4 pt-4 pb-6">
        {hecho ? (
          <div className="space-y-4">
            <p role="status" className="text-base font-semibold text-gracia">
              Listo. La próxima vez que entres, usá la contraseña nueva.
            </p>
            <button type="button" onClick={alVolver} className={claseBotonPrincipal}>
              Volver a Ajustes
            </button>
          </div>
        ) : (
          <FormularioNuevaClave
            conActual
            textoBoton="Cambiar la contraseña"
            alGuardar={async (nueva, actual) => {
              await cambiarClave(actual, nueva);
              setHecho(true);
            }}
          />
        )}
      </div>
    </>
  );
}
