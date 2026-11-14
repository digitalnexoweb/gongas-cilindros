import { useMemo, useState } from 'react';

import { vistaCilindros, type VistaCilindro } from '../../dominio/consultas';
import { useEstado } from '../../estado/ProveedorEstado';
import { nombreKilos } from '../../dominio/tipos';
import { Buscador } from '../Buscador';
import { ChipEstado, estadoVisible, type EstadoVisible } from '../ChipEstado';
import { Encabezado } from '../Encabezado';
import { Importe } from '../Importe';

type Filtro = 'todos' | EstadoVisible | 'de_baja';

const filtros: { id: Filtro; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'stock', etiqueta: 'En stock' },
  { id: 'en_gracia', etiqueta: 'En gracia' },
  { id: 'por_vencer', etiqueta: 'Por vencer' },
  { id: 'generando_cargo', etiqueta: 'Generando cargo' },
  // Los dados de baja no se mezclan con los demás: solo aparecen con este filtro.
  { id: 'de_baja', etiqueta: 'De baja' },
];

/** La sección 6.2: lista de todos los cilindros, con filtros y buscador por serie. */
export function PantallaCilindros({ alAbrir }: { alAbrir(cilindroId: string): void }) {
  const { estado, hoy } = useEstado();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const todas = useMemo(() => vistaCilindros(estado, hoy), [estado, hoy]);
  const enUso = useMemo(() => todas.filter((v) => v.cilindro.activo), [todas]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return todas.filter((vista) => {
      if (filtro === 'de_baja') {
        if (vista.cilindro.activo) return false;
      } else {
        if (!vista.cilindro.activo) return false;
        if (filtro !== 'todos' && estadoVisible(vista.calculo) !== filtro) return false;
      }
      if (texto !== '' && !vista.cilindro.serie.toLowerCase().includes(texto)) return false;
      return true;
    });
  }, [todas, busqueda, filtro]);

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
  const detalle =
    calculo === null
      ? `${nombreKilos(cilindro.kg)} · ${donde}`
      : `${nombreKilos(cilindro.kg)} · ${donde} · ${calculo.dias} días`;

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
