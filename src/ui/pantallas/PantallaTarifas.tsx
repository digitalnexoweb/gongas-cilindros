import { useEffect, useState } from 'react';

import { tarifasPorTamano } from '../../datos/repositorio';
import { formatearPesos } from '../../dominio/arriendo';
import type { Tamano } from '../../dominio/tipos';
import { useEstado } from '../../estado/ProveedorEstado';
import { Encabezado } from '../Encabezado';
import { Campo, ErrorDeFormulario, claseBotonPrincipal, leerMonto } from '../Formulario';
import { Reloj } from '../iconos';

const TAMANOS: { tamano: Tamano; nombre: string }[] = [
  { tamano: 'chico', nombre: 'Chico' },
  { tamano: 'grande', nombre: 'Grande' },
];

/**
 * El precio mensual de cada tamaño. Al cambiarlo cambian también los cilindros
 * de ese tamaño que tenían el precio anterior; los que tienen un precio propio,
 * puesto en su ficha, quedan como estaban.
 */
export function PantallaTarifas({ alVolver }: { alVolver(): void }) {
  const [tarifas, setTarifas] = useState<Record<Tamano, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tarifasPorTamano()
      .then(setTarifas)
      .catch((falla: unknown) => {
        setError(falla instanceof Error ? falla.message : 'No se pudieron cargar las tarifas.');
      });
  }, []);

  return (
    <>
      <Encabezado titulo="Tarifas" bajada="Precio por mes, en pesos" alVolver={alVolver} />

      <div className="space-y-4 px-4 pt-4 pb-6">
        <ErrorDeFormulario mensaje={error} />
        {tarifas === null && error === null && <p className="text-sm text-tinta-2">Cargando…</p>}

        {tarifas !== null &&
          TAMANOS.map(({ tamano, nombre }) => (
            <TarifaDeTamano
              key={tamano}
              tamano={tamano}
              nombre={nombre}
              actual={tarifas[tamano]}
              alCambiar={(nueva) => setTarifas({ ...tarifas, [tamano]: nueva })}
            />
          ))}

        <p className="flex gap-2 text-sm text-tinta-2">
          <Reloj className="mt-0.5 size-4 shrink-0" />
          El importe se calcula con la tarifa de hoy: si la cambiás, también cambia lo que ya
          acumularon los cilindros que están en clientes.
        </p>
      </div>
    </>
  );
}

function TarifaDeTamano({
  tamano,
  nombre,
  actual,
  alCambiar,
}: {
  tamano: Tamano;
  nombre: string;
  actual: number;
  alCambiar(nueva: number): void;
}) {
  const { estado, cambiarTarifaPorTamano } = useEstado();

  const [texto, setTexto] = useState(String(actual));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const nueva = leerMonto(texto);
  const cuantos = estado.cilindros.filter((c) => c.tamano === tamano).length;
  const listo = nueva !== null && nueva !== actual && !guardando;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo || nueva === null) return;

        setGuardando(true);
        setError(null);
        setHecho(null);
        cambiarTarifaPorTamano(tamano, nueva)
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
        <h2 className="font-titulo text-xl font-bold">{nombre}</h2>
        <span className="text-sm text-tinta-2">
          {cuantos === 1 ? '1 cilindro' : `${cuantos} cilindros`}
        </span>
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
        {guardando ? 'Guardando…' : `Cambiar tarifa de ${nombre.toLowerCase()}`}
      </button>
    </form>
  );
}
