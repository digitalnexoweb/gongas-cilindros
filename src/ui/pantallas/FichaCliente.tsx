import { useMemo, useState } from 'react';

import { formatearFecha } from '../../dominio/arriendo';
import { sePuedeBorrarCliente, ultimoMovimientoDe, vistaClientes } from '../../dominio/consultas';
import { useEstado } from '../../estado/ProveedorEstado';
import { ChipEstado, estadoVisible } from '../ChipEstado';
import { Bloque, Dato } from '../Dato';
import { BotonEditar } from '../BotonEditar';
import { Encabezado } from '../Encabezado';
import { FormularioCliente } from '../FormularioCliente';
import { Importe } from '../Importe';
import { nombreKilos } from '../../dominio/tipos';
import { nombreTipoCliente } from './PantallaClientes';
import { DeshacerLote } from '../escaneo/DeshacerLote';

/**
 * La sección 6.3: el detalle de cada cilindro del cliente, con sus días y su
 * importe. El administrador además puede corregir sus datos.
 */
export function FichaCliente({ clienteId, alVolver }: { clienteId: string; alVolver(): void }) {
  const { estado, hoy, perfil, editarCliente, borrarCliente } = useEstado();
  const [editando, setEditando] = useState(false);
  /** La entrega que se está por deshacer: el movimiento y la serie del cilindro. */
  const [deshaciendo, setDeshaciendo] = useState<{ movimiento: string; serie: string } | null>(null);
  const vista = useMemo(
    () => vistaClientes(estado, hoy).find((v) => v.cliente.id === clienteId) ?? null,
    [estado, hoy, clienteId],
  );

  if (vista !== null && editando) {
    const { id: _id, ...datos } = vista.cliente;
    return (
      <FormularioCliente
        titulo="Editar cliente"
        textoBoton="Guardar"
        inicial={datos}
        alVolver={() => setEditando(false)}
        alGuardar={async (nuevos) => {
          await editarCliente(clienteId, nuevos);
          setEditando(false);
        }}
        borrar={{
          motivo: ((p) => (p === true ? null : p))(sePuedeBorrarCliente(estado, clienteId)),
          alBorrar: async () => {
            await borrarCliente(clienteId);
            alVolver();
          },
        }}
      />
    );
  }

  if (vista === null) {
    return (
      <>
        <Encabezado titulo="Cliente" alVolver={alVolver} />
        <p className="px-8 pt-16 text-center text-sm text-slate-500">Ese cliente no existe.</p>
      </>
    );
  }

  const { cliente, cilindros, total } = vista;

  return (
    <>
      <Encabezado
        titulo={cliente.nombre}
        bajada={nombreTipoCliente[cliente.tipo]}
        alVolver={alVolver}
        accion={perfil.rol === 'admin' ? <BotonEditar alTocar={() => setEditando(true)} /> : undefined}
      />

      <div className="pb-4">
        <Bloque titulo="El cliente">
          <Dato etiqueta="Documento">{cliente.documento}</Dato>
          <Dato etiqueta="Teléfono">{cliente.telefono}</Dato>
          <Dato etiqueta="Mail">{cliente.email === undefined || cliente.email === '' ? '—' : cliente.email}</Dato>
          <Dato etiqueta="Dirección">{(cliente.direccion ?? '') === '' ? '—' : cliente.direccion}</Dato>
          <Dato etiqueta="Ciudad">{(cliente.ciudad ?? '') === '' ? '—' : cliente.ciudad}</Dato>
          {(cliente.notas ?? '') !== '' && (
            <div className="px-4 py-3">
              <span className="block text-sm text-tinta-2">Notas</span>
              <p className="mt-1 text-sm whitespace-pre-wrap">{cliente.notas}</p>
            </div>
          )}
        </Bloque>

        <Bloque titulo={`Cilindros en su poder · ${cilindros.length}`}>
          {cilindros.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No tiene cilindros ahora mismo.
            </p>
          ) : (
            cilindros.map(({ cilindro, arriendo, calculo }) => {
              // Solo si lo último que le pasó al cilindro es esta entrega: si no, no se puede deshacer.
              const ultimo = ultimoMovimientoDe(estado, cilindro.id);
              const entrega = ultimo?.tipo === 'entrega' && ultimo.clienteId === clienteId ? ultimo : null;
              return (
              <div key={cilindro.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-base font-semibold">{cilindro.serie}</span>
                  <ChipEstado estado={estadoVisible(calculo)} />
                </div>

                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-slate-500">
                    {nombreKilos(cilindro.kg)}
                    {arriendo !== null && ` · desde el ${formatearFecha(arriendo.fechaEntrega)}`}
                    {calculo !== null && ` · ${calculo.dias} días`}
                  </span>

                  {calculo !== null && <Importe valor={calculo.importe} />}
                </div>

                {entrega !== null && (
                  <button
                    type="button"
                    onClick={() => setDeshaciendo({ movimiento: entrega.id, serie: cilindro.serie })}
                    className="mt-1.5 -ml-1 min-h-11 px-1 text-sm font-semibold text-cargo"
                  >
                    Deshacer entrega
                  </button>
                )}
              </div>
              );
            })
          )}
        </Bloque>

        {total !== null && (
          <div className="mt-5 flex items-baseline justify-between gap-4 border-y border-slate-200 bg-white px-4 py-4">
            <span className="text-base font-semibold">Total acumulado</span>
            <Importe valor={total} grande />
          </div>
        )}
      </div>

      {deshaciendo !== null && (
        <DeshacerLote
          titulo={`Entrega del ${deshaciendo.serie} a ${cliente.nombre}`}
          movimientos={[deshaciendo.movimiento]}
          alCerrar={() => setDeshaciendo(null)}
        />
      )}
    </>
  );
}
