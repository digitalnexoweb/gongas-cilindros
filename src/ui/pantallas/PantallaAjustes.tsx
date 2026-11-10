import { useEstado, useSesion } from '../../estado/ProveedorEstado';
import { Bloque, Dato } from '../Dato';
import { Encabezado } from '../Encabezado';

/**
 * La sección 6.6 pone Ajustes fuera de la navegación, así que se entra por el
 * engranaje de la pantalla de Escanear. Acá están la cuenta y las etiquetas.
 *
 * "Reiniciar demo" y "Cambiar operador" se fueron con los datos de ejemplo: con
 * datos reales, el operador es quien inició sesión y nada se reinicia.
 */
export function PantallaAjustes({
  alVolver,
  alAbrirEtiquetas,
}: {
  alVolver(): void;
  alAbrirEtiquetas(): void;
}) {
  const { perfil } = useEstado();
  const { cerrarSesion } = useSesion();

  return (
    <>
      <Encabezado titulo="Ajustes" alVolver={alVolver} />

      <div className="pb-6">
        <Bloque titulo="Tu cuenta">
          <Dato etiqueta="Conectado como">{perfil.nombre}</Dato>
          <Dato etiqueta="Rol">{perfil.rol === 'admin' ? 'Administrador' : 'Empleado'}</Dato>

          <div className="p-4">
            <button
              type="button"
              onClick={() => void cerrarSesion()}
              className="h-12 w-full rounded-xl border border-slate-300 text-base font-semibold active:bg-slate-100"
            >
              Cerrar sesión
            </button>
          </div>
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
      </div>
    </>
  );
}
