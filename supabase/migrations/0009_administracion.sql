-- GONGAS — lo que el administrador hace desde la app (etapa C).
--
-- Editar clientes y perfiles va directo contra la tabla: las reglas de 0002 ya
-- se lo permiten solo al administrador. Acá van las tres cosas que necesitan
-- más que una regla:
--
--   · usuarios(): la lista de cuentas con su mail, que vive en auth.users y la
--     app no puede leer;
--   · cambiar_tarifa_por_tamano(): el precio de un tamaño y el de sus cilindros,
--     en una sola transacción;
--   · editar_cilindro(): el cilindro y su tarifa juntos, con la regla de que no
--     se da de baja uno que está en un cliente.
--
-- Las tres rechazan a quien no es administrador activo, aunque la llame
-- directo por la API.

-- ───────────────────────────────────────────────────── Usuarios

create function public.usuarios()
returns table (
  id uuid,
  email text,
  nombre text,
  rol text,
  activo boolean,
  creado_en timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  return query
    select p.id, u.email::text, p.nombre, p.rol, p.activo, p.creado_en
    from public.perfiles p
    join auth.users u on u.id = p.id
    -- Primero las que esperan que alguien las active.
    order by p.activo, p.creado_en desc;
end
$$;

-- ───────────────────────────────────────────────────── Tarifas

-- Cambia el precio de un tamaño y el de cada cilindro de ese tamaño que todavía
-- tenía el precio viejo. Los que tenían un precio propio, puesto a mano, no se
-- tocan. Devuelve cuántos cilindros cambiaron.
create function public.cambiar_tarifa_por_tamano(p_tamano text, p_tarifa numeric)
returns integer
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
  from public.tarifas_por_tamano t
  where t.tamano = p_tamano
  for update;

  if not found then
    raise exception 'Tamaño inválido: "%".', p_tamano using errcode = 'check_violation';
  end if;

  update public.tarifas_por_tamano
  set tarifa_mensual = p_tarifa
  where tamano = p_tamano;

  update public.tarifas t
  set tarifa_mensual = p_tarifa
  from public.cilindros c
  where c.id = t.cilindro_id
    and c.tamano = p_tamano
    and t.tarifa_mensual = v_vieja;

  get diagnostics v_cambiados = row_count;
  return v_cambiados;
end
$$;

-- ───────────────────────────────────────────────────── Cilindros

-- La serie no se edita: es la que está impresa en la etiqueta.
create function public.editar_cilindro(
  p_id uuid,
  p_tamano text,
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
  set tamano = p_tamano,
      tipo_gas = coalesce(nullif(btrim(p_tipo_gas), ''), 'acetileno'),
      activo = coalesce(p_activo, true)
  where id = p_id;

  insert into public.tarifas (cilindro_id, tarifa_mensual)
  values (p_id, p_tarifa)
  on conflict (cilindro_id) do update set tarifa_mensual = excluded.tarifa_mensual;
end
$$;

-- Como en 0006: sin sesión, nada. Con sesión se pueden llamar, y cada una
-- verifica adentro que sea el administrador.
revoke execute on function public.usuarios() from public, anon;
revoke execute on function public.cambiar_tarifa_por_tamano(text, numeric) from public, anon;
revoke execute on function public.editar_cilindro(uuid, text, text, numeric, boolean) from public, anon;

grant execute on function public.usuarios() to authenticated;
grant execute on function public.cambiar_tarifa_por_tamano(text, numeric) to authenticated;
grant execute on function public.editar_cilindro(uuid, text, text, numeric, boolean) to authenticated;
