import { useState, type ReactNode } from 'react';

import { useSesion } from '../../estado/ProveedorEstado';

const CLAVE_MINIMA = 8;

const claseCampo =
  'mt-1.5 h-14 w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white px-4 text-base focus:border-marca focus:outline-none';

const claseBotonPrincipal =
  'h-[58px] w-full rounded-[15px] bg-tinta font-titulo text-[17px] font-bold text-white active:bg-marca-tinta disabled:bg-linea-fuerte disabled:text-tinta-2';

/**
 * Entrar con mail y contraseña, o crear una cuenta. La sesión queda abierta en
 * el celular hasta cerrarla.
 *
 * Una cuenta nueva nace desactivada: después de crearla se ve la pantalla de
 * "tu cuenta no está activa" hasta que el administrador la activa.
 */
export function PantallaIngreso() {
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');

  return (
    // Fondo blanco porque el logo viene con fondo blanco: sobre el gris se vería el recuadro.
    <div className="flex min-h-dvh flex-col justify-center gap-6 bg-white px-6 py-10">
      <div>
        <h1>
          <img src="/logo-gongas.png" alt="GONGAS" className="h-11 w-auto" />
        </h1>
        <p className="mt-3 font-titulo text-xl font-bold tracking-tight">
          {modo === 'entrar' ? 'Control de cilindros' : 'Crear cuenta'}
        </p>
      </div>

      {modo === 'entrar' ? (
        <FormularioEntrar alCrearCuenta={() => setModo('crear')} />
      ) : (
        <FormularioCrear alVolver={() => setModo('entrar')} />
      )}
    </div>
  );
}

function FormularioEntrar({ alCrearCuenta }: { alCrearCuenta(): void }) {
  const { ingresar } = useSesion();

  const [mail, setMail] = useState('');
  const [clave, setClave] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.trim());
  const listo = mailValido && clave !== '' && !entrando;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo) return;

        setEntrando(true);
        setError(null);
        ingresar(mail.trim(), clave)
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo entrar.');
          })
          .finally(() => setEntrando(false));
      }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <Campo etiqueta="Mail">
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            className={claseCampo}
          />
        </Campo>

        <Campo etiqueta="Contraseña">
          <input
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className={claseCampo}
          />
        </Campo>
      </div>

      <MensajeDeError mensaje={error} />

      <div className="space-y-2">
        <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={alCrearCuenta}
          className="h-12 w-full rounded-[15px] text-base font-semibold text-marca active:bg-fondo"
        >
          ¿Sos nuevo? Crear cuenta
        </button>
      </div>
    </form>
  );
}

function FormularioCrear({ alVolver }: { alVolver(): void }) {
  const { crearCuenta } = useSesion();

  const [nombre, setNombre] = useState('');
  const [mail, setMail] = useState('');
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisarMail, setRevisarMail] = useState(false);

  const mailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.trim());
  const claveCorta = clave !== '' && clave.length < CLAVE_MINIMA;
  const noCoinciden = repetida !== '' && repetida !== clave;
  const listo =
    nombre.trim() !== '' &&
    mailValido &&
    clave.length >= CLAVE_MINIMA &&
    repetida === clave &&
    !creando;

  if (revisarMail) {
    return (
      <div className="space-y-6">
        <p className="text-base text-tinta-2">
          Te mandamos un mail a <strong className="text-tinta">{mail.trim()}</strong>. Abrilo para
          confirmar la cuenta, y después pedile al administrador que la active.
        </p>
        <button type="button" onClick={alVolver} className={claseBotonPrincipal}>
          Volver a entrar
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo) return;

        setCreando(true);
        setError(null);
        crearCuenta(nombre.trim(), mail.trim(), clave)
          // Con sesión abierta, la app pasa sola a "tu cuenta no está activa".
          .then((conSesion) => {
            if (!conSesion) setRevisarMail(true);
          })
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo crear la cuenta.');
          })
          .finally(() => setCreando(false));
      }}
      className="space-y-6"
    >
      <p className="text-sm text-tinta-2">
        La cuenta queda en espera hasta que el administrador la active.
      </p>

      <div className="space-y-4">
        <Campo etiqueta="Tu nombre" ayuda="Es el que va a figurar en cada movimiento que hagas.">
          <input
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseCampo}
          />
        </Campo>

        <Campo etiqueta="Mail">
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            className={claseCampo}
          />
        </Campo>

        <Campo
          etiqueta="Contraseña"
          ayuda={claveCorta ? `Tiene que tener ${CLAVE_MINIMA} caracteres o más.` : undefined}
          aviso={claveCorta}
        >
          <input
            type="password"
            autoComplete="new-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className={claseCampo}
          />
        </Campo>

        <Campo
          etiqueta="Repetí la contraseña"
          ayuda={noCoinciden ? 'No coincide con la de arriba.' : undefined}
          aviso={noCoinciden}
        >
          <input
            type="password"
            autoComplete="new-password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            className={claseCampo}
          />
        </Campo>
      </div>

      <MensajeDeError mensaje={error} />

      <div className="space-y-2">
        <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
          {creando ? 'Creando…' : 'Crear cuenta'}
        </button>

        <button
          type="button"
          onClick={alVolver}
          className="h-12 w-full rounded-[15px] text-base font-semibold text-marca active:bg-fondo"
        >
          Ya tengo cuenta
        </button>
      </div>
    </form>
  );
}

function Campo({
  etiqueta,
  ayuda,
  aviso = false,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  aviso?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-tinta-2">{etiqueta}</span>
      {children}
      {ayuda !== undefined && (
        <span className={`mt-1 block text-sm ${aviso ? 'text-cargo' : 'text-tinta-2'}`}>{ayuda}</span>
      )}
    </label>
  );
}

function MensajeDeError({ mensaje }: { mensaje: string | null }) {
  if (mensaje === null) return null;
  return (
    <p role="alert" className="rounded-xl border border-cargo-borde bg-cargo-suave p-3 text-sm text-cargo">
      {mensaje}
    </p>
  );
}
