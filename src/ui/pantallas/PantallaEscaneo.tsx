import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LoteConfirmado } from '../../datos/repositorio';
import { formatearPesos } from '../../dominio/arriendo';
import { cilindroPorSerie, ubicacionDe } from '../../dominio/consultas';
import { serieDesdeQR, serieTipeada } from '../../dominio/qr';
import type { EstadoApp, Tamano, TipoMovimiento } from '../../dominio/tipos';
import { senalDeLectura } from '../../escaneo/senales';
import { useEscaner } from '../../escaneo/useEscaner';
import { useEstado } from '../../estado/ProveedorEstado';
import { AltaCilindro } from '../escaneo/AltaCilindro';
import { Comprobante } from '../escaneo/Comprobante';
import { ElegirCliente } from '../escaneo/ElegirCliente';
import { ultimosLotes } from '../escaneo/ultimosLotes';
import { Visor } from '../escaneo/Visor';
import { Adelante, Alerta, Atras, Cruz, FlechaDerecha, FlechaIzquierda, Tilde } from '../iconos';
import { paraCobrar } from '../paraCobrar';

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
  tamano: Tamano | null;
  tipoGas: string | null;
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
  if (cilindro === null) {
    return { serie, conocido: false, tamano: null, tipoGas: null, aviso: 'No está en el sistema' };
  }

  const base = { serie, conocido: true, tamano: cilindro.tamano, tipoGas: cilindro.tipoGas };
  const ubicacion = ubicacionDe(estado, cilindro.id);

  if (tipo === 'entrega') {
    if (ubicacion.lugar !== 'cliente') return { ...base, aviso: null };

    return ubicacion.cliente.id === clienteId
      ? { ...base, aviso: 'Ya figura en este cliente' }
      : { ...base, aviso: `Figura en ${ubicacion.cliente.nombre}` };
  }

  return ubicacion.lugar === 'stock' ? { ...base, aviso: 'Ya figura en stock' } : { ...base, aviso: null };
}

function iniciales(nombre: string): string {
  const letras = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0).toUpperCase())
    .join('');
  return letras === '' ? '?' : letras;
}

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? `1 ${uno}` : `${n} ${varios}`;
}

/**
 * La sección 6.1 completa. Las reglas no están acá: las pone `confirmar_lote`,
 * en la base, que es quien graba.
 */
export function PantallaEscaneo({
  alAbrirAjustes,
  alIrAAvisos,
  alCambiarFlujo,
}: {
  alAbrirAjustes(): void;
  alIrAAvisos(): void;
  /**
   * Avisa cuando se entra o se sale del escaneo y del comprobante: ahí no va la
   * barra de navegación, para que un toque sin querer no pierda el lote.
   */
  alCambiarFlujo(enFlujo: boolean): void;
}) {
  const { estado, perfil, hoy, confirmarLote } = useEstado();

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

  const enFlujo = paso.nombre === 'escaneando' || paso.nombre === 'comprobante';
  useEffect(() => {
    alCambiarFlujo(enFlujo);
  }, [enFlujo, alCambiarFlujo]);
  useEffect(() => () => alCambiarFlujo(false), [alCambiarFlujo]);

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

  /** Descarta el lote. Si ya hay cilindros cargados, pregunta antes. */
  function cancelar() {
    if (grabando) return;
    if (
      series.length > 0 &&
      !window.confirm(`¿Descartar el lote? Se pierden ${plural(series.length, 'cilindro cargado', 'cilindros cargados')}.`)
    ) {
      return;
    }
    setSeries([]);
    setAviso(null);
    setErrorAlGrabar(null);
    setPaso({ nombre: 'modo' });
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
      <Inicio
        estado={estado}
        hoy={hoy}
        nombre={perfil.nombre}
        alEntregar={() => empezar('entrega')}
        alRecibir={() => empezar('devolucion')}
        alAbrirAjustes={alAbrirAjustes}
        alIrAAvisos={alIrAAvisos}
      />
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
    const cliente = estado.clientes.find((c) => c.id === paso.clienteId) ?? null;

    // En una recepción el cliente sale de los movimientos que acaba de grabar la base.
    const deQuien = [
      ...new Set(
        estado.movimientos.filter((m) => m.loteId === paso.lote.loteId).map((m) => m.clienteId),
      ),
    ];
    const nombreDe = (id: string | null) => estado.clientes.find((c) => c.id === id)?.nombre ?? null;
    const destino =
      cliente !== null
        ? cliente.nombre
        : deQuien.length === 1
          ? nombreDe(deQuien[0] ?? null)
          : deQuien.length > 1
            ? 'varios clientes'
            : null;

    return (
      <Comprobante
        lote={paso.lote}
        tipo={paso.tipo}
        cliente={cliente}
        destino={destino}
        alTerminar={() => {
          setSeries([]);
          setPaso({ nombre: 'modo' });
        }}
      />
    );
  }

  const cliente = paso.clienteId === null ? null : estado.clientes.find((c) => c.id === paso.clienteId);
  const ultimo = items.at(-1) ?? null;
  // El aviso de arriba: el del último intento (repetido, mal tipeado) o el del
  // último cilindro con advertencia.
  const conAdvertencia = [...items].reverse().find((i) => i.aviso !== null) ?? null;
  const avisoVisible =
    aviso ?? (conAdvertencia === null ? null : `${conAdvertencia.serie}: ${conAdvertencia.aviso}`);
  const n = items.length;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-marca px-2 pt-3 pb-4 text-white">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => (paso.tipo === 'entrega' ? setPaso({ nombre: 'cliente' }) : cancelar())}
            aria-label={paso.tipo === 'entrega' ? 'Cambiar de cliente' : 'Volver'}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl active:bg-white/10"
          >
            <Atras className="size-6" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-wider text-marca-clara uppercase">
              {paso.tipo === 'entrega' ? 'Entrega' : 'Recepción'}
            </p>
            <p className="truncate font-titulo text-xl leading-tight font-bold">
              {paso.tipo === 'entrega' ? (cliente?.nombre ?? 'Cliente') : 'Vuelven al stock'}
            </p>
          </div>

          <button
            type="button"
            onClick={cancelar}
            className="h-11 shrink-0 rounded-xl px-3 text-sm font-semibold active:bg-white/10"
          >
            Cancelar
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 pb-4">
        <Visor
          estado={escaner.estado}
          videoRef={escaner.videoRef}
          mensaje={escaner.mensaje}
          reintentar={escaner.reintentar}
          alCargarAMano={() => document.getElementById('serie-manual')?.focus()}
        />

        {/* El contador, legible con el brazo estirado. */}
        <div className="mt-4 flex items-end justify-between gap-3">
          <p className="flex items-baseline gap-2">
            <span className="font-titulo text-[52px] leading-none font-bold tabular-nums">{n}</span>
            <span className="text-base text-tinta-2">{n === 1 ? 'cilindro' : 'cilindros'} en el lote</span>
          </p>
        </div>
        {ultimo !== null && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-tinta-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-gracia text-white">
              <Tilde className="size-3.5" trazo={3} />
            </span>
            Último: <span className="font-mono font-bold text-tinta">{ultimo.serie}</span>
          </p>
        )}

        {avisoVisible !== null && (
          <p
            role="status"
            className="mt-3 flex gap-2 rounded-2xl border border-vencer-borde bg-vencer-suave p-3 text-sm font-medium text-vencer"
          >
            <Alerta className="mt-px size-5 shrink-0" />
            <span>{avisoVisible}</span>
          </p>
        )}

        {n > 0 && (
          <ul className="mt-3 divide-y divide-linea rounded-2xl border border-linea bg-white">
            {[...items].reverse().map((item) => (
              <li key={item.serie} className="flex items-center gap-2 py-2 pr-1 pl-4">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[17px] font-bold">{item.serie}</span>

                  {item.aviso !== null ? (
                    <span className="mt-0.5 flex items-center gap-1 text-sm font-medium text-vencer">
                      <Alerta className="size-3.5 shrink-0" trazo={2.6} />
                      {item.aviso}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-sm text-tinta-2">
                      {item.tamano === 'grande' ? 'Grande' : 'Chico'}
                      {item.tipoGas === null ? '' : ` · ${item.tipoGas}`}
                    </span>
                  )}
                </div>

                {!item.conocido && (
                  <button
                    type="button"
                    onClick={() => setADarDeAlta(item.serie)}
                    className="h-11 shrink-0 rounded-xl border border-vencer-borde bg-vencer-suave px-3 text-sm font-semibold text-vencer"
                  >
                    Dar de alta
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSeries((xs) => xs.filter((s) => s !== item.serie))}
                  aria-label={`Sacar ${item.serie} del lote`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-tinta-3 active:bg-fondo"
                >
                  <Cruz className="size-5" />
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
          className="mt-4 flex gap-2"
        >
          <input
            id="serie-manual"
            type="text"
            value={serieManual}
            onChange={(e) => setSerieManual(e.target.value)}
            placeholder="Cargar a mano, ej. CIL-00001"
            autoCapitalize="characters"
            className="h-12 min-w-0 flex-1 rounded-[15px] border-[1.5px] border-linea-fuerte bg-white px-4 font-mono text-base placeholder:font-sans placeholder:text-tinta-3 focus:border-marca focus:outline-none"
          />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-[15px] border-[1.5px] border-linea-fuerte bg-white px-4 text-base font-semibold active:bg-fondo"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="sticky bottom-0 border-t border-linea bg-fondo/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur">
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
          disabled={n === 0 || grabando}
          className="h-[58px] w-full rounded-[15px] bg-tinta font-titulo text-[17px] font-bold text-white active:bg-marca-tinta disabled:bg-linea-fuerte disabled:text-tinta-2"
        >
          {grabando
            ? 'Grabando…'
            : errorAlGrabar !== null
              ? 'Reintentar'
              : n === 0
                ? 'Confirmar lote'
                : `Confirmar lote de ${n}`}
        </button>
      </div>

      {aDarDeAlta !== null && (
        <AltaCilindro serie={aDarDeAlta} alCerrar={() => setADarDeAlta(null)} />
      )}
    </div>
  );
}

/** La pantalla de inicio: lo que Joaquín ve al abrir la app. */
function Inicio({
  estado,
  hoy,
  nombre,
  alEntregar,
  alRecibir,
  alAbrirAjustes,
  alIrAAvisos,
}: {
  estado: EstadoApp;
  hoy: string;
  nombre: string;
  alEntregar(): void;
  alRecibir(): void;
  alAbrirAjustes(): void;
  alIrAAvisos(): void;
}) {
  const cobrar = useMemo(() => paraCobrar(estado, hoy), [estado, hoy]);
  const lotes = useMemo(() => ultimosLotes(estado, hoy), [estado, hoy]);
  const primerNombre = nombre.trim().split(/\s+/)[0] ?? nombre;

  return (
    <>
      <header className="no-imprimir border-b border-linea bg-white px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <img src="/logo-gongas.png" alt="GONGAS" className="h-[22px] w-auto" />

          {/* La sección 6.6 deja Ajustes fuera de la navegación, así que se entra por acá. */}
          <button
            type="button"
            onClick={alAbrirAjustes}
            aria-label={`Ajustes · ${nombre}`}
            className="flex h-11 max-w-[55%] items-center gap-2 rounded-full border border-linea bg-white pr-3.5 pl-1.5 active:bg-fondo"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-marca text-xs font-bold text-white">
              {iniciales(nombre)}
            </span>
            <span className="truncate text-sm font-semibold">{primerNombre}</span>
          </button>
        </div>

        <h1 className="mt-3 font-titulo text-[29px] leading-tight font-bold tracking-tight">Escanear</h1>
      </header>

      <div className="space-y-3 px-4 pt-5 pb-6">
        {/* Uno sólido y otro contorno, con flechas opuestas: equivocarse de modo es el error más caro. */}
        <button
          type="button"
          onClick={alEntregar}
          className="flex h-[132px] w-full items-center gap-4 rounded-2xl bg-marca px-5 text-left text-white active:bg-marca-tinta"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[15px] bg-white/15">
            <FlechaDerecha className="size-7" />
          </span>
          <span>
            <span className="block font-titulo text-[26px] leading-tight font-bold">Entregar</span>
            <span className="mt-0.5 block text-sm text-marca-clara">Cilindros que salen a un cliente</span>
          </span>
        </button>

        <button
          type="button"
          onClick={alRecibir}
          className="flex h-[132px] w-full items-center gap-4 rounded-2xl border-2 border-tinta bg-white px-5 text-left active:bg-fondo"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[15px] bg-fondo">
            <FlechaIzquierda className="size-7" />
          </span>
          <span>
            <span className="block font-titulo text-[26px] leading-tight font-bold">Recibir</span>
            <span className="mt-0.5 block text-sm text-tinta-2">Cilindros que vuelven al stock</span>
          </span>
        </button>

        {cobrar.cantidad > 0 && (
          <button
            type="button"
            onClick={alIrAAvisos}
            className="flex w-full items-center gap-3 rounded-2xl border border-vencer-borde bg-vencer-suave px-4 py-3.5 text-left text-vencer"
          >
            <Alerta className="size-6 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold">
                {plural(cobrar.cantidad, 'cilindro para cobrar', 'cilindros para cobrar')}
              </span>
              <span className="block text-sm">
                {cobrar.total === null
                  ? `${cobrar.cantidad === 1 ? 'Ya genera' : 'Ya generan'} cargo. Ver en Avisos`
                  : `${formatearPesos(cobrar.total)} acumulados a hoy`}
              </span>
            </span>
            <Adelante className="size-5 shrink-0" />
          </button>
        )}

        {lotes.length > 0 && (
          <section className="pt-3">
            <h2 className="mb-2 text-xs font-bold tracking-wider text-tinta-2 uppercase">Últimos lotes</h2>
            <ul className="divide-y divide-linea rounded-2xl border border-linea bg-white">
              {lotes.map((lote) => (
                <li key={lote.loteId} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${
                      lote.tipo === 'entrega' ? 'bg-marca-suave text-marca' : 'bg-stock-suave text-stock'
                    }`}
                  >
                    {lote.tipo === 'entrega' ? (
                      <FlechaDerecha className="size-[18px]" />
                    ) : (
                      <FlechaIzquierda className="size-[18px]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{lote.cliente}</span>
                    <span className="block text-sm text-tinta-2">
                      {lote.tipo === 'entrega'
                        ? plural(lote.cantidad, 'entregado', 'entregados')
                        : plural(lote.cantidad, 'recibido', 'recibidos')}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-tinta-2">{lote.cuando}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
