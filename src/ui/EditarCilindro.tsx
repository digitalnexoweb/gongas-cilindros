import { useEffect, useState } from 'react';

import { tarifasPorTamano } from '../datos/repositorio';
import { formatearPesos } from '../dominio/arriendo';
import type { Cilindro, Tamano } from '../dominio/tipos';
import { useEstado } from '../estado/ProveedorEstado';
import { Encabezado } from './Encabezado';
import {
  Campo,
  ErrorDeFormulario,
  Opciones,
  claseBotonPrincipal,
  claseBotonSecundario,
  leerMonto,
} from './Formulario';

/**
 * Tamaño, gas, tarifa propia y baja de un cilindro. La serie no se edita: es
 * la que está impresa en la etiqueta. Solo el administrador llega acá.
 */
export function EditarCilindro({
  cilindro,
  enUnCliente,
  alVolver,
}: {
  cilindro: Cilindro;
  /** Un cilindro en un cliente no se puede dar de baja: primero se recibe. */
  enUnCliente: boolean;
  alVolver(): void;
}) {
  const { editarCilindro } = useEstado();

  const [tamano, setTamano] = useState<Tamano>(cilindro.tamano);
  const [tipoGas, setTipoGas] = useState(cilindro.tipoGas);
  const [tarifa, setTarifa] = useState(cilindro.tarifaMensual === null ? '' : String(cilindro.tarifaMensual));
  const [activo, setActivo] = useState(cilindro.activo);
  const [porTamano, setPorTamano] = useState<Record<Tamano, number> | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tarifasPorTamano()
      .then(setPorTamano)
      .catch(() => setPorTamano(null));
  }, []);

  const monto = leerMonto(tarifa);
  const listo = monto !== null && tipoGas.trim() !== '' && !guardando;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo || monto === null) return;

        setGuardando(true);
        setError(null);
        editarCilindro(cilindro.id, { tamano, tipoGas: tipoGas.trim(), tarifaMensual: monto, activo })
          .then(alVolver)
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo guardar el cilindro.');
          })
          .finally(() => setGuardando(false));
      }}
    >
      <Encabezado titulo={`Editar ${cilindro.serie}`} alVolver={alVolver} />

      <div className="space-y-5 px-4 pt-4 pb-6">
        <Opciones<Tamano>
          etiqueta="Tamaño"
          opciones={[
            { valor: 'chico', texto: 'Chico' },
            { valor: 'grande', texto: 'Grande' },
          ]}
          valor={tamano}
          alCambiar={(nuevo) => {
            setTamano(nuevo);
            // La tarifa se completa con la del tamaño nuevo; se puede ajustar después.
            if (porTamano !== null && nuevo !== tamano) setTarifa(String(porTamano[nuevo]));
          }}
        />

        <Campo etiqueta="Tipo de gas" valor={tipoGas} alCambiar={setTipoGas} />

        <Campo
          etiqueta="Tarifa mensual"
          valor={tarifa}
          alCambiar={setTarifa}
          modo="decimal"
          prefijo="$"
          ayuda={
            tarifa.trim() !== '' && monto === null
              ? 'Escribí solo el número, por ejemplo 480.'
              : porTamano !== null
                ? `La de su tamaño es ${formatearPesos(porTamano[tamano])}. Si ponés otra, queda como precio propio de este cilindro.`
                : undefined
          }
        />

        <Opciones<'si' | 'no'>
          etiqueta="Estado"
          opciones={[
            { valor: 'si', texto: 'En uso' },
            { valor: 'no', texto: 'Dado de baja' },
          ]}
          valor={activo ? 'si' : 'no'}
          alCambiar={(v) => setActivo(v === 'si')}
        />
        {!activo && enUnCliente && (
          <p className="-mt-3 rounded-xl border border-vencer-borde bg-vencer-suave p-3 text-sm text-vencer">
            Este cilindro está en un cliente. Primero hay que recibirlo, después darlo de baja.
          </p>
        )}
        {!activo && !enUnCliente && (
          <p className="-mt-3 text-sm text-tinta-2">
            Queda con su historial, pero si alguien lo escanea la app avisa que está dado de baja.
          </p>
        )}

        <ErrorDeFormulario mensaje={error} />

        <div className="space-y-2">
          <button type="submit" disabled={!listo || (!activo && enUnCliente)} className={claseBotonPrincipal}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={alVolver} className={claseBotonSecundario}>
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
