import { useMemo, useState } from 'react';

import { altaCliente } from '../../dominio/storage';
import type { EstadoApp, TipoCliente } from '../../dominio/tipos';
import { useEstado } from '../../estado/ProveedorEstado';
import { Buscador } from '../Buscador';
import { Encabezado } from '../Encabezado';

/** El paso 2 de la sección 6.1: elegir cliente, o darlo de alta en el momento. */
export function ElegirCliente({
  alElegir,
  alVolver,
}: {
  alElegir(clienteId: string): void;
  alVolver(): void;
}) {
  const { estado, actualizar } = useEstado();
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
        estado={estado}
        alVolver={() => setDandoDeAlta(false)}
        alCrear={(nuevoEstado, clienteId) => {
          actualizar(nuevoEstado);
          alElegir(clienteId);
        }}
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
                {cliente.tipo === 'empresa' ? 'Empresa' : 'Particular'} · {cliente.documento}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {visibles.length === 0 && (
        <p className="px-8 pt-10 text-center text-sm text-slate-500">
          Ningún cliente coincide con la búsqueda.
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

/** El alta mínima de 6.1: nombre, tipo, documento y teléfono. */
function FormularioCliente({
  estado,
  alCrear,
  alVolver,
}: {
  estado: EstadoApp;
  alCrear(nuevoEstado: EstadoApp, clienteId: string): void;
  alVolver(): void;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoCliente>('empresa');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('+598');

  const listo = nombre.trim() !== '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo) return;

        const { estado: nuevoEstado, cliente } = altaCliente(estado, {
          nombre: nombre.trim(),
          tipo,
          documento: documento.trim(),
          telefono: telefono.trim(),
        });
        alCrear(nuevoEstado, cliente.id);
      }}
    >
      <Encabezado titulo="Cliente nuevo" alVolver={alVolver} />

      <div className="space-y-4 px-4 pt-4">
        <Campo etiqueta="Nombre" valor={nombre} alCambiar={setNombre} autoFoco />

        <div>
          <span className="block text-sm font-medium text-slate-700">Tipo</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['empresa', 'particular'] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                onClick={() => setTipo(opcion)}
                aria-pressed={tipo === opcion}
                className={`h-12 rounded-xl border text-base ${
                  tipo === opcion
                    ? 'border-slate-900 bg-slate-900 font-medium text-white'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                {opcion === 'empresa' ? 'Empresa' : 'Particular'}
              </button>
            ))}
          </div>
        </div>

        <Campo
          etiqueta={tipo === 'empresa' ? 'RUT' : 'Cédula'}
          valor={documento}
          alCambiar={setDocumento}
          modo="numeric"
        />
        <Campo etiqueta="Teléfono" valor={telefono} alCambiar={setTelefono} modo="tel" />

        <button
          type="submit"
          disabled={!listo}
          className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700 disabled:bg-slate-300"
        >
          Crear y seguir
        </button>
      </div>
    </form>
  );
}

function Campo({
  etiqueta,
  valor,
  alCambiar,
  modo,
  autoFoco = false,
}: {
  etiqueta: string;
  valor: string;
  alCambiar(nuevo: string): void;
  modo?: 'numeric' | 'tel';
  autoFoco?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{etiqueta}</span>
      <input
        type="text"
        inputMode={modo}
        autoFocus={autoFoco}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base focus:border-slate-900 focus:outline-none"
      />
    </label>
  );
}
