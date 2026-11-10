-- GONGAS — lo que escanea uno lo ven todos, sin recargar.
--
-- Supabase avisa en vivo de los cambios en las tablas que están en la
-- publicación `supabase_realtime`. Los avisos respetan las reglas por fila: a
-- un empleado no le llega un cambio de tarifas, y a un usuario desactivado no
-- le llega nada salvo su propio perfil, que es como la app se entera.
--
-- El `if exists` es para que esta migración también corra en el Postgres
-- embebido de los tests, donde esa publicación no existe.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.perfiles,
      public.clientes,
      public.cilindros,
      public.arriendos,
      public.movimientos,
      public.tarifas;
  end if;
end
$$;
