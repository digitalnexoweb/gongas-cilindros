import { useMemo, useState } from 'react';

import { useEstado } from '../../estado/ProveedorEstado';
import { Buscador } from '../Buscador';
import { Encabezado } from '../Encabezado';
import { FormularioCliente } from '../FormularioCliente';

/** El paso 2 de la sección 6.1: elegir cliente, o darlo de alta en el momento. */
export function ElegirCliente({
  alElegir,
  alVolver,
}: {
  alElegir(clienteId: string): void;
  alVolver(): void;
}) {
  const { estado, altaCliente } = useEstado();
  const [busqueda, setBusqueda] = useState('');
  const [dandoDeAlta, setDandoDeAlta] = useState(false);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (texto === '') return estado.clientes;
    return estado.clientes.filter((c) => c.nombre.toLowerCase().includes(texto));
  }, [estado.clientes, busqueda]);

  if (dandoDeAlta) {
    return (
      <FormularioCliente
        titulo="Cliente nuevo"
        textoBoton="Crear y seguir"
        alVolver={() => setDandoDeAlta(false)}
        alGuardar={async (datos) => alElegir(await altaCliente(datos))}
      />
    );
  }

  return (
    <>
      <Encabezado titulo="¿A qué cliente?" alVolver={alVolver}>
        <Buscador valor={busqueda} alCambiar={setBusqueda} marcador="Buscar cliente" />
      </Encabezado>

      <ul className="divide-y divide-slate-200 border-b border-slate-200 bg-white">
        {visibles.map((cliente) => (
          <li key={cliente.id}>
            <button
              type="button"
              onClick={() => alElegir(cliente.id)}
              className="block w-full px-4 py-4 text-left active:bg-slate-50"
            >
              <span className="text-base font-semibold">{cliente.nombre}</span>
              <span className="mt-0.5 block text-sm text-slate-500">
                {cliente.tipo === 'empresa' ? 'Empresa' : 'Particular'}
                {cliente.documento !== '' && ` · ${cliente.documento}`}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {visibles.length === 0 && (
        <p className="px-8 pt-10 text-center text-sm text-slate-500">
          {estado.clientes.length === 0
            ? 'Todavía no hay clientes. Dá de alta el primero.'
            : 'Ningún cliente coincide con la búsqueda.'}
        </p>
      )}

      <div className="px-4 py-5">
        <button
          type="button"
          onClick={() => setDandoDeAlta(true)}
          className="h-13 w-full rounded-xl border border-slate-900 py-3.5 text-base font-semibold active:bg-slate-100"
        >
          Cliente nuevo
        </button>
      </div>
    </>
  );
}
