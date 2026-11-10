import { useMemo } from 'react';

import { formatearPesos } from '../../dominio/arriendo';
import { vistaClientes, type VistaCliente } from '../../dominio/consultas';
import { useEstado } from '../../estado/ProveedorEstado';
import { Encabezado } from '../Encabezado';
import { Importe } from '../Importe';

export const nombreTipoCliente = { empresa: 'Empresa', particular: 'Particular' } as const;

/** La sección 6.3: un cliente por fila, con cuántos cilindros tiene y cuánto acumula. */
export function PantallaClientes({ alAbrir }: { alAbrir(clienteId: string): void }) {
  const { estado, hoy } = useEstado();
  const vistas = useMemo(() => vistaClientes(estado, hoy), [estado, hoy]);

  // Si de algún cliente no se puede ver el total, no hay total general: sería falso.
  const total = vistas.some((v) => v.total === null)
    ? null
    : vistas.reduce((suma, v) => suma + (v.total ?? 0), 0);

  const cuantos = vistas.length === 1 ? '1 cliente' : `${vistas.length} clientes`;

  return (
    <>
      <Encabezado
        titulo="Clientes"
        bajada={total === null ? cuantos : `${cuantos} · ${formatearPesos(total)} en total`}
      />

      {vistas.length === 0 ? (
        <p className="px-8 pt-16 text-center text-sm text-slate-500">Todavía no hay clientes.</p>
      ) : (
        <ul className="divide-y divide-slate-200 border-b border-slate-200 bg-white">
          {vistas.map((vista) => (
            <li key={vista.cliente.id}>
              <FilaCliente vista={vista} alAbrir={alAbrir} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilaCliente({
  vista,
  alAbrir,
}: {
  vista: VistaCliente;
  alAbrir(clienteId: string): void;
}) {
  const { cliente, cilindros, total } = vista;

  const cuantos =
    cilindros.length === 0
      ? 'Sin cilindros'
      : cilindros.length === 1
        ? '1 cilindro'
        : `${cilindros.length} cilindros`;

  return (
    <button
      type="button"
      onClick={() => alAbrir(cliente.id)}
      className="block w-full px-4 py-3.5 text-left active:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-base font-semibold">{cliente.nombre}</span>
        <Importe valor={total} />
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {nombreTipoCliente[cliente.tipo]} · {cuantos}
      </p>
    </button>
  );
}
