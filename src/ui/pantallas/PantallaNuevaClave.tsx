import { useState } from 'react';

import { ErrorDeFormulario, claseBotonPrincipal } from '../Formulario';

const CLAVE_MINIMA = 8;

const claseCampo =
  'mt-1.5 h-14 w-full rounded-[15px] border-[1.5px] border-linea-fuerte bg-white px-4 text-base focus:border-marca focus:outline-none';

/**
 * Elegir una contraseña nueva. Se usa en dos lugares:
 *
 * - al volver del link de "¿Te olvidaste la contraseña?": la sesión ya está
 *   abierta, no se pide la actual (`conActual` en false);
 * - desde Ajustes, para cambiarla: se pide la actual, para que nadie que
 *   agarre un celular desbloqueado la pueda cambiar.
 */
export function FormularioNuevaClave({
  conActual,
  textoBoton,
  alGuardar,
}: {
  conActual: boolean;
  textoBoton: string;
  alGuardar(nueva: string, actual: string): Promise<void>;
}) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const corta = nueva !== '' && nueva.length < CLAVE_MINIMA;
  const noCoinciden = repetida !== '' && repetida !== nueva;
  const listo =
    (!conActual || actual !== '') && nueva.length >= CLAVE_MINIMA && repetida === nueva && !guardando;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo) return;

        setGuardando(true);
        setError(null);
        alGuardar(nueva, actual)
          .catch((falla: unknown) => {
            setError(falla instanceof Error ? falla.message : 'No se pudo cambiar la contraseña.');
          })
          .finally(() => setGuardando(false));
      }}
      className="space-y-4"
    >
      {conActual && (
        <label className="block">
          <span className="block text-sm font-medium text-tinta-2">Contraseña actual</span>
          <input
            type="password"
            autoComplete="current-password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            className={claseCampo}
          />
        </label>
      )}

      <label className="block">
        <span className="block text-sm font-medium text-tinta-2">Contraseña nueva</span>
        <input
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className={claseCampo}
        />
        {corta && <span className="mt-1 block text-sm text-cargo">Tiene que tener {CLAVE_MINIMA} caracteres o más.</span>}
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-tinta-2">Repetí la contraseña nueva</span>
        <input
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className={claseCampo}
        />
        {noCoinciden && <span className="mt-1 block text-sm text-cargo">No coincide con la de arriba.</span>}
      </label>

      <ErrorDeFormulario mensaje={error} />

      <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
        {guardando ? 'Guardando…' : textoBoton}
      </button>
    </form>
  );
}

/** La pantalla que aparece al abrir la app desde el link del mail. */
export function PantallaNuevaClave({ alGuardar }: { alGuardar(nueva: string): Promise<void> }) {
  return (
    <div className="flex min-h-dvh flex-col justify-center gap-6 bg-white px-6 py-10">
      <div>
        <img src="/logo-gongas.png" alt="GONGAS" className="h-11 w-auto" />
        <h1 className="mt-3 font-titulo text-xl font-bold tracking-tight">Elegí una contraseña nueva</h1>
        <p className="mt-1 text-sm text-tinta-2">Con esta vas a entrar de ahora en más.</p>
      </div>

      <FormularioNuevaClave conActual={false} textoBoton="Guardar y entrar" alGuardar={(nueva) => alGuardar(nueva)} />
    </div>
  );
}
