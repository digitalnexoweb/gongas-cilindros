import { useCallback, useEffect, useState } from 'react';

import { tarifasPorKilos } from '../../datos/repositorio';
import { formatearPesos } from '../../dominio/arriendo';
import { nombreKilos } from '../../dominio/tipos';
import { useEstado } from '../../estado/ProveedorEstado';
import { Encabezado } from '../Encabezado';
import { Campo, ErrorDeFormulario, claseBotonPrincipal, leerMonto } from '../Formulario';
import { Reloj } from '../iconos';

/**
 * El precio mensual de cada peso. Al cambiarlo cambian también los cilindros
 * de ese peso que tenían el precio anterior; los que tienen un precio propio,
 * puesto en su ficha, quedan como estaban.
 */
export function PantallaTarifas({ alVolver }: { alVolver(): void }) {
  const [tarifas, setTarifas] = useState<{ kg: number; tarifa: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    tarifasPorKilos()
      .then(setTarifas)
      .catch((falla: unknown) => {
        setError(falla instanceof Error ? falla.message : 'No se pudieron cargar las tarifas.');
      });
  }, []);

  useEffect(cargar, [cargar]);

  return (
    <>
      <Encabezado titulo="Tarifas" bajada="Precio por mes de cada peso, en pesos" alVolver={alVolver} />

      <div className="space-y-4 px-4 pt-4 pb-6">
        <ErrorDeFormulario mensaje={error} />
        {tarifas === null && error === null && <p className="text-sm text-tinta-2">Cargando…</p>}

        {tarifas?.map(({ kg, tarifa }) => (
          <TarifaDeKilos
            key={kg}
            kg={kg}
            actual={tarifa}
            alCambiar={(nueva) => setTarifas(tarifas.map((t) => (t.kg === kg ? { kg, tarifa: nueva } : t)))}
          />
        ))}

        {tarifas !== null && <AgregarPeso existentes={tarifas.map((t) => t.kg)} alAgregar={cargar} />}

        <p className="flex gap-2 text-sm text-tinta-2">
          <Reloj className="mt-0.5 size-4 shrink-0" />
          El importe se calcula con la tarifa de hoy: si la cambiás, también cambia lo que ya
          acumularon los cilindros que están en clientes.
        </p>
      </div>
    </>
  );
}

function TarifaDeKilos({
  kg,
  actual,
  alCambiar,
}: {
  kg: number;
  actual: number;
  alCambiar(nueva: number): void;
}) {
  const { estado, cambiarTarifaDeKilos } = useEstado();

  const [texto, setTexto] = useState(String(actual));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const nueva = leerMonto(texto);
  const cuantos = estado.cilindros.filter((c) => c.kg === kg).length;
  const listo = nueva !== null && nueva !== actual && !guardando;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo || nueva === null) return;

        setGuardando(true);
        setError(null);
        setHecho(null);
        cambiarTarifaDeKilos(kg, nueva)
          .then((cambiados) => {
            alCambiar(nueva);
            setHecho(
              cambiados === 1
                ? 'Listo. Se actualizó 1 cilindro.'
                : `Listo. Se actualizaron ${cambiados} cilindros.`,
            );
          })
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo cambiar la tarifa.');
          })
          .finally(() => setGuardando(false));
      }}
      className="space-y-3 rounded-2xl border border-linea bg-white p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-titulo text-xl font-bold">{nombreKilos(kg)}</h2>
        <span className="text-sm text-tinta-2">{cuantos === 1 ? '1 cilindro' : `${cuantos} cilindros`}</span>
      </div>

      <Campo
        etiqueta={`Hoy: ${formatearPesos(actual)} por mes`}
        valor={texto}
        alCambiar={(v) => {
          setTexto(v);
          setHecho(null);
        }}
        modo="decimal"
        prefijo="$"
        ayuda={texto.trim() !== '' && nueva === null ? 'Escribí solo el número, por ejemplo 480.' : undefined}
      />

      <ErrorDeFormulario mensaje={error} />
      {hecho !== null && (
        <p role="status" className="text-sm font-semibold text-gracia">
          {hecho}
        </p>
      )}

      <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
        {guardando ? 'Guardando…' : `Cambiar tarifa de ${nombreKilos(kg)}`}
      </button>
    </form>
  );
}

/** Un peso nuevo con su tarifa, para cuando Joaquín incorpore cilindros de otro tamaño. */
function AgregarPeso({ existentes, alAgregar }: { existentes: number[]; alAgregar(): void }) {
  const { agregarKilos } = useEstado();

  const [kgTexto, setKgTexto] = useState('');
  const [tarifaTexto, setTarifaTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kg = leerMonto(kgTexto);
  const tarifa = leerMonto(tarifaTexto);
  const repetido = kg !== null && existentes.includes(kg);
  const listo = kg !== null && kg > 0 && !repetido && tarifa !== null && !guardando;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo || kg === null || tarifa === null) return;

        setGuardando(true);
        setError(null);
        agregarKilos(kg, tarifa)
          .then(() => {
            setKgTexto('');
            setTarifaTexto('');
            alAgregar();
          })
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo agregar el peso.');
          })
          .finally(() => setGuardando(false));
      }}
      className="space-y-3 rounded-2xl border border-dashed border-linea-fuerte bg-white p-4"
    >
      <h2 className="font-titulo text-xl font-bold">Agregar un peso</h2>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          etiqueta="Kilos"
          valor={kgTexto}
          alCambiar={setKgTexto}
          modo="decimal"
          ayuda={repetido ? 'Ese ya está.' : undefined}
        />
        <Campo etiqueta="Tarifa por mes" valor={tarifaTexto} alCambiar={setTarifaTexto} modo="decimal" prefijo="$" />
      </div>
      <ErrorDeFormulario mensaje={error} />
      <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
        {guardando ? 'Agregando…' : 'Agregar'}
      </button>
    </form>
  );
}
