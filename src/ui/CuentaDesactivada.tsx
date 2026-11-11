import { useSesion } from '../estado/ProveedorEstado';

/**
 * Una cuenta nueva nace desactivada, y Joaquín puede desactivar a cualquiera.
 * En los dos casos la base no entrega nada: mejor decirlo que mostrar la app vacía.
 *
 * Cuando el administrador la activa, la base avisa en vivo y la app entra sola:
 * "Probar de nuevo" queda por si ese aviso no llega.
 */
export function CuentaDesactivada({ nombre }: { nombre: string | null }) {
  const { cerrarSesion, reintentar } = useSesion();

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-6 bg-white px-6 pb-16">
      <img src="/logo-gongas.png" alt="GONGAS" className="h-11 w-auto self-start" />

      <div>
        <h1 className="font-titulo text-[26px] leading-tight font-bold tracking-tight">
          {nombre === null ? 'Tu cuenta no está activa' : `${nombre}, tu cuenta no está activa`}
        </h1>
        <p className="mt-2 text-base text-tinta-2">
          Todavía no tenés acceso a los datos. Pedile al administrador que active tu usuario: cuando
          lo haga, esta pantalla cambia sola.
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={reintentar}
          className="h-[58px] w-full rounded-[15px] bg-tinta font-titulo text-[17px] font-bold text-white active:bg-marca-tinta"
        >
          Probar de nuevo
        </button>
        <button
          type="button"
          onClick={() => void cerrarSesion()}
          className="h-[50px] w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white text-base font-semibold active:bg-fondo"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
