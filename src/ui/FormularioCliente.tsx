import { useState } from 'react';

import type { Cliente, TipoCliente } from '../dominio/tipos';
import { Encabezado } from './Encabezado';
import { Campo, ErrorDeFormulario, Opciones, claseBotonPrincipal } from './Formulario';

/**
 * Nombre, tipo, documento y teléfono. Sirve para el alta de 6.1, al entregar, y
 * para que el administrador corrija un cliente desde su ficha.
 */
export function FormularioCliente({
  titulo,
  textoBoton,
  inicial,
  alGuardar,
  alVolver,
}: {
  titulo: string;
  textoBoton: string;
  inicial?: Omit<Cliente, 'id'>;
  alGuardar(datos: Omit<Cliente, 'id'>): Promise<void>;
  alVolver(): void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCliente>(inicial?.tipo ?? 'empresa');
  const [documento, setDocumento] = useState(inicial?.documento ?? '');
  const [telefono, setTelefono] = useState(inicial?.telefono ?? '+598');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = nombre.trim() !== '' && !guardando;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo) return;

        setGuardando(true);
        setError(null);
        alGuardar({
          nombre: nombre.trim(),
          tipo,
          documento: documento.trim(),
          telefono: telefono.trim(),
        })
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo guardar el cliente.');
          })
          .finally(() => setGuardando(false));
      }}
    >
      <Encabezado titulo={titulo} alVolver={alVolver} />

      <div className="space-y-4 px-4 pt-4 pb-6">
        <Campo etiqueta="Nombre" valor={nombre} alCambiar={setNombre} autoFoco={inicial === undefined} />

        <Opciones<TipoCliente>
          etiqueta="Tipo"
          opciones={[
            { valor: 'empresa', texto: 'Empresa' },
            { valor: 'particular', texto: 'Particular' },
          ]}
          valor={tipo}
          alCambiar={setTipo}
        />

        <Campo
          etiqueta={tipo === 'empresa' ? 'RUT' : 'Cédula'}
          valor={documento}
          alCambiar={setDocumento}
          modo="numeric"
        />
        <Campo
          etiqueta="Teléfono"
          valor={telefono}
          alCambiar={setTelefono}
          modo="tel"
          ayuda="Con el +598, para que el aviso por WhatsApp llegue."
        />

        <ErrorDeFormulario mensaje={error} />

        <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
          {guardando ? 'Guardando…' : textoBoton}
        </button>
      </div>
    </form>
  );
}
