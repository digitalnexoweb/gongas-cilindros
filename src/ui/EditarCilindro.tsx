import { useEffect, useState } from 'react';

import { tarifasPorKilos } from '../datos/repositorio';
import { formatearPesos } from '../dominio/arriendo';
import type { Cilindro } from '../dominio/tipos';
import { useEstado } from '../estado/ProveedorEstado';
import { ElegirKilos, pesosActivos } from './ElegirKilos';
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
 * Peso, gas, tarifa propia y baja de un cilindro. La serie no se edita: es
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
  const { estado, editarCilindro } = useEstado();
  const gases = (estado.tiposGas ?? []).filter((g) => g.activo).map((g) => g.nombre);

  const pesos = pesosActivos(estado.pesos);
  const [kg, setKg] = useState(cilindro.kg);
  const [tipoGas, setTipoGas] = useState(cilindro.tipoGas);
  const [tarifa, setTarifa] = useState(cilindro.tarifaMensual === null ? '' : String(cilindro.tarifaMensual));
  const [activo, setActivo] = useState(cilindro.activo);
  // La tarifa de cada peso, para proponerla al cambiar de peso.
  const [porKilos, setPorKilos] = useState<Map<number, number> | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tarifasPorKilos()
      .then((lista) => setPorKilos(new Map(lista.map((t) => [t.kg, t.tarifa]))))
      .catch(() => setPorKilos(null));
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
        editarCilindro(cilindro.id, { kg, tipoGas: tipoGas.trim(), tarifaMensual: monto, activo })
          .then(alVolver)
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo guardar el cilindro.');
          })
          .finally(() => setGuardando(false));
      }}
    >
      <Encabezado titulo={`Editar ${cilindro.serie}`} alVolver={alVolver} />

      <div className="space-y-5 px-4 pt-4 pb-6">
        <ElegirKilos
          etiqueta="Peso"
          pesos={pesos}
          valor={kg}
          alCambiar={(nuevo) => {
            setKg(nuevo);
            // La tarifa se completa con la del peso nuevo; se puede ajustar después.
            const deEsePeso = porKilos?.get(nuevo);
            if (deEsePeso !== undefined && nuevo !== kg) setTarifa(String(deEsePeso));
          }}
        />

        <label className="block">
          <span className="block text-sm font-medium text-tinta-2">Último gas</span>
          <select
            value={tipoGas}
            onChange={(e) => setTipoGas(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white px-3 text-base"
          >
            {/* El que tiene, aunque ya no se ofrezca, más los de la lista. */}
            {[...new Set([tipoGas, ...gases])].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-sm text-tinta-2">
            El que se propone la próxima vez que se entregue. En cada entrega se puede elegir otro.
          </span>
        </label>

        <Campo
          etiqueta="Tarifa mensual"
          valor={tarifa}
          alCambiar={setTarifa}
          modo="decimal"
          prefijo="$"
          ayuda={
            tarifa.trim() !== '' && monto === null
              ? 'Escribí solo el número, por ejemplo 480.'
              : porKilos?.get(kg) !== undefined
                ? `La de ${kg} kg es ${formatearPesos(porKilos.get(kg) ?? 0)}. Si ponés otra, queda como precio propio de este cilindro.`
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
