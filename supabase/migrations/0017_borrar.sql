-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — Borrar lo deshecho y borrar clientes sin historia
--
-- Un movimiento deshecho (0016) ya no tiene ningún efecto: el arriendo volvió
-- a como estaba. Por eso, y solo por eso, se puede borrar del todo. Un
-- movimiento vigente sigue siendo intocable.
--
-- Un cliente se borra solo si nunca tuvo una entrega vigente: si tiene
-- historia real, borrarlo se llevaría registros de plata.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────── La única excepción a la inmutabilidad

-- Las funciones de abajo marcan la transacción antes de borrar; los triggers
-- dejan pasar solo ese borrado. Desde afuera no sirve: los usuarios no tienen
-- permiso de delete sobre estas tablas, y la marca dura lo que la transacción.
create or replace function public.movimientos_son_inmutables() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('gongas.borrando_deshechos', true) = 'si' then
    return old;
  end if;

  raise exception 'Los movimientos no se editan ni se borran.'
    using errcode = 'restrict_violation';
end
$$;

create or replace function public.anulaciones_son_inmutables() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('gongas.borrando_deshechos', true) = 'si' then
    return old;
  end if;

  raise exception 'Lo que se deshizo no se edita ni se borra.'
    using errcode = 'restrict_violation';
end
$$;

-- Borra esos movimientos, que ya tienen que estar comprobados como deshechos.
-- Interna: no se le da permiso a nadie.
create function public.borrar_movimientos_deshechos(p_ids uuid[]) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_borrados integer;
begin
  if exists (
    select 1 from public.movimientos m
    where m.id = any (p_ids)
      and not exists (select 1 from public.anulaciones a where a.movimiento_id = m.id)
  ) then
    raise exception 'Hay un movimiento que no está deshecho.' using errcode = 'check_violation';
  end if;

  -- Después de deshacer, ningún arriendo apunta a ellos; si alguno apuntara, mejor no tocar nada.
  if exists (
    select 1 from public.arriendos a
    where a.abierto_por = any (p_ids) or a.cerrado_por = any (p_ids)
  ) then
    raise exception 'Hay un arriendo que todavía depende de ese movimiento.' using errcode = 'check_violation';
  end if;

  perform set_config('gongas.borrando_deshechos', 'si', true);

  delete from public.anulaciones where movimiento_id = any (p_ids);
  delete from public.movimientos where id = any (p_ids);
  get diagnostics v_borrados = row_count;

  perform set_config('gongas.borrando_deshechos', '', true);

  return v_borrados;
end
$$;

revoke execute on function public.borrar_movimientos_deshechos(uuid[]) from public, anon, authenticated;

-- ───────────────────────────────────────────────────── borrar_deshechos

-- Cualquier usuario activo, como deshacer. Todo o nada.
create function public.borrar_deshechos(p_movimientos uuid[]) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pedidos uuid[];
  v_serie text;
begin
  if not public.usuario_activo() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_pedidos
  from unnest(coalesce(p_movimientos, '{}'::uuid[])) x
  where x is not null;

  if cardinality(v_pedidos) = 0 then
    raise exception 'No hay nada para borrar.' using errcode = 'check_violation';
  end if;

  if (select count(*) from public.movimientos m where m.id = any (v_pedidos)) <> cardinality(v_pedidos) then
    raise exception 'Algún movimiento no existe. No se borró nada.' using errcode = 'no_data_found';
  end if;

  select c.serie into v_serie
  from public.movimientos m
  join public.cilindros c on c.id = m.cilindro_id
  where m.id = any (v_pedidos)
    and not exists (select 1 from public.anulaciones a where a.movimiento_id = m.id)
  limit 1;

  if found then
    raise exception 'El movimiento del % no está deshecho: solo se borra lo deshecho. No se borró nada.', v_serie
      using errcode = 'check_violation';
  end if;

  return public.borrar_movimientos_deshechos(v_pedidos);
end
$$;

revoke execute on function public.borrar_deshechos(uuid[]) from public, anon;
grant execute on function public.borrar_deshechos(uuid[]) to authenticated;

-- ───────────────────────────────────────────────────── borrar_cliente

-- Solo el administrador, y solo un cliente sin historia real.
create function public.borrar_cliente(p_cliente_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_deshechos uuid[];
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede borrar clientes.' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.clientes c where c.id = p_cliente_id for update;
  if not found then
    raise exception 'El cliente no existe.' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.arriendos a where a.cliente_id = p_cliente_id and a.fecha_devolucion is null) then
    raise exception 'Tiene cilindros en su poder: no se puede borrar.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.arriendos a where a.cliente_id = p_cliente_id)
     or exists (
       select 1 from public.movimientos m
       where m.cliente_id = p_cliente_id
         and not exists (select 1 from public.anulaciones a where a.movimiento_id = m.id)
     )
     or exists (select 1 from public.avisos v where v.cliente_id = p_cliente_id)
  then
    raise exception 'Tiene entregas registradas: no se puede borrar sin perder su historia.'
      using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(m.id), '{}') into v_deshechos
  from public.movimientos m
  where m.cliente_id = p_cliente_id;

  if cardinality(v_deshechos) > 0 then
    perform public.borrar_movimientos_deshechos(v_deshechos);
  end if;

  delete from public.clientes where id = p_cliente_id;
end
$$;

revoke execute on function public.borrar_cliente(uuid) from public, anon;
grant execute on function public.borrar_cliente(uuid) to authenticated;
