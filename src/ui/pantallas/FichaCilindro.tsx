import { useState } from 'react';

import { formatearFecha, formatearPesos, tarifaDiaria } from '../../dominio/arriendo';
import {
  arriendosDe,
  calcularVisible,
  cilindroPorId,
  clientePorId,
  historialDe,
  vistaCilindro,
} from '../../dominio/consultas';
import { useEstado } from '../../estado/ProveedorEstado';
import type { EstadoApp } from '../../dominio/tipos';
import { ChipEstado, estadoVisible } from '../ChipEstado';
import { BotonEditar } from '../BotonEditar';
import { Bloque, Dato } from '../Dato';
import { EditarCilindro } from '../EditarCilindro';
import { Encabezado } from '../Encabezado';
import { cuandoEnFrase } from '../hora';
import { Importe } from '../Importe';
import { nombreTamano } from './PantallaCilindros';

/** La sección 6.2: la ficha, con el historial completo de movimientos. */
export function FichaCilindro({
  cilindroId,
  alVolver,
}: {
  cilindroId: string;
  alVolver(): void;
}) {
  const { estado, hoy, perfil } = useEstado();
  const [editando, setEditando] = useState(false);
  const cilindro = cilindroPorId(estado, cilindroId);

  if (cilindro === null) {
    return (
      <>
        <Encabezado titulo="Cilindro" alVolver={alVolver} />
        <p className="px-8 pt-16 text-center text-sm text-slate-500">Ese cilindro no existe.</p>
      </>
    );
  }

  const vista = vistaCilindro(estado, cilindro, hoy);
  const historial = historialDe(estado, cilindro.id);
  // Del más nuevo al más viejo, como el historial.
  const avisos = (estado.avisos ?? []).filter((a) => a.cilindroId === cilindro.id).reverse();

  if (editando) {
    return (
      <EditarCilindro
        cilindro={cilindro}
        enUnCliente={vista.ubicacion.lugar === 'cliente'}
        alVolver={() => setEditando(false)}
      />
    );
  }

  // En stock, el último arriendo cerrado es lo que muestra el reloj detenido.
  const ultimoCerrado =
    vista.arriendo === null
      ? (arriendosDe(estado, cilindro.id).find((a) => a.fechaDevolucion !== null) ?? null)
      : null;

  return (
    <>
      <Encabezado
        titulo={cilindro.serie}
        bajada={cilindro.tipoGas}
        alVolver={alVolver}
        accion={perfil.rol === 'admin' ? <BotonEditar alTocar={() => setEditando(true)} /> : undefined}
      />

      <div className="pb-4">
        {!cilindro.activo && (
          <p className="mx-4 mt-4 rounded-xl border border-vencer-borde bg-vencer-suave p-3 text-sm font-semibold text-vencer">
            Dado de baja. Queda con su historial, pero no debería volver a entregarse.
          </p>
        )}

        <Bloque titulo="Dónde está">
          <Dato etiqueta="Ubicación">
            {vista.ubicacion.lugar === 'cliente' ? vista.ubicacion.cliente.nombre : 'En stock'}
          </Dato>

          <Dato etiqueta="Estado">
            <ChipEstado estado={estadoVisible(vista.calculo)} />
          </Dato>

          {vista.arriendo !== null && vista.calculo !== null && (
            <>
              <Dato etiqueta="Desde">{formatearFecha(vista.arriendo.fechaEntrega)}</Dato>
              <Dato etiqueta="Días transcurridos">{vista.calculo.dias}</Dato>
              <Dato etiqueta="Días facturables">{vista.calculo.diasFacturables}</Dato>
              {vista.calculo.importe !== null && (
                <Dato etiqueta="Acumulado">
                  <Importe valor={vista.calculo.importe} />
                </Dato>
              )}
            </>
          )}
        </Bloque>

        <Bloque titulo="El cilindro">
          <Dato etiqueta="Serie">
            <span className="font-mono">{cilindro.serie}</span>
          </Dato>
          <Dato etiqueta="Tipo de gas">{cilindro.tipoGas}</Dato>
          <Dato etiqueta="Tamaño">{nombreTamano[cilindro.tamano]}</Dato>
          {/*
            La diaria va con decimales a propósito: el SPEC dice que no se
            redondea. Mostrar "$ 13" invitaría a la cuenta equivocada, porque
            32 × 13 da 416 y el importe correcto es 405.
            Sin tarifa —un empleado— no se muestra ninguna de las dos.
          */}
          {cilindro.tarifaMensual !== null && (
            <>
              <Dato etiqueta="Tarifa mensual">{formatearPesos(cilindro.tarifaMensual)}</Dato>
              <Dato etiqueta="Tarifa diaria">
                $ {tarifaDiaria(cilindro.tarifaMensual).toFixed(2).replace('.', ',')} por día
              </Dato>
            </>
          )}
        </Bloque>

        {ultimoCerrado !== null && ultimoCerrado.fechaDevolucion !== null && (
          <Bloque titulo="Último arriendo, ya cerrado">
            <Dato etiqueta="Cliente">
              {clientePorId(estado, ultimoCerrado.clienteId)?.nombre ?? '—'}
            </Dato>
            <Dato etiqueta="Entregado">{formatearFecha(ultimoCerrado.fechaEntrega)}</Dato>
            <Dato etiqueta="Devuelto">{formatearFecha(ultimoCerrado.fechaDevolucion)}</Dato>
            <Dato etiqueta="Días">
              {calcularVisible(ultimoCerrado, cilindro.tarifaMensual, hoy).dias}
            </Dato>
            {cilindro.tarifaMensual !== null && (
              <Dato etiqueta="Quedó en">
                {formatearPesos(
                  calcularVisible(ultimoCerrado, cilindro.tarifaMensual, hoy).importe ?? 0,
                )}
              </Dato>
            )}
          </Bloque>
        )}

        {avisos.length > 0 && (
          <Bloque titulo={`Avisos por WhatsApp · ${avisos.length}`}>
            {avisos.map((aviso) => (
              <div key={aviso.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate text-sm">
                  <span className="font-semibold">{aviso.operador}</span>
                  <span className="text-tinta-2">
                    {' '}
                    · {clientePorId(estado, aviso.clienteId)?.nombre ?? '—'} · a los {aviso.dias} días
                  </span>
                </span>
                <span className="shrink-0 text-sm text-tinta-2">{cuandoEnFrase(aviso.creadoEn, hoy)}</span>
              </div>
            ))}
          </Bloque>
        )}

        <Bloque titulo={`Historial · ${historial.length} movimientos`}>
          {historial.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Todavía sin movimientos.</p>
          ) : (
            historial.map((movimiento) => (
              <Movimiento key={movimiento.id} movimiento={movimiento} estado={estado} />
            ))
          )}
        </Bloque>
      </div>
    </>
  );
}

function Movimiento({
  movimiento,
  estado,
}: {
  movimiento: ReturnType<typeof historialDe>[number];
  estado: EstadoApp;
}) {
  const esEntrega = movimiento.tipo === 'entrega';
  const cliente =
    movimiento.clienteId === null ? null : clientePorId(estado, movimiento.clienteId);

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-sm font-semibold ${esEntrega ? 'text-cargo' : 'text-gracia'}`}>
          {esEntrega ? 'Entrega' : 'Devolución'}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-slate-500">
          {formatearFecha(movimiento.fecha)}
        </span>
      </div>

      <p className="mt-0.5 truncate text-sm text-slate-500">
        {cliente === null ? 'A stock' : cliente.nombre} · {movimiento.operador}
      </p>
    </div>
  );
}
