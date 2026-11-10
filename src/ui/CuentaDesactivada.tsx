import { useSesion } from '../estado/ProveedorEstado';

/**
 * Una cuenta nueva nace desactivada, y Joaquín puede desactivar a cualquiera.
 * En los dos casos la base no entrega nada: mejor decirlo que mostrar la app vacía.
 */
export function CuentaDesactivada({ nombre }: { nombre: string | null }) {
  const { cerrarSesion, reintentar } = useSesion();

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-6 px-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {nombre === null ? 'Tu cuenta no está activa' : `${nombre}, tu cuenta no está activa`}
        </h1>
        <p className="mt-2 text-slate-500">
          Todavía no tenés acceso a los datos. Pedile al administrador que active tu usuario y
          volvé a probar.
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={reintentar}
          className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700"
        >
          Probar de nuevo
        </button>
        <button
          type="button"
          onClick={() => void cerrarSesion()}
          className="h-14 w-full rounded-xl border border-slate-300 text-base font-semibold active:bg-slate-100"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
