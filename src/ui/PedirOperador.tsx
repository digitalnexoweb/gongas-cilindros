import { useState } from 'react';

/**
 * "El nombre elegido al abrir la app", de la sección 4. Se pregunta una sola
 * vez: después queda guardado y cada movimiento sale a nombre de esa persona.
 */
export function PedirOperador({ alElegir }: { alElegir(nombre: string): void }) {
  const [nombre, setNombre] = useState('');
  const listo = nombre.trim() !== '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (listo) alElegir(nombre.trim());
      }}
      className="flex min-h-dvh flex-col justify-center gap-8 px-6 pb-16"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">GONGAS</h1>
        <p className="mt-1 text-slate-500">Control de cilindros</p>
      </div>

      <div>
        <label htmlFor="operador" className="block text-base font-semibold">
          ¿Quién está operando?
        </label>
        <p className="mt-1 text-sm text-slate-500">
          Queda registrado en cada entrega y cada devolución.
        </p>

        <input
          id="operador"
          type="text"
          autoFocus
          autoComplete="name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          className="mt-3 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-base placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={!listo}
        className="h-14 rounded-xl bg-slate-900 text-base font-semibold text-white active:bg-slate-700 disabled:bg-slate-300"
      >
        Empezar
      </button>
    </form>
  );
}
