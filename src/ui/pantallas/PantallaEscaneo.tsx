import { useCallback, useMemo, useRef, useState } from 'react';

import type { LoteConfirmado } from '../../datos/repositorio';
import { cilindroPorSerie, ubicacionDe } from '../../dominio/consultas';
import { serieDesdeQR, serieTipeada } from '../../dominio/qr';
import type { EstadoApp, TipoMovimiento } from '../../dominio/tipos';
import { senalDeLectura } from '../../escaneo/senales';
import { useEscaner } from '../../escaneo/useEscaner';
import { useEstado } from '../../estado/ProveedorEstado';
import { Encabezado } from '../Encabezado';
import { AltaCilindro } from '../escaneo/AltaCilindro';
import { Comprobante } from '../escaneo/Comprobante';
import { ElegirCliente } from '../escaneo/ElegirCliente';
import { Visor } from '../escaneo/Visor';

type Paso =
  | { nombre: 'modo' }
  | { nombre: 'cliente' }
  | { nombre: 'escaneando'; tipo: TipoMovimiento; clienteId: string | null }
  | {
      nombre: 'comprobante';
      lote: LoteConfirmado;
      tipo: TipoMovimiento;
      clienteId: string | null;
    };

type ItemLote = {
  serie: string;
  /** `false` si la serie no está en el sistema: 6.1 ofrece darla de alta. */
  conocido: boolean;
  /** El ámbar de 6.1. Avisa, no bloquea. */
  aviso: string | null;
};

/** Las validaciones de 6.1, calculadas en vivo mientras se escanea. */
function evaluar(
  estado: EstadoApp,
  serie: string,
  tipo: TipoMovimiento,
  clienteId: string | null,
): ItemLote {
  const cilindro = cilindroPorSerie(estado, serie);
  if (cilindro === null) return { serie, conocido: false, aviso: 'No está en el sistema' };

  const ubicacion = ubicacionDe(estado, cilindro.id);

  if (tipo === 'entrega') {
    if (ubicacion.lugar !== 'cliente') return { serie, conocido: true, aviso: null };

    return ubicacion.cliente.id === clienteId
      ? { serie, conocido: true, aviso: 'Ya figura en este cliente' }
      : { serie, conocido: true, aviso: `Figura en ${ubicacion.cliente.nombre}` };
  }

  return ubicacion.lugar === 'stock'
    ? { serie, conocido: true, aviso: 'Ya figura en stock' }
    : { serie, conocido: true, aviso: null };
}

/**
 * La sección 6.1 completa. Las reglas no están acá: las pone `confirmar_lote`,
 * en la base, que es quien graba.
 */
export function PantallaEscaneo({ alAbrirAjustes }: { alAbrirAjustes(): void }) {
  const { estado, perfil, confirmarLote } = useEstado();

  const [paso, setPaso] = useState<Paso>({ nombre: 'modo' });
  const [series, setSeries] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aDarDeAlta, setADarDeAlta] = useState<string | null>(null);
  const [serieManual, setSerieManual] = useState('');

  // Grabar ahora va a un servidor: tarda y puede fallar.
  const [grabando, setGrabando] = useState(false);
  const [errorAlGrabar, setErrorAlGrabar] = useState<string | null>(null);

  // Para no repetir el mismo aviso treinta veces por segundo en escaneo continuo.
  const seriesRef = useRef<string[]>([]);
  seriesRef.current = series;
  const ultimoAviso = useRef<{ serie: string; ts: number } | null>(null);

  const items = useMemo(() => {
    if (paso.nombre !== 'escaneando') return [];
    return series.map((serie) => evaluar(estado, serie, paso.tipo, paso.clienteId));
  }, [series, estado, paso]);

  const agregarSerie = useCallback((serie: string) => {
    if (seriesRef.current.includes(serie)) {
      const ahora = Date.now();
      const previo = ultimoAviso.current;

      if (previo === null || previo.serie !== serie || ahora - previo.ts > 2000) {
        ultimoAviso.current = { serie, ts: ahora };
        setAviso(`${serie} ya estaba en el lote`);
      }
      return;
    }

    senalDeLectura();
    setAviso(null);
    setSeries((actuales) => (actuales.includes(serie) ? actuales : [...actuales, serie]));
  }, []);

  const alLeer = useCallback(
    (texto: string) => {
      const serie = serieDesdeQR(texto);
      // Un QR que no empieza con GONGAS: se ignora en silencio, como dice 6.1.
      if (serie === null) return;
      agregarSerie(serie);
    },
    [agregarSerie],
  );

  const escaner = useEscaner({ activo: paso.nombre === 'escaneando', alLeer });

  function empezar(tipo: TipoMovimiento) {
    setSeries([]);
    setAviso(null);
    setSerieManual('');
    setErrorAlGrabar(null);
    setPaso(tipo === 'entrega' ? { nombre: 'cliente' } : { nombre: 'escaneando', tipo, clienteId: null });
  }

  async function confirmar() {
    if (paso.nombre !== 'escaneando' || grabando) return;
    const { tipo, clienteId } = paso;

    setGrabando(true);
    setErrorAlGrabar(null);

    try {
      const lote = await confirmarLote(tipo, series, clienteId);
      setPaso({ nombre: 'comprobante', lote, tipo, clienteId });
    } catch (error) {
      // El lote queda en pantalla tal cual: no se pierde lo escaneado.
      setErrorAlGrabar(error instanceof Error ? error.message : 'No se pudo grabar el lote.');
    } finally {
      setGrabando(false);
    }
  }

  if (paso.nombre === 'modo') {
    return (
      <>
        <Encabezado
          titulo="Escanear"
          bajada={`Operando: ${perfil.nombre}`}
          accion={
            // La sección 6.6 deja Ajustes fuera de la navegación de cinco ítems,
            // así que se entra por acá, que es donde Joaquín arranca.
            <button
              type="button"
              onClick={alAbrirAjustes}
              aria-label="Ajustes"
              className="flex size-11 items-center justify-center rounded-xl text-slate-600 active:bg-slate-200"
            >
              <svg
                className="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </button>
          }
        />

        <div className="space-y-3 px-4 pt-6">
          <button
            type="button"
            onClick={() => empezar('entrega')}
            className="h-28 w-full rounded-2xl bg-slate-900 text-xl font-bold text-white active:bg-slate-700"
          >
            Entregar
          </button>
          <button
            type="button"
            onClick={() => empezar('devolucion')}
            className="h-28 w-full rounded-2xl border-2 border-slate-900 text-xl font-bold active:bg-slate-100"
          >
            Recibir
          </button>
        </div>
      </>
    );
  }

  if (paso.nombre === 'cliente') {
    return (
      <ElegirCliente
        alVolver={() => setPaso({ nombre: 'modo' })}
        alElegir={(clienteId) => setPaso({ nombre: 'escaneando', tipo: 'entrega', clienteId })}
      />
    );
  }

  if (paso.nombre === 'comprobante') {
    return (
      <Comprobante
        lote={paso.lote}
        tipo={paso.tipo}
        cliente={estado.clientes.find((c) => c.id === paso.clienteId) ?? null}
        alTerminar={() => {
          setSeries([]);
          setPaso({ nombre: 'modo' });
        }}
      />
    );
  }

  const cliente = paso.clienteId === null ? null : estado.clientes.find((c) => c.id === paso.clienteId);

  return (
    <>
      <Encabezado
        titulo={paso.tipo === 'entrega' ? 'Entregando' : 'Recibiendo'}
        bajada={cliente === undefined || cliente === null ? 'A stock' : `A ${cliente.nombre}`}
        alVolver={() => setPaso({ nombre: 'modo' })}
      />

      <Visor
        estado={escaner.estado}
        videoRef={escaner.videoRef}
        mensaje={escaner.mensaje}
        reintentar={escaner.reintentar}
        alCargarAMano={() => document.getElementById('serie-manual')?.focus()}
      />

      {aviso !== null && (
        <p className="border-b border-vencer-borde bg-vencer-suave px-4 py-2.5 text-sm text-vencer">
          {aviso}
        </p>
      )}

      <p className="px-4 pt-4 pb-2 text-base font-semibold">
        {items.length === 0
          ? 'Todavía no hay cilindros en este lote'
          : items.length === 1
            ? '1 cilindro en este lote'
            : `${items.length} cilindros en este lote`}
      </p>

      {items.length > 0 && (
        <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
          {items.map((item) => (
            <li key={item.serie} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="font-mono text-base font-semibold">{item.serie}</span>

                {item.aviso !== null && (
                  <span className="mt-0.5 block text-sm text-vencer">{item.aviso}</span>
                )}
              </div>

              {!item.conocido && (
                <button
                  type="button"
                  onClick={() => setADarDeAlta(item.serie)}
                  className="h-10 shrink-0 rounded-lg border border-vencer-borde bg-vencer-suave px-3 text-sm font-semibold text-vencer"
                >
                  Dar de alta
                </button>
              )}

              <button
                type="button"
                onClick={() => setSeries((xs) => xs.filter((s) => s !== item.serie))}
                aria-label={`Sacar ${item.serie} del lote`}
                className="size-10 shrink-0 rounded-lg text-slate-400 active:bg-slate-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* El paracaídas: si la cámara falla delante del cliente, se carga a mano. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (serieManual.trim() === '') return;

          const serie = serieTipeada(serieManual);
          if (serie === null) {
            setAviso('Eso no parece una serie de cilindro');
            return;
          }

          agregarSerie(serie);
          setSerieManual('');
        }}
        className="flex gap-2 px-4 pt-4"
      >
        <input
          id="serie-manual"
          type="text"
          value={serieManual}
          onChange={(e) => setSerieManual(e.target.value)}
          placeholder="Cargar a mano, ej. CIL-00001"
          className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
        />
        <button
          type="submit"
          className="h-12 shrink-0 rounded-xl border border-slate-900 px-4 text-base font-semibold active:bg-slate-100"
        >
          Agregar
        </button>
      </form>

      <div className="px-4 pt-5 pb-4">
        {errorAlGrabar !== null && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-cargo-borde bg-cargo-suave p-3 text-sm text-cargo"
          >
            {errorAlGrabar}
          </p>
        )}

        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={items.length === 0 || grabando}
          className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700 disabled:bg-slate-300"
        >
          {grabando ? 'Grabando…' : errorAlGrabar !== null ? 'Reintentar' : 'Confirmar lote'}
        </button>
      </div>

      {aDarDeAlta !== null && (
        <AltaCilindro serie={aDarDeAlta} alCerrar={() => setADarDeAlta(null)} />
      )}
    </>
  );
}
