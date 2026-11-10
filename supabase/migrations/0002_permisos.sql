-- GONGAS — quién puede qué.
--
--                                              Empleado   Joaquín
--   Ver clientes, cilindros, arriendos, mov.      sí         sí
--   Dar de alta un cliente                        sí         sí
--   Ver tarifas (la plata)                        NO         sí
--   Editar clientes, cilindros y tarifas          NO         sí
--   Ver y administrar usuarios                    NO         sí
--   Tocar arriendos o movimientos a mano          NO         NO
--
-- Los arriendos y los movimientos solo se escriben a través de las funciones
-- de 0003, que los graban juntos. Nadie los inserta ni los modifica directo.
--
-- Un usuario desactivado no ve nada, aunque tenga la sesión abierta.

-- ───────────────────────────────────────────────────── Quién es quién

-- Con `security definer` porque leen `perfiles`, que a su vez tiene reglas:
-- sin eso, la regla se consultaría a sí misma.

create function public.usuario_activo() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo
  )
$$;

create function public.es_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo and p.rol = 'admin'
  )
$$;

-- Cada cuenta nueva nace con su perfil, como empleado. El rol de
-- administrador se asigna después, a mano.
create function public.crear_perfil() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Sin nombre'
    )
  );
  return new;
end
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Que el sistema no se pueda quedar sin administrador por un toque de más.
create function public.no_dejar_sin_admin() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.rol = 'admin' and old.activo and not (new.rol = 'admin' and new.activo) then
    if not exists (
      select 1 from public.perfiles p
      where p.id <> old.id and p.rol = 'admin' and p.activo
    ) then
      raise exception 'Tiene que quedar al menos un administrador activo.'
        using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end
$$;

create trigger perfiles_no_dejar_sin_admin
  before update on public.perfiles
  for each row execute function public.no_dejar_sin_admin();

-- ───────────────────────────────────────────────────── Privilegios base

-- Primero se saca todo y después se da lo justo. Sin sesión no hay nada.
revoke all on
  public.perfiles, public.clientes, public.cilindros, public.arriendos,
  public.movimientos, public.tarifas, public.tarifas_por_tamano
from anon, authenticated;

grant select on
  public.perfiles, public.clientes, public.cilindros, public.arriendos,
  public.movimientos, public.tarifas, public.tarifas_por_tamano
to authenticated;

grant insert on public.clientes to authenticated;

grant update on
  public.perfiles, public.clientes, public.cilindros,
  public.tarifas, public.tarifas_por_tamano
to authenticated;

-- Nadie tiene insert, update ni delete sobre arriendos y movimientos, ni
-- delete sobre ninguna tabla: lo que no está otorgado acá, no se puede.

-- ───────────────────────────────────────────────────── Reglas por fila

alter table public.perfiles enable row level security;
alter table public.clientes enable row level security;
alter table public.cilindros enable row level security;
alter table public.arriendos enable row level security;
alter table public.movimientos enable row level security;
alter table public.tarifas enable row level security;
alter table public.tarifas_por_tamano enable row level security;

-- Perfiles: cada uno ve el suyo, para que la app sepa quién es y si está
-- activo. La lista completa y los cambios son del administrador.
create policy perfiles_ver on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or public.es_admin());

create policy perfiles_admin_modifica on public.perfiles
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Clientes: todos los ven y cualquiera puede dar de alta uno al entregar.
-- Corregir los datos de un cliente es del administrador.
create policy clientes_ver on public.clientes
  for select to authenticated
  using (public.usuario_activo());

create policy clientes_alta on public.clientes
  for insert to authenticated
  with check (public.usuario_activo());

create policy clientes_admin_edita on public.clientes
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Cilindros: todos los ven. El alta va por la función alta_cilindro.
create policy cilindros_ver on public.cilindros
  for select to authenticated
  using (public.usuario_activo());

create policy cilindros_admin_edita on public.cilindros
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Arriendos y movimientos: se ven, no se tocan.
create policy arriendos_ver on public.arriendos
  for select to authenticated
  using (public.usuario_activo());

create policy movimientos_ver on public.movimientos
  for select to authenticated
  using (public.usuario_activo());

-- La plata: solo el administrador.
create policy tarifas_admin_ve on public.tarifas
  for select to authenticated
  using (public.es_admin());

create policy tarifas_admin_edita on public.tarifas
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy tarifas_por_tamano_admin_ve on public.tarifas_por_tamano
  for select to authenticated
  using (public.es_admin());

create policy tarifas_por_tamano_admin_edita on public.tarifas_por_tamano
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());
