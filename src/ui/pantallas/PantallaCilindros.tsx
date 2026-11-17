import { useMemo, useState } from 'react';

import { vistaCilindros, type VistaCilindro } from '../../dominio/consultas';
import { useEstado } from '../../estado/ProveedorEstado';
import { nombreKilos } from '../../dominio/tipos';
import { Buscador } from '../Buscador';
import { ChipEstado, estadoVisible } from '../ChipEstado';
import { Encabezado } from '../Encabezado';
import { Importe } from '../Importe';
import { filtrarCilindros, opcionesDeFiltro, type FiltroEstado, type FiltroInicial } from './filtroCilindros';

const filtros: { id: FiltroEstado; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'stock', etiqueta: 'En stock' },
  { id: 'en_gracia', etiqueta: 'En gracia' },
  { id: 'por_vencer', etiqueta: 'Por vencer' },
  { id: 'generando_cargo', etiqueta: 'Generando cargo' },
  // Los dados de baja no se mezclan con los demás: solo aparecen con este filtro.
  { id: 'de_baja', etiqueta: 'De baja' },
];

/** La sección 6.2: lista de todos los cilindros, con filtros por estado, gas y peso, y buscador por serie. */
export function PantallaCilindros({
  alAbrir,
  filtroInicial = {},
}: {
  alAbrir(cilindroId: string): void;
  /** Desde el panel se llega con un filtro ya puesto; después se cambia como siempre. */
  filtroInicial?: FiltroInicial;
}) {
  const { estado, hoy } = useEstado();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>(filtroInicial.estado ?? 'todos');
  const [gas, setGas] = useState<string | null>(filtroInicial.gas ?? null);
  const [kg, setKg] = useState<number | null>(filtroInicial.kg ?? null);

  const todas = useMemo(() => vistaCilindros(estado, hoy), [estado, hoy]);
  const enUso = useMemo(() => todas.filter((v) => v.cilindro.activo), [todas]);

  const opciones = useMemo(() => opcionesDeFiltro(todas), [todas]);

  const visibles = useMemo(
    () => filtrarCilindros(todas, { estado: filtro, gas, kg, texto: busqueda }),
    [todas, busqueda, filtro, gas, kg],
  );

  return (
    <>
      <Encabezado
        titulo="Cilindros"
        bajada={
          filtro === 'de_baja'
            ? `${visibles.length} dados de baja`
            : visibles.length === enUso.length
              ? `${enUso.length} en total`
              : `${visibles.length} de ${enUso.length}`
        }
      >
        <Buscador valor={busqueda} alCambiar={setBusqueda} marcador="Buscar por serie" />

        <div className="flex flex-wrap gap-2">
          {filtros.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`h-9 rounded-full border px-3.5 text-sm ${
                filtro === f.id
                  ? 'border-slate-900 bg-slate-900 font-medium text-white'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>

        {/* Gas y peso: se combinan con el estado y con el buscador. */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="sr-only">Gas</span>
            <select
              value={gas ?? ''}
              onChange={(e) => setGas(e.target.value === '' ? null : e.target.value)}
              className={`h-11 w-full rounded-[12px] border-[1.5px] bg-white px-2 text-sm ${
                gas === null ? 'border-linea-fuerte text-tinta-2' : 'border-tinta font-semibold text-tinta'
              }`}
            >
              <option value="">Todos los gases</option>
              {opciones.gases.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Peso</span>
            <select
              value={kg === null ? '' : String(kg)}
              onChange={(e) => setKg(e.target.value === '' ? null : Number(e.target.value))}
              className={`h-11 w-full rounded-[12px] border-[1.5px] bg-white px-2 text-sm ${
                kg === null ? 'border-linea-fuerte text-tinta-2' : 'border-tinta font-semibold text-tinta'
              }`}
            >
              <option value="">Todos los pesos</option>
              {opciones.pesos.map((p) => (
                <option key={p} value={String(p)}>
                  {nombreKilos(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Encabezado>

      {visibles.length === 0 ? (
        <p className="px-8 pt-16 text-center text-sm text-slate-500">
          No hay cilindros que coincidan.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 border-b border-slate-200 bg-white">
          {visibles.map((vista) => (
            <li key={vista.cilindro.id}>
              <FilaCilindro vista={vista} alAbrir={alAbrir} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilaCilindro({
  vista,
  alAbrir,
}: {
  vista: VistaCilindro;
  alAbrir(cilindroId: string): void;
}) {
  const { cilindro, ubicacion, calculo } = vista;

  const donde = ubicacion.lugar === 'cliente' ? `En ${ubicacion.cliente.nombre}` : 'En stock';
  const detalle = [
    nombreKilos(cilindro.kg),
    cilindro.tipoGas,
    donde,
    ...(calculo === null ? [] : [`${calculo.dias} días`]),
  ].join(' · ');

  return (
    <button
      type="button"
      onClick={() => alAbrir(cilindro.id)}
      className="block w-full px-4 py-3.5 text-left active:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-base font-semibold">{cilindro.serie}</span>
        <ChipEstado estado={estadoVisible(calculo)} />
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-slate-500">{detalle}</span>

        {/* En stock no hay importe porque no se acumula nada; y si quien mira
            no puede ver la plata, tampoco. */}
        {calculo !== null && <Importe valor={calculo.importe} />}
      </div>
    </button>
  );
}
