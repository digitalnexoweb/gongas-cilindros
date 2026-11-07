import { useEffect, useMemo, useRef, useState } from 'react';

import { useEstado } from '../../estado/ProveedorEstado';
import {
  ALTO_ETIQUETA_MM,
  ANCHO_ETIQUETA_MM,
  COLUMNAS,
  LADO_QR_MM,
  PX_POR_MM,
  altoDeHojaMm,
  repartirEnHojas,
} from '../../etiquetas/hojas';
import { comoImagen, svgDeEtiqueta } from '../../etiquetas/svgDeEtiqueta';
import { Encabezado } from '../Encabezado';

const ANCHO_HOJA_MM = COLUMNAS * ANCHO_ETIQUETA_MM;

/** La sección 6.6: la grilla imprimible, sin la cual no se puede hacer la demo. */
export function PantallaEtiquetas({ alVolver }: { alVolver(): void }) {
  const { estado } = useEstado();

  const [elegidas, setElegidas] = useState<Set<string>>(
    () => new Set(estado.cilindros.map((c) => c.serie)),
  );
  const [imagenes, setImagenes] = useState<Map<string, string>>(new Map());

  // La hoja se dibuja en milímetros y se escala para entrar en el celular.
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    let cancelado = false;

    async function generar() {
      const pares = await Promise.all(
        estado.cilindros.map(
          async (c) => [c.serie, comoImagen(await svgDeEtiqueta(c.serie))] as const,
        ),
      );
      if (!cancelado) setImagenes(new Map(pares));
    }

    void generar();
    return () => {
      cancelado = true;
    };
  }, [estado.cilindros]);

  useEffect(() => {
    const nodo = contenedorRef.current;
    if (nodo === null) return;

    const medir = () => setEscala(Math.min(1, nodo.clientWidth / (ANCHO_HOJA_MM * PX_POR_MM)));
    medir();

    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  const series = useMemo(
    () => estado.cilindros.filter((c) => elegidas.has(c.serie)).map((c) => c.serie),
    [estado.cilindros, elegidas],
  );
  const hojas = useMemo(() => repartirEnHojas(series), [series]);

  function alternar(serie: string) {
    setElegidas((actuales) => {
      const nuevas = new Set(actuales);
      if (nuevas.has(serie)) nuevas.delete(serie);
      else nuevas.add(serie);
      return nuevas;
    });
  }

  return (
    <>
      <Encabezado
        titulo="Etiquetas QR"
        bajada={
          hojas.length === 0
            ? 'Ninguna elegida'
            : `${series.length} etiquetas · ${hojas.length === 1 ? '1 hoja' : `${hojas.length} hojas`} A4`
        }
        alVolver={alVolver}
      />

      <div className="no-imprimir px-4 pt-4">
        <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500">
          Para el sistema real conviene probar la etiqueta en 5 cilindros durante un mes antes de
          etiquetar todo, por los golpes, la humedad y el aceite.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-semibold">Qué imprimir</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setElegidas(new Set(estado.cilindros.map((c) => c.serie)))}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setElegidas(new Set())}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              Ninguno
            </button>
          </div>
        </div>

        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {estado.cilindros.map((cilindro) => (
            <li key={cilindro.id}>
              <label className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={elegidas.has(cilindro.serie)}
                  onChange={() => alternar(cilindro.serie)}
                  className="size-5 accent-slate-900"
                />
                <span className="font-mono text-base">{cilindro.serie}</span>
                <span className="ml-auto text-sm text-slate-500">
                  {cilindro.tamano === 'chico' ? 'Chico' : 'Grande'}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <h2 className="no-imprimir px-4 pt-6 pb-2 text-sm font-semibold">
        Así sale la hoja
      </h2>

      <div ref={contenedorRef} className="px-4">
        {hojas.map((hoja, i) => (
          <div
            key={i}
            className="envoltorio-hoja mb-4 overflow-hidden"
            style={{ height: `${altoDeHojaMm(hoja.length) * PX_POR_MM * escala}px` }}
          >
            <div
              className="hoja grid bg-white"
              style={{
                width: `${ANCHO_HOJA_MM}mm`,
                gridTemplateColumns: `repeat(${COLUMNAS}, ${ANCHO_ETIQUETA_MM}mm)`,
                transform: `scale(${escala})`,
                transformOrigin: 'top left',
              }}
            >
              {hoja.map((serie) => (
                <Etiqueta key={serie} serie={serie} imagen={imagenes.get(serie)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {series.length === 0 && (
        <p className="no-imprimir px-8 pt-8 pb-4 text-center text-sm text-slate-500">
          Elegí al menos un cilindro para ver la hoja.
        </p>
      )}

      <div className="no-imprimir px-4 pt-2 pb-6">
        <button
          type="button"
          onClick={() => window.print()}
          disabled={series.length === 0}
          className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700 disabled:bg-slate-300"
        >
          Imprimir
        </button>
      </div>
    </>
  );
}

function Etiqueta({ serie, imagen }: { serie: string; imagen: string | undefined }) {
  return (
    <div
      className="etiqueta flex flex-col items-center justify-center border border-dashed border-slate-400"
      style={{ width: `${ANCHO_ETIQUETA_MM}mm`, height: `${ALTO_ETIQUETA_MM}mm` }}
    >
      {imagen === undefined ? (
        <div
          className="bg-slate-100"
          style={{ width: `${LADO_QR_MM}mm`, height: `${LADO_QR_MM}mm` }}
        />
      ) : (
        <img
          src={imagen}
          alt={`Código QR de ${serie}`}
          style={{ width: `${LADO_QR_MM}mm`, height: `${LADO_QR_MM}mm` }}
        />
      )}

      {/* La serie legible, por si la etiqueta se daña. Lo pide la sección 8. */}
      <span className="mt-[2mm] font-mono font-bold" style={{ fontSize: '4.5mm' }}>
        {serie}
      </span>
    </div>
  );
}
