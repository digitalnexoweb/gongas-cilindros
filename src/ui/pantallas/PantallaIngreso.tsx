import { useState } from 'react';

import { useSesion } from '../../estado/ProveedorEstado';

/** Mail y contraseña. La sesión queda abierta en el celular hasta cerrarla. */
export function PantallaIngreso() {
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
      className="flex min-h-dvh flex-col justify-center gap-6 px-6 pb-16"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">GONGAS</h1>
        <p className="mt-1 text-slate-500">Control de cilindros</p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700">Mail</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            className="mt-1.5 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-base focus:border-slate-900 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="mt-1.5 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-base focus:border-slate-900 focus:outline-none"
          />
        </label>
      </div>

      {error !== null && (
        <p role="alert" className="rounded-xl border border-cargo-borde bg-cargo-suave p-3 text-sm text-cargo">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!listo}
        className="h-14 rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700 disabled:bg-slate-300"
      >
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
