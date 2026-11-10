-- GONGAS — cerrar las funciones que no son para llamar desde afuera.
--
-- Supabase expone como API toda función del esquema `public`, y por defecto le
-- da permiso de ejecutarla a cualquiera, incluso sin sesión. El asesor de
-- seguridad lo marcó en cuatro funciones internas. Ninguna hacía daño —dos son
-- de trigger y dos solo le dicen a cada uno su propio estado— pero no hay
-- motivo para dejarlas abiertas.

-- Las de trigger no las llama nadie: las dispara la base. Que sigan
-- funcionando no depende de este permiso.
revoke execute on function public.crear_perfil() from public, anon, authenticated;
revoke execute on function public.no_dejar_sin_admin() from public, anon, authenticated;
revoke execute on function public.movimientos_son_inmutables() from public, anon, authenticated;

-- Estas las usan las reglas por fila, que corren como el usuario con sesión:
-- ese permiso tiene que quedar. Sin sesión, no.
revoke execute on function public.usuario_activo() from public, anon;
revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.hoy_montevideo() from public, anon;

grant execute on function public.usuario_activo() to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.hoy_montevideo() to authenticated;
