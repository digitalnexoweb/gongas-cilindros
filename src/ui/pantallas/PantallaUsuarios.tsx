import { useCallback, useEffect, useState } from 'react';

import type { Rol } from '../../datos/filas';
import { editarUsuario, listarUsuarios, type Usuario } from '../../datos/repositorio';
import { useEstado } from '../../estado/ProveedorEstado';
import { Encabezado } from '../Encabezado';
import {
  Campo,
  ErrorDeFormulario,
  Opciones,
  claseBotonPrincipal,
  claseBotonSecundario,
} from '../Formulario';
import { Adelante } from '../iconos';

/**
 * Las cuentas, para el administrador: activar las nuevas, cambiar nombre y
 * rol, desactivar a quien ya no trabaja. Nada se borra: el historial dice
 * quién hizo cada movimiento.
 */
export function PantallaUsuarios({ alVolver }: { alVolver(): void }) {
  const { perfil, estado } = useEstado();

  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await listarUsuarios());
      setError(null);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : 'No se pudo cargar la lista.');
    }
  }, []);

  // Se vuelve a pedir cuando cambia algo en la base: alguien que se registra
  // mientras Joaquín mira la lista aparece solo.
  useEffect(() => {
    void cargar();
  }, [cargar, estado]);

  if (editando !== null) {
    return (
      <EditarUsuario
        usuario={editando}
        esUnoMismo={editando.id === perfil.id}
        alVolver={() => setEditando(null)}
        alGuardar={async (datos) => {
          await editarUsuario(editando.id, datos);
          await cargar();
          setEditando(null);
        }}
      />
    );
  }

  // Las nuevas y las desactivadas a propósito van juntas: la base no distingue
  // una de otra, y para las dos lo que se hace es lo mismo, activarla o no.
  const pendientes = (usuarios ?? []).filter((u) => !u.activo);
  const resto = (usuarios ?? []).filter((u) => u.activo);

  return (
    <>
      <Encabezado titulo="Usuarios" alVolver={alVolver} />

      <div className="px-4 pt-4 pb-6">
        <ErrorDeFormulario mensaje={error} />

        {usuarios === null && error === null && <p className="text-sm text-tinta-2">Cargando…</p>}

        {pendientes.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-xs font-bold tracking-wider text-vencer uppercase">
              Sin acceso
            </h2>
            <ul className="divide-y divide-linea rounded-2xl border border-vencer-borde bg-white">
              {pendientes.map((u) => (
                <li key={u.id} className="flex items-center gap-1 pr-3">
                  <button
                    type="button"
                    onClick={() => setEditando(u)}
                    className="min-w-0 flex-1 py-3 pl-4 text-left active:bg-fondo"
                  >
                    <span className="block truncate text-base font-semibold">{u.nombre}</span>
                    <span className="block truncate text-sm text-tinta-2">{u.email}</span>
                  </button>
                  <BotonActivar usuario={u} alActivar={cargar} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-tinta-2">
              Las cuentas nuevas aparecen acá. Activar la deja como estaba: una nueva entra como
              empleado, que ve todo menos la plata. El rol se cambia tocando el nombre.
            </p>
          </section>
        )}

        {resto.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-bold tracking-wider text-tinta-2 uppercase">Cuentas</h2>
            <ul className="divide-y divide-linea rounded-2xl border border-linea bg-white">
              {resto.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setEditando(u)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fondo"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">
                        {u.nombre}
                        {u.id === perfil.id && <span className="font-normal text-tinta-2"> (vos)</span>}
                      </span>
                      <span className="block truncate text-sm text-tinta-2">{u.email}</span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="block font-semibold">
                        {u.rol === 'admin' ? 'Administrador' : 'Empleado'}
                      </span>
                      <span className={`block ${u.activo ? 'text-gracia' : 'text-cargo'}`}>
                        {u.activo ? 'Activa' : 'Desactivada'}
                      </span>
                    </span>
                    <Adelante className="size-5 shrink-0 text-tinta-3" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 text-sm text-tinta-2">
          Para sumar a alguien: que abra el link de la app y toque{' '}
          <strong className="text-tinta">Crear cuenta</strong>. Va a aparecer arriba, en{' '}
          <strong className="text-tinta">Sin acceso</strong>, hasta que la actives.
        </p>
      </div>
    </>
  );
}

function BotonActivar({ usuario, alActivar }: { usuario: Usuario; alActivar(): Promise<void> }) {
  const [activando, setActivando] = useState(false);

  return (
    <button
      type="button"
      disabled={activando}
      onClick={() => {
        setActivando(true);
        editarUsuario(usuario.id, { nombre: usuario.nombre, rol: usuario.rol, activo: true })
          .then(alActivar)
          .catch((falla: unknown) => {
            window.alert(falla instanceof Error ? falla.message : 'No se pudo activar.');
          })
          .finally(() => setActivando(false));
      }}
      className="h-11 shrink-0 rounded-[15px] bg-tinta px-4 text-sm font-bold text-white active:bg-marca-tinta disabled:bg-linea-fuerte"
    >
      {activando ? 'Activando…' : 'Activar'}
    </button>
  );
}

function EditarUsuario({
  usuario,
  esUnoMismo,
  alGuardar,
  alVolver,
}: {
  usuario: Usuario;
  esUnoMismo: boolean;
  alGuardar(datos: { nombre: string; rol: Rol; activo: boolean }): Promise<void>;
  alVolver(): void;
}) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = nombre.trim() !== '' && !guardando;

  function guardar(datos: { nombre: string; rol: Rol; activo: boolean }) {
    setGuardando(true);
    setError(null);
    alGuardar(datos)
      .catch((falla: unknown) => {
        setError(falla instanceof Error ? falla.message : 'No se pudo guardar.');
      })
      .finally(() => setGuardando(false));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (listo) guardar({ nombre: nombre.trim(), rol, activo });
      }}
    >
      <Encabezado titulo={usuario.nombre} bajada={usuario.email} alVolver={alVolver} />

      <div className="space-y-5 px-4 pt-4 pb-6">
        <Campo
          etiqueta="Nombre"
          valor={nombre}
          alCambiar={setNombre}
          ayuda="Es el que figura en los movimientos que haga de acá en adelante."
        />

        <Opciones<Rol>
          etiqueta="Rol"
          opciones={[
            { valor: 'operador', texto: 'Empleado' },
            { valor: 'admin', texto: 'Administrador' },
          ]}
          valor={rol}
          alCambiar={setRol}
        />
        <p className="-mt-3 text-sm text-tinta-2">
          {rol === 'admin'
            ? 'Ve la plata y puede administrar usuarios, clientes y tarifas.'
            : 'Escanea y ve cilindros, clientes y avisos, pero no ve ningún importe.'}
        </p>

        <Opciones<'si' | 'no'>
          etiqueta="Cuenta"
          opciones={[
            { valor: 'si', texto: 'Activa' },
            { valor: 'no', texto: 'Desactivada' },
          ]}
          valor={activo ? 'si' : 'no'}
          alCambiar={(v) => setActivo(v === 'si')}
        />
        {!activo && (
          <p className="-mt-3 text-sm text-tinta-2">
            No puede entrar ni ver nada. Sus movimientos quedan en el historial con su nombre.
          </p>
        )}

        {esUnoMismo && (rol !== 'admin' || !activo) && (
          <p className="rounded-xl border border-vencer-borde bg-vencer-suave p-3 text-sm text-vencer">
            Es tu propia cuenta: si te quitás el rol o la desactivás, dejás de poder administrar.
          </p>
        )}

        <ErrorDeFormulario mensaje={error} />

        <div className="space-y-2">
          <button type="submit" disabled={!listo} className={claseBotonPrincipal}>
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
