import type { RefObject } from 'react';

import type { EstadoEscaner } from '../../escaneo/useEscaner';

/** La cámara, con un cartel claro por cada cosa que puede salir mal. */
export function Visor({
  estado,
  videoRef,
  mensaje,
  reintentar,
  alCargarAMano,
}: {
  estado: EstadoEscaner;
  videoRef: RefObject<HTMLVideoElement | null>;
  mensaje: string | null;
  reintentar(): void;
  alCargarAMano(): void;
}) {
  const andando = estado === 'escaneando';

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-900">
      <video
        ref={videoRef}
        playsInline
        muted
        className={`size-full object-cover ${andando ? '' : 'invisible'}`}
      />

      {andando && (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-44 rounded-2xl border-4 border-white/85" />
          </div>
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-white/90">
            Apuntá al QR del cilindro
          </p>
        </>
      )}

      {estado === 'pidiendo_permiso' && (
        <Cartel titulo="Abriendo la cámara…" detalle="Hay que aceptar el permiso." />
      )}

      {(estado === 'sin_permiso' || estado === 'sin_camara' || estado === 'error') && (
        <Cartel
          titulo={estado === 'sin_permiso' ? 'Sin permiso de cámara' : 'No se pudo usar la cámara'}
          detalle={mensaje}
        >
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={reintentar}
              className="h-11 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={alCargarAMano}
              className="h-11 rounded-xl border border-white/60 px-4 text-sm font-semibold text-white"
            >
              Cargar a mano
            </button>
          </div>
        </Cartel>
      )}
    </div>
  );
}

function Cartel({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-base font-semibold text-white">{titulo}</p>
      {detalle != null && <p className="mt-1 text-sm text-white/70">{detalle}</p>}
      {children}
    </div>
  );
}
