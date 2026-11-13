-- GONGAS — el tamaño de un cilindro pasa a ser su peso en kilos.
--
-- Hasta acá había dos tamaños, chico y grande, cada uno con su tarifa. Joaquín
-- piensa sus cilindros en kilos (2, 4, 6, 7 kg), así que la app también.
--
-- Dos tablas, como antes, porque la plata va aparte:
--   · tamanos: los pesos que existen. La ven todos: un operario elige el peso
--     al dar de alta un cilindro.
--   · tarifas_por_kilos: la tarifa de cada peso. Solo el administrador.
--
-- La lógica de plata no cambia: el importe sigue saliendo de la tarifa de cada
-- cilindro. Lo único que cambia es de dónde sale esa tarifa al darlo de alta.

-- ───────────────────────────────────────────────────── Los pesos

create table public.tamanos (
  kg numeric(5, 1) primary key check (kg > 0),
  -- Uno que ya se usó no se borra: se deja de ofrecer.
  activo boolean not null default true
);

create table public.tarifas_por_kilos (
  kg numeric(5, 1) primary key references public.tamanos (kg),
  tarifa_mensual numeric(10, 2) not null check (tarifa_mensual >= 0)
);

-- Provisorias: 2 y 4 kg como el chico de antes, 6 y 7 kg como el grande.
insert into public.tamanos (kg) values (2), (4), (6), (7);
insert into public.tarifas_por_kilos (kg, tarifa_mensual) values (2, 380), (4, 380), (6, 440), (7, 440);

revoke all on public.tamanos, public.tarifas_por_kilos from anon, authenticated;
grant select, update on public.tamanos to authenticated;
grant select, update on public.tarifas_por_kilos to authenticated;

alter table public.tamanos enable row level security;
alter table public.tarifas_por_kilos enable row level security;

create policy tamanos_ver on public.tamanos
  for select to authenticated
  using (public.usuario_activo());

create policy tamanos_admin_edita on public.tamanos
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy tarifas_por_kilos_admin_ve on public.tarifas_por_kilos
  for select to authenticated
  using (public.es_admin());

-- Se cambia con cambiar_tarifa_de_kilos(), que también mueve los cilindros.
-- Esta regla queda por si el administrador la edita directo.
create policy tarifas_por_kilos_admin_edita on public.tarifas_por_kilos
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ───────────────────────────────────────────────────── El cilindro, en kilos

-- Las funciones viejas usan la columna `tamano`: se borran antes que ella.
drop function public.alta_cilindro(text, text, text);
drop function public.corregir_tamano(text, text);
drop function public.editar_cilindro(uuid, text, text, numeric, boolean);
drop function public.cambiar_tarifa_por_tamano(text, numeric);

alter table public.cilindros add column kg numeric(5, 1) references public.tamanos (kg);
-- Si había cilindros: chico pasa a 4 kg y grande a 7 kg, que conservan su tarifa.
update public.cilindros set kg = case tamano when 'grande' then 7 else 4 end;
alter table public.cilindros alter column kg set not null;
alter table public.cilindros drop column tamano;

drop table public.tarifas_por_tamano;

-- ───────────────────────────────────────────────────── Alta

create function public.alta_cilindro(
  p_serie text,
  p_kg numeric,
  p_tipo_gas text default 'Acetileno'
) returns public.cilindros
language plpgsql security definer
set search_path = ''
as $$
declare
  v_serie text := upper(btrim(coalesce(p_serie, '')));
  v_tarifa numeric;
  v_gas text;
  v_cilindro public.cilindros;
begin
  if not public.usuario_activo() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.tamanos t where t.kg = p_kg and t.activo) then
    raise exception 'Ese peso no está en la lista: % kg.', p_kg using errcode = 'check_violation';
  end if;

  select t.tarifa_mensual into v_tarifa from public.tarifas_por_kilos t where t.kg = p_kg;

  select t.nombre into v_gas
  from public.tipos_gas t
  where lower(t.nombre) = lower(coalesce(nullif(btrim(p_tipo_gas), ''), 'Acetileno'));

  if not found then
    raise exception 'Ese tipo de gas no está en la lista.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.cilindros c where c.serie = v_serie) then
    raise exception 'La serie % ya existe.', v_serie using errcode = 'unique_violation';
  end if;

  insert into public.cilindros (serie, kg, tipo_gas)
  values (v_serie, p_kg, v_gas)
  returning * into v_cilindro;

  if v_tarifa is not null then
    insert into public.tarifas (cilindro_id, tarifa_mensual)
    values (v_cilindro.id, v_tarifa);
  end if;

  return v_cilindro;
end
$$;

revoke execute on function public.alta_cilindro(text, numeric, text) from public, anon;
grant execute on function public.alta_cilindro(text, numeric, text) to authenticated;

-- ───────────────────────────────────────────────────── Corregir el peso

-- Cualquier usuario activo: es un dato físico del cilindro. La tarifa sigue al
-- peso nuevo, salvo que el cilindro tuviera un precio propio, que se respeta.
create function public.corregir_kilos(p_serie text, p_kg numeric) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cilindro public.cilindros;
  v_vieja numeric;
  v_nueva numeric;
begin
  if not public.usuario_activo() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.tamanos t where t.kg = p_kg and t.activo) then
    raise exception 'Ese peso no está en la lista: % kg.', p_kg using errcode = 'check_violation';
  end if;

  select c.* into v_cilindro
  from public.cilindros c
  where c.serie = upper(btrim(coalesce(p_serie, '')))
  for update;

  if not found then
    raise exception 'El cilindro no existe.' using errcode = 'no_data_found';
  end if;

  if v_cilindro.kg = p_kg then
    return false;
  end if;

  select t.tarifa_mensual into v_vieja from public.tarifas_por_kilos t where t.kg = v_cilindro.kg;
  select t.tarifa_mensual into v_nueva from public.tarifas_por_kilos t where t.kg = p_kg;

  update public.cilindros set kg = p_kg where id = v_cilindro.id;

  if v_nueva is not null then
    update public.tarifas
    set tarifa_mensual = v_nueva
    where cilindro_id = v_cilindro.id and tarifa_mensual is not distinct from v_vieja;

    insert into public.tarifas (cilindro_id, tarifa_mensual)
    values (v_cilindro.id, v_nueva)
    on conflict (cilindro_id) do nothing;
  end if;

  return true;
end
$$;

revoke execute on function public.corregir_kilos(text, numeric) from public, anon;
grant execute on function public.corregir_kilos(text, numeric) to authenticated;

-- ───────────────────────────────────────────────────── Editar (administrador)

create function public.editar_cilindro(
  p_id uuid,
  p_kg numeric,
  p_tipo_gas text,
  p_tarifa numeric,
  p_activo boolean
) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.cilindros c where c.id = p_id for update;
  if not found then
    raise exception 'El cilindro no existe.' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from public.tamanos t where t.kg = p_kg) then
    raise exception 'Ese peso no está en la lista: % kg.', p_kg using errcode = 'check_violation';
  end if;

  if p_tarifa is null or p_tarifa < 0 then
    raise exception 'La tarifa tiene que ser un número mayor o igual a cero.'
      using errcode = 'check_violation';
  end if;

  if not coalesce(p_activo, true) and exists (
    select 1 from public.arriendos a
    where a.cilindro_id = p_id and a.fecha_devolucion is null
  ) then
    raise exception 'Este cilindro está en un cliente. Primero hay que recibirlo, después darlo de baja.'
      using errcode = 'restrict_violation';
  end if;

  update public.cilindros
  set kg = p_kg,
      tipo_gas = coalesce(nullif(btrim(p_tipo_gas), ''), 'Acetileno'),
      activo = coalesce(p_activo, true)
  where id = p_id;

  insert into public.tarifas (cilindro_id, tarifa_mensual)
  values (p_id, p_tarifa)
  on conflict (cilindro_id) do update set tarifa_mensual = excluded.tarifa_mensual;
end
$$;

revoke execute on function public.editar_cilindro(uuid, numeric, text, numeric, boolean) from public, anon;
grant execute on function public.editar_cilindro(uuid, numeric, text, numeric, boolean) to authenticated;

-- ───────────────────────────────────────────────────── Tarifas (administrador)

-- Cambia la tarifa de un peso y la de cada cilindro de ese peso que todavía
-- tenía la tarifa vieja. Devuelve cuántos cilindros cambiaron.
create function public.cambiar_tarifa_de_kilos(p_kg numeric, p_tarifa numeric) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vieja numeric;
  v_cambiados integer;
begin
  if not public.es_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  if p_tarifa is null or p_tarifa < 0 then
    raise exception 'La tarifa tiene que ser un número mayor o igual a cero.'
      using errcode = 'check_violation';
  end if;

  select t.tarifa_mensual into v_vieja
  from public.tarifas_por_kilos t
  where t.kg = p_kg
  for update;

  if not found then
    raise exception 'Ese peso no está en la lista: % kg.', p_kg using errcode = 'check_violation';
  end if;

  update public.tarifas_por_kilos set tarifa_mensual = p_tarifa where kg = p_kg;

  update public.tarifas t
  set tarifa_mensual = p_tarifa
  from public.cilindros c
  where c.id = t.cilindro_id
    and c.kg = p_kg
    and t.tarifa_mensual = v_vieja;

  get diagnostics v_cambiados = row_count;
  return v_cambiados;
end
$$;

-- Un peso nuevo con su tarifa, de una vez.
create function public.agregar_kilos(p_kg numeric, p_tarifa numeric) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  if p_kg is null or p_kg <= 0 then
    raise exception 'El peso tiene que ser mayor que cero.' using errcode = 'check_violation';
  end if;

  if p_tarifa is null or p_tarifa < 0 then
    raise exception 'La tarifa tiene que ser un número mayor o igual a cero.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.tamanos t where t.kg = p_kg) then
    raise exception 'Ese peso ya está en la lista.' using errcode = 'unique_violation';
  end if;

  insert into public.tamanos (kg) values (p_kg);
  insert into public.tarifas_por_kilos (kg, tarifa_mensual) values (p_kg, p_tarifa);
end
$$;

revoke execute on function public.cambiar_tarifa_de_kilos(numeric, numeric) from public, anon;
revoke execute on function public.agregar_kilos(numeric, numeric) from public, anon;
grant execute on function public.cambiar_tarifa_de_kilos(numeric, numeric) to authenticated;
grant execute on function public.agregar_kilos(numeric, numeric) to authenticated;

-- ───────────────────────────────────────────────────── En vivo

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tamanos, public.tarifas_por_kilos;
  end if;
end
$$;
