import { useState, type ReactNode } from 'react';

import type { LoteConfirmado } from '../../datos/repositorio';
import { DIAS_GRACIA, formatearFecha } from '../../dominio/arriendo';
import { cilindroPorSerie } from '../../dominio/consultas';
import { linkWhatsApp, textoComprobante } from '../../dominio/mensajes';
import { nombreKilos, type Cliente, type TipoMovimiento } from '../../dominio/tipos';
import { useEstado } from '../../estado/ProveedorEstado';
import { Alerta, Reloj, Tilde, WhatsApp } from '../iconos';
import { DeshacerLote } from './DeshacerLote';

/** El número de remito como se lo dicta Joaquín a un cliente: LOTE-0001. */
function formatearRemito(numero: number): string {
  return `LOTE-${String(numero).padStart(4, '0')}`;
}

/**
 * El comprobante de 6.1: qué se grabó, cuándo, quién y con qué remito, para
 * mandar por WhatsApp o copiar.
 */
export function Comprobante({
  lote,
  tipo,
  cliente,
  destino,
  alTerminar,
}: {
  /** Lo que la base confirmó que grabó: sus series, su fecha y su hora, no las del celular. */
  lote: LoteConfirmado;
  tipo: TipoMovimiento;
  /** El cliente de una entrega. En una recepción, `null`. */
  cliente: Cliente | null;
  /** A quién se entregó o de quién se recibió, para la bajada. `null` si no se sabe. */
  destino: string | null;
  alTerminar(): void;
}) {
  const { estado, perfil } = useEstado();
  const [copiado, setCopiado] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);

  // El texto de WhatsApp es el de siempre: el remito no entra en el mensaje.
  const texto = textoComprobante({ tipo, series: lote.series, cliente, fecha: lote.fecha, gases: lote.gases });
  const whatsapp =
    // Con un número completo: "+598" solo, que es lo que trae el formulario, no alcanza.
    cliente !== null && cliente.telefono.replace(/\D/g, '').length >= 8
      ? linkWhatsApp(cliente.telefono, texto)
      : null;

  const n = lote.series.length;
  const cilindros = n === 1 ? '1 cilindro' : `${n} cilindros`;
  const bajada =
    n === 0
      ? 'No se grabó ningún cilindro'
      : tipo === 'entrega'
        ? `${cilindros} ${n === 1 ? 'entregado' : 'entregados'}${destino === null ? '' : ` a ${destino}`}`
        : `${cilindros} ${n === 1 ? 'recibido' : 'recibidos'}${destino === null ? '' : ` de ${destino}`}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  const botonCopiar = (
    <button
      type="button"
      onClick={() => void copiar()}
      className="h-[50px] w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white text-base font-semibold active:bg-fondo"
    >
      {copiado ? 'Copiado' : 'Copiar texto'}
    </button>
  );

  return (
    <div className="px-4 pt-10 pb-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-gracia text-white">
          <Tilde className="size-10" trazo={2.6} />
        </span>
        <h1 className="mt-4 font-titulo text-[29px] leading-tight font-bold tracking-tight">
          Lote confirmado
        </h1>
        <p className="mt-1 text-base text-tinta-2">{bajada}</p>
      </div>

      <dl className="mt-7 divide-y divide-linea rounded-2xl border border-linea bg-white">
        <Dato termino="Fecha">
          {formatearFecha(lote.fecha)} · {lote.hora}
        </Dato>
        <Dato termino="Operador">{perfil.nombre}</Dato>
        {lote.numero !== null && (
          <Dato termino="Remito">
            <span className="font-mono font-bold">{formatearRemito(lote.numero)}</span>
          </Dato>
        )}
      </dl>

      {n > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-xs font-bold tracking-wider text-tinta-2 uppercase">
            Cilindros del lote
          </h2>
          <ul className="divide-y divide-linea rounded-2xl border border-linea bg-white">
            {lote.series.map((serie, i) => {
              const cilindro = cilindroPorSerie(estado, serie);
              return (
                <li key={`${serie}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-mono text-[17px] font-bold">{serie}</span>
                  {cilindro !== null && (
                    <span className="text-sm text-tinta-2">
                      {nombreKilos(cilindro.kg)} · {(lote.gases[i] ?? cilindro.tipoGas).toLowerCase()}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {lote.avisos.length > 0 && (
        <div className="mt-4 flex gap-2.5 rounded-2xl border border-vencer-borde bg-vencer-suave p-4 text-vencer">
          <Alerta className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Avisos del lote</p>
            <ul className="mt-1 space-y-1">
              {lote.avisos.map((a, i) => (
                <li key={`${a.serie}-${i}`} className="text-sm">
                  {a.mensaje}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {n > 0 && (
        <p className="mt-4 flex gap-2 text-sm text-tinta-2">
          <Reloj className="mt-0.5 size-4 shrink-0" />
          {tipo === 'entrega'
            ? `El reloj arranca hoy. Los primeros ${DIAS_GRACIA} días no generan cargo.`
            : `El reloj de ${n === 1 ? 'este cilindro' : 'estos cilindros'} se detuvo hoy.`}
        </p>
      )}

      <div className="mt-6 space-y-2">
        {whatsapp !== null ? (
          <>
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="flex h-[58px] w-full items-center justify-center gap-2 rounded-[15px] bg-tinta font-titulo text-[17px] font-bold text-white active:bg-marca-tinta"
            >
              <WhatsApp className="size-5" trazo={2} />
              Mandar por WhatsApp
            </a>
            <div className="grid grid-cols-2 gap-2">
              {botonCopiar}
              <button
                type="button"
                onClick={alTerminar}
                className="h-[50px] w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white text-base font-semibold active:bg-fondo"
              >
                Escanear otro
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={alTerminar}
              className="h-[58px] w-full rounded-[15px] bg-tinta font-titulo text-[17px] font-bold text-white active:bg-marca-tinta"
            >
              Escanear otro
            </button>
            {botonCopiar}
          </>
        )}

        {/* El error se nota acá, en el momento: por eso deshacer está a mano. */}
        {n > 0 && (
          <button
            type="button"
            onClick={() => setDeshaciendo(true)}
            className="h-[50px] w-full text-base font-semibold text-cargo active:bg-cargo-suave"
          >
            Deshacer este lote
          </button>
        )}
      </div>

      {deshaciendo && (
        <DeshacerLote
          titulo={bajada}
          movimientos={lote.movimientos}
          alCerrar={() => setDeshaciendo(false)}
          alTerminar={alTerminar}
        />
      )}
    </div>
  );
}

function Dato({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-sm text-tinta-2">{termino}</dt>
      <dd className="text-right text-base font-semibold">{children}</dd>
    </div>
  );
}
