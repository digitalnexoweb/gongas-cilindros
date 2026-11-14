-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Deshacer un movimiento confirmado por error
--
-- Los movimientos siguen siendo inmutables (0001): no se borran ni se editan.
-- Deshacer deja una anulación al lado del movimiento y devuelve los arriendos
-- a como estaban antes de él.
--
-- La regla que lo hace seguro: solo se deshace el último movimiento de cada
-- cilindro. Así nunca hay que adivinar cómo estaba: el arriendo que abrió o
-- cerró ese movimiento está anotado (abierto_por, cerrado_por).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────── Las anulaciones

create table public.anulaciones (
  movimiento_id uuid primary key references public.movimientos (id),
  operador_id uuid not null references public.perfiles (id),
  -- Igual que en los movimientos: el nombre queda copiado.
  operador text not null,
  creado_en timestamptz not null default now()
);

create function public.anulaciones_son_inmutables() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Lo que se deshizo no se edita ni se borra.'
    using errcode = 'restrict_violation';
end
$$;

revoke execute on function public.anulaciones_son_inmutables() from public, anon, authenticated;

create trigger anulaciones_inmutables
  before update or delete on public.anulaciones
  for each row execute function public.anulaciones_son_inmutables();

revoke all on public.anulaciones from anon, authenticated;
grant select on public.anulaciones to authenticated;

alter table public.anulaciones enable row level security;

create policy anulaciones_ver on public.anulaciones
  for select to authenticated
  using (public.usuario_activo());

-- ───────────────────────────────────────────── Qué movimiento abrió y cerró cada arriendo

alter table public.arriendos
  add column abierto_por uuid unique references public.movimientos (id),
  add column cerrado_por uuid unique references public.movimientos (id);

-- Los arriendos que ya existen: se busca el movimiento que corresponde a cada
-- fecha. Fila por fila, para que dos arriendos no se queden con el mismo.
do $$
declare
  v_arriendo public.arriendos;
  v_movimiento uuid;
begin
  for v_arriendo in select a.* from public.arriendos a order by a.fecha_entrega, a.id loop
    select m.id into v_movimiento
    from public.movimientos m
    where m.tipo = 'entrega'
      and m.cilindro_id = v_arriendo.cilindro_id
      and m.cliente_id = v_arriendo.cliente_id
      and m.fecha = v_arriendo.fecha_entrega
      and not exists (select 1 from public.arriendos b where b.abierto_por = m.id)
    order by m.creado_en, m.id
    limit 1;

    update public.arriendos set abierto_por = v_movimiento where id = v_arriendo.id;
  end loop;

  for v_arriendo in
    select a.* from public.arriendos a where a.fecha_devolucion is not null order by a.fecha_devolucion, a.id
  loop
    select m.id into v_movimiento
    from public.movimientos m
    where m.cilindro_id = v_arriendo.cilindro_id
      and m.fecha = v_arriendo.fecha_devolucion
      and m.id is distinct from v_arriendo.abierto_por
      -- Lo cierra una devolución de ese cliente o una entrega a otro.
      and (
        (m.tipo = 'devolucion' and m.cliente_id = v_arriendo.cliente_id)
        or (m.tipo = 'entrega' and m.cliente_id is distinct from v_arriendo.cliente_id)
      )
      and (
        v_arriendo.abierto_por is null
        or m.creado_en >= (select o.creado_en from public.movimientos o where o.id = v_arriendo.abierto_por)
      )
      and not exists (select 1 from public.arriendos b where b.cerrado_por = m.id)
    order by m.creado_en, m.id
    limit 1;

    update public.arriendos set cerrado_por = v_movimiento where id = v_arriendo.id;
  end loop;
end
$$;

-- ───────────────────────────────────────────── confirmar_lote, anotando abierto_por y cerrado_por

-- La misma de 0013. Lo único nuevo: el movimiento se graba primero, y el
-- arriendo que abre o cierra queda apuntando a él.
create or replace function public.confirmar_lote(
  p_tipo text,
  p_series text[],
  p_cliente_id uuid default null,
  p_gases text[] default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_operador text;
  v_hoy date := public.hoy_montevideo();
  v_lote uuid := gen_random_uuid();
  v_numero integer := null;
  v_i integer;
  v_serie text;
  v_gas_pedido text;
  v_gas text;
  v_vistas text[] := '{}';
  v_cilindro public.cilindros;
  v_abierto public.arriendos;
  v_hay_abierto boolean;
  v_movimiento public.movimientos;
  v_movimientos jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
begin
  select p.nombre into v_operador
  from public.perfiles p
  where p.id = v_usuario and p.activo;

  if not found then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  if p_tipo is null or p_tipo not in ('entrega', 'devolucion') then
    raise exception 'Tipo de movimiento inválido: "%".', p_tipo using errcode = 'check_violation';
  end if;

  if p_tipo = 'entrega' then
    if p_cliente_id is null then
      raise exception 'Una entrega necesita un cliente.' using errcode = 'not_null_violation';
    end if;

    if not exists (select 1 from public.clientes c where c.id = p_cliente_id) then
      raise exception 'El cliente no existe.' using errcode = 'foreign_key_violation';
    end if;

    -- Antes de grabar nada: si algún gas no está en la lista, no entra el lote.
    if exists (
      select 1 from unnest(coalesce(p_gases, '{}'::text[])) g
      where nullif(btrim(g), '') is not null
        and not exists (select 1 from public.tipos_gas t where lower(t.nombre) = lower(btrim(g)) and t.activo)
    ) then
      raise exception 'Hay un tipo de gas que no está en la lista. No se grabó nada.'
        using errcode = 'check_violation';
    end if;
  end if;

  for v_i in 1 .. coalesce(array_length(p_series, 1), 0) loop
    v_serie := upper(btrim(coalesce(p_series[v_i], '')));
    v_gas_pedido := nullif(btrim(coalesce(p_gases[v_i], '')), '');

    if v_serie = any (v_vistas) then
      v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'serie_repetida');
      continue;
    end if;
    v_vistas := v_vistas || v_serie;

    select c.* into v_cilindro
    from public.cilindros c
    where c.serie = v_serie
    for update;

    if not found then
      v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'serie_desconocida');
      continue;
    end if;

    if v_numero is null then
      v_numero := nextval('public.numero_de_lote');
    end if;

    select a.* into v_abierto
    from public.arriendos a
    where a.cilindro_id = v_cilindro.id and a.fecha_devolucion is null;
    v_hay_abierto := found;

    if p_tipo = 'entrega' then
      -- El gas pedido, con el nombre como está en la lista; si no vino, el
      -- último con el que salió este cilindro.
      if v_gas_pedido is null then
        v_gas := v_cilindro.tipo_gas;
      else
        select t.nombre into v_gas from public.tipos_gas t where lower(t.nombre) = lower(v_gas_pedido);
      end if;

      update public.cilindros set tipo_gas = v_gas where id = v_cilindro.id;

      insert into public.movimientos (tipo, cilindro_id, cliente_id, fecha, lote_id, lote_numero, operador_id, operador, tipo_gas)
      values ('entrega', v_cilindro.id, p_cliente_id, v_hoy, v_lote, v_numero, v_usuario, v_operador, v_gas)
      returning * into v_movimiento;

      if v_hay_abierto and v_abierto.cliente_id = p_cliente_id then
        -- Ya estaba en este mismo cliente. NO se toca el arriendo: cerrarlo y
        -- abrir otro pondría el reloj en cero y borraría lo acumulado.
        v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'ya_en_este_cliente');
      else
        if v_hay_abierto then
          v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'ya_en_otro_cliente');
          update public.arriendos
          set fecha_devolucion = v_hoy, cerrado_por = v_movimiento.id
          where id = v_abierto.id;
        end if;

        insert into public.arriendos (cilindro_id, cliente_id, fecha_entrega, tipo_gas, abierto_por)
        values (v_cilindro.id, p_cliente_id, v_hoy, v_gas, v_movimiento.id);
      end if;
    else
      insert into public.movimientos (tipo, cilindro_id, cliente_id, fecha, lote_id, lote_numero, operador_id, operador, tipo_gas)
      values (
        'devolucion',
        v_cilindro.id,
        case when v_hay_abierto then v_abierto.cliente_id end,
        v_hoy, v_lote, v_numero, v_usuario, v_operador,
        -- Vuelve con el gas con el que había salido.
        case when v_hay_abierto then v_abierto.tipo_gas end
      )
      returning * into v_movimiento;

      if v_hay_abierto then
        update public.arriendos
        set fecha_devolucion = v_hoy, cerrado_por = v_movimiento.id
        where id = v_abierto.id;
      else
        v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'ya_en_stock');
      end if;
    end if;

    v_movimientos := v_movimientos || jsonb_build_object(
      'id', v_movimiento.id,
      'tipo', v_movimiento.tipo,
      'serie', v_serie,
      'cilindro_id', v_movimiento.cilindro_id,
      'cliente_id', v_movimiento.cliente_id,
      'fecha', v_movimiento.fecha,
      'tipo_gas', v_movimiento.tipo_gas
    );
  end loop;

  return jsonb_build_object(
    'lote_id', v_lote,
    'numero', v_numero,
    'fecha', v_hoy,
    'hora', to_char(now() at time zone 'America/Montevideo', 'HH24:MI'),
    'movimientos', v_movimientos,
    'avisos', v_avisos
  );
end
$$;

-- ───────────────────────────────────────────────────── deshacer_movimientos

-- Cualquier usuario activo, cualquier movimiento, todo o nada: si uno no se
-- puede deshacer, no se deshace ninguno y el error dice cuál y por qué.
create function public.deshacer_movimientos(p_movimientos uuid[]) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_operador text;
  v_pedidos uuid[];
  v_movimiento public.movimientos;
  v_serie text;
  v_ultimo uuid;
  v_arriendo public.arriendos;
  v_gas text;
  v_series text[] := '{}';
begin
  select p.nombre into v_operador
  from public.perfiles p
  where p.id = v_usuario and p.activo;

  if not found then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_pedidos
  from unnest(coalesce(p_movimientos, '{}'::uuid[])) x
  where x is not null;

  if cardinality(v_pedidos) = 0 then
    raise exception 'No hay nada para deshacer.' using errcode = 'check_violation';
  end if;

  if (select count(*) from public.movimientos m where m.id = any (v_pedidos)) <> cardinality(v_pedidos) then
    raise exception 'Algún movimiento no existe. No se deshizo nada.' using errcode = 'no_data_found';
  end if;

  -- Del más nuevo al más viejo: si se piden dos del mismo cilindro, primero
  -- se deshace el último y así el anterior pasa a ser el último.
  for v_movimiento in
    select m.* from public.movimientos m
    where m.id = any (v_pedidos)
    order by m.creado_en desc, m.id desc
  loop
    select c.serie into v_serie
    from public.cilindros c
    where c.id = v_movimiento.cilindro_id
    for update;

    if exists (select 1 from public.anulaciones a where a.movimiento_id = v_movimiento.id) then
      raise exception 'El % ya estaba deshecho. No se deshizo nada.', v_serie
        using errcode = 'check_violation';
    end if;

    select m.id into v_ultimo
    from public.movimientos m
    where m.cilindro_id = v_movimiento.cilindro_id
      and not exists (select 1 from public.anulaciones a where a.movimiento_id = m.id)
    order by m.creado_en desc, m.id desc
    limit 1;

    if v_ultimo is distinct from v_movimiento.id then
      raise exception 'El % tuvo otro movimiento después: hay que deshacer ese primero. No se deshizo nada.', v_serie
        using errcode = 'check_violation';
    end if;

    if v_movimiento.tipo = 'entrega' then
      select a.* into v_arriendo from public.arriendos a where a.abierto_por = v_movimiento.id;

      if found then
        if exists (select 1 from public.avisos v where v.arriendo_id = v_arriendo.id) then
          raise exception 'Al cliente del % ya se le mandó un aviso: esa entrega no se puede deshacer. No se deshizo nada.', v_serie
            using errcode = 'check_violation';
        end if;

        delete from public.arriendos where id = v_arriendo.id;
      elsif exists (
        select 1 from public.arriendos a
        where a.cilindro_id = v_movimiento.cilindro_id and a.fecha_devolucion is null and a.abierto_por is null
      ) then
        -- Un arriendo de antes de 0016 que no se pudo emparejar: mejor no tocarlo.
        raise exception 'La entrega del % es anterior a esta función y no se puede deshacer. No se deshizo nada.', v_serie
          using errcode = 'check_violation';
      end if;

      -- Si la entrega lo había sacado de otro cliente, vuelve a ese cliente.
      update public.arriendos
      set fecha_devolucion = null, cerrado_por = null
      where cerrado_por = v_movimiento.id;

      -- El gas vuelve al de la entrega anterior, si hubo.
      select m.tipo_gas into v_gas
      from public.movimientos m
      where m.cilindro_id = v_movimiento.cilindro_id
        and m.tipo = 'entrega'
        and m.tipo_gas is not null
        and m.id <> v_movimiento.id
        and (m.creado_en, m.id) < (v_movimiento.creado_en, v_movimiento.id)
        and not exists (select 1 from public.anulaciones a where a.movimiento_id = m.id)
      order by m.creado_en desc, m.id desc
      limit 1;

      if found then
        update public.cilindros set tipo_gas = v_gas where id = v_movimiento.cilindro_id;
      end if;
    else
      update public.arriendos
      set fecha_devolucion = null, cerrado_por = null
      where cerrado_por = v_movimiento.id;

      -- Una devolución con cliente cerró un arriendo; si no está anotado cuál,
      -- es de antes de 0016.
      if not found and v_movimiento.cliente_id is not null then
        raise exception 'La devolución del % es anterior a esta función y no se puede deshacer. No se deshizo nada.', v_serie
          using errcode = 'check_violation';
      end if;
    end if;

    insert into public.anulaciones (movimiento_id, operador_id, operador)
    values (v_movimiento.id, v_usuario, v_operador);

    v_series := v_series || v_serie;
  end loop;

  return jsonb_build_object('deshechos', cardinality(v_series), 'series', to_jsonb(v_series));
end
$$;

revoke execute on function public.deshacer_movimientos(uuid[]) from public, anon;
grant execute on function public.deshacer_movimientos(uuid[]) to authenticated;

-- ───────────────────────────────────────────────────── En vivo

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.anulaciones;
  end if;
end
$$;
