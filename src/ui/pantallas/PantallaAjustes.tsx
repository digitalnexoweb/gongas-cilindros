import { useEffect, useState, type ReactNode } from 'react';

import { listarUsuarios } from '../../datos/repositorio';
import { useEstado, useSesion } from '../../estado/ProveedorEstado';
import { Bloque, Dato } from '../Dato';
import { Encabezado } from '../Encabezado';
import { claseBotonSecundario } from '../Formulario';
import { Adelante } from '../iconos';

/**
 * La sección 6.6 pone Ajustes fuera de la navegación, así que se entra por el
 * nombre arriba a la derecha en Escanear. Acá están la cuenta, las etiquetas y,
 * para el administrador, la administración.
 */
export function PantallaAjustes({
  alVolver,
  alAbrirEtiquetas,
  alAbrirUsuarios,
  alAbrirTarifas,
}: {
  alVolver(): void;
  alAbrirEtiquetas(): void;
  alAbrirUsuarios(): void;
  alAbrirTarifas(): void;
}) {
  const { perfil, estado, puedeVerPlata } = useEstado();
  const { cerrarSesion } = useSesion();
  const esAdmin = perfil.rol === 'admin';

  // Cuántas cuentas están sin acceso: las nuevas esperan acá que alguien las active.
  const [sinAcceso, setSinAcceso] = useState(0);
  useEffect(() => {
    if (!esAdmin) return;
    listarUsuarios()
      .then((us) => setSinAcceso(us.filter((u) => !u.activo).length))
      .catch(() => setSinAcceso(0));
  }, [esAdmin, estado]);

  return (
    <>
      <Encabezado titulo="Ajustes" alVolver={alVolver} />

      <div className="pb-6">
        {esAdmin && (
          <Bloque titulo="Administración">
            <Fila
              titulo="Usuarios"
              detalle="Activar cuentas nuevas, cambiar roles, desactivar"
              globo={sinAcceso > 0 ? `${sinAcceso} sin acceso` : undefined}
              alTocar={alAbrirUsuarios}
            />
            {puedeVerPlata && (
              <Fila
                titulo="Tarifas"
                detalle="El precio por mes de cada tamaño"
                alTocar={alAbrirTarifas}
              />
            )}
            <p className="px-4 py-3 text-sm text-tinta-2">
              Los clientes y los cilindros se editan desde su ficha, con el botón Editar.
            </p>
          </Bloque>
        )}

        <Bloque titulo="Tu cuenta">
          <Dato etiqueta="Conectado como">{perfil.nombre}</Dato>
          <Dato etiqueta="Rol">{esAdmin ? 'Administrador' : 'Empleado'}</Dato>

          <div className="p-4">
            <button type="button" onClick={() => void cerrarSesion()} className={claseBotonSecundario}>
              Cerrar sesión
            </button>
          </div>
        </Bloque>

        <Bloque titulo="Etiquetas">
          <Fila
            titulo="Etiquetas QR"
            detalle="Grilla imprimible en A4 para recortar y pegar"
            alTocar={alAbrirEtiquetas}
          />
        </Bloque>
      </div>
    </>
  );
}

function Fila({
  titulo,
  detalle,
  globo,
  alTocar,
}: {
  titulo: string;
  detalle: string;
  globo?: ReactNode;
  alTocar(): void;
}) {
  return (
    <button
      type="button"
      onClick={alTocar}
      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:bg-fondo"
    >
      <span className="min-w-0">
        <span className="block text-base font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-sm text-tinta-2">{detalle}</span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {globo !== undefined && (
          <span className="rounded-full bg-cargo px-2.5 py-1 text-xs font-bold text-white">{globo}</span>
        )}
        <Adelante className="size-5 text-tinta-3" />
      </span>
    </button>
  );
}
