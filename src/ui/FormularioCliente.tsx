import { useState } from 'react';

import type { Cliente, TipoCliente } from '../dominio/tipos';
import { Encabezado } from './Encabezado';
import { Campo, ErrorDeFormulario, Opciones, claseBotonPrincipal, claseBotonSecundario } from './Formulario';

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
  borrar,
}: {
  titulo: string;
  textoBoton: string;
  inicial?: Omit<Cliente, 'id'>;
  alGuardar(datos: Omit<Cliente, 'id'>): Promise<void>;
  alVolver(): void;
  /**
   * Solo al editar, y solo para el administrador. `motivo` es por qué no se
   * puede borrar, o `null` si se puede.
   */
  borrar?: { motivo: string | null; alBorrar(): Promise<void> };
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCliente>(inicial?.tipo ?? 'empresa');
  const [documento, setDocumento] = useState(inicial?.documento ?? '');
  const [telefono, setTelefono] = useState(inicial?.telefono ?? '+598');
  const [email, setEmail] = useState(inicial?.email ?? '');
  const [direccion, setDireccion] = useState(inicial?.direccion ?? '');
  const [ciudad, setCiudad] = useState(inicial?.ciudad ?? '');
  const [notas, setNotas] = useState(inicial?.notas ?? '');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValido = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const listo = nombre.trim() !== '' && emailValido && !guardando;

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
          email: email.trim(),
          direccion: direccion.trim(),
          ciudad: ciudad.trim(),
          notas: notas.trim(),
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
        <Campo
          etiqueta="Mail (opcional)"
          valor={email}
          alCambiar={setEmail}
          modo="email"
          ayuda={
            emailValido
              ? 'Para los avisos automáticos. Sin mail, a este cliente solo se le avisa por WhatsApp.'
              : 'Eso no parece un mail. Revisalo o dejalo vacío.'
          }
        />
        <Campo etiqueta="Dirección (opcional)" valor={direccion} alCambiar={setDireccion} />
        <Campo etiqueta="Ciudad o departamento (opcional)" valor={ciudad} alCambiar={setCiudad} />
        <label className="block">
          <span className="block text-sm font-medium text-tinta-2">Notas (opcional)</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            placeholder="Horarios, indicaciones de entrega…"
            className="mt-1.5 w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white p-3 text-base placeholder:text-tinta-3 focus:border-marca focus:outline-none"
          />
        </label>

        <ErrorDeFormulario mensaje={error} />

        <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
          {guardando ? 'Guardando…' : textoBoton}
        </button>

        {borrar !== undefined && <BorrarCliente nombre={inicial?.nombre ?? ''} {...borrar} />}
      </div>
    </form>
  );
}

/** Al pie de la edición: borrar el cliente, con confirmación, o el motivo por el que no se puede. */
function BorrarCliente({
  nombre,
  motivo,
  alBorrar,
}: {
  nombre: string;
  motivo: string | null;
  alBorrar(): Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirmar() {
    if (borrando) return;
    setBorrando(true);
    setError(null);
    alBorrar().catch((falla: unknown) => {
      setError(falla instanceof Error ? falla.message : 'No se pudo borrar el cliente.');
      setBorrando(false);
      setConfirmando(false);
    });
  }

  return (
    <div className="mt-4 border-t border-linea pt-5">
      {confirmando ? (
        <div className="space-y-2 rounded-2xl border border-cargo-borde bg-cargo-suave p-4">
          <p className="text-base font-semibold text-cargo">¿Borrar a {nombre} para siempre?</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmando(false)} className={claseBotonSecundario}>
              No
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={borrando}
              className="h-[50px] w-full rounded-[15px] bg-cargo text-base font-bold text-white disabled:opacity-60"
            >
              {borrando ? 'Borrando…' : 'Sí, borrar'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={motivo !== null}
          className="h-[50px] w-full rounded-[15px] border-[1.5px] border-cargo-borde bg-white text-base font-semibold text-cargo active:bg-cargo-suave disabled:border-linea disabled:text-tinta-3"
        >
          Borrar cliente
        </button>
      )}

      {motivo !== null && <p className="mt-2 text-sm text-tinta-2">{motivo}</p>}
      <ErrorDeFormulario mensaje={error} />
    </div>
  );
}
