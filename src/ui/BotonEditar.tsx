/** El botón del encabezado de una ficha. Solo lo ve el administrador. */
export function BotonEditar({ alTocar }: { alTocar(): void }) {
  return (
    <button
      type="button"
      onClick={alTocar}
      className="h-11 rounded-[15px] border-[1.5px] border-linea-fuerte bg-white px-4 text-sm font-semibold active:bg-fondo"
    >
      Editar
    </button>
  );
}
