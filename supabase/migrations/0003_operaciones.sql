-- GONGAS — las escrituras.
--
-- Los arriendos y los movimientos se graban juntos, en una sola transacción,
-- o no se graba nada. Es lo que sostiene la regla de la sección 4 del SPEC: si
-- las dos cosas no se escriben a la vez, la ubicación deja de ser deducible.
--
-- Las reglas de confirmar_lote son las mismas que las de `confirmarLote` en
-- src/dominio/storage.ts, y hay un test de paridad que compara las dos.
--
-- Dos cosas que decide el servidor y no el celular: la fecha, en hora de
-- Montevideo, y quién es el operador, que sale de la sesión.

create function public.hoy_montevideo() returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone 'America/Montevideo')::date
$$;

-- ───────────────────────────────────────────────────── Alta de cilindro

-- La usa cualquier usuario activo al escanear una serie desconocida. La
-- tarifa la pone la base según el tamaño: quien da de alta no la ve ni la elige.
create function public.alta_cilindro(
  p_serie text,
  p_tamano text,
  p_tipo_gas text default 'acetileno'
) returns public.cilindros
language plpgsql security definer
set search_path = ''
as $$
declare
  v_serie text := upper(btrim(coalesce(p_serie, '')));
  v_tarifa numeric(10, 2);
  v_cilindro public.cilindros;
begin
  if not public.usuario_activo() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  select t.tarifa_mensual into v_tarifa
  from public.tarifas_por_tamano t
  where t.tamano = p_tamano;

  if not found then
    raise exception 'Tamaño inválido: "%".', p_tamano using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.cilindros c where c.serie = v_serie) then
    raise exception 'La serie % ya existe.', v_serie using errcode = 'unique_violation';
  end if;

  insert into public.cilindros (serie, tamano, tipo_gas)
  values (v_serie, p_tamano, coalesce(nullif(btrim(p_tipo_gas), ''), 'acetileno'))
  returning * into v_cilindro;

  insert into public.tarifas (cilindro_id, tarifa_mensual)
  values (v_cilindro.id, v_tarifa);

  return v_cilindro;
end
$$;

-- ───────────────────────────────────────────────────── Confirmar un lote

-- Devuelve { lote_id, fecha, movimientos: [...], avisos: [{ serie, tipo }] }.
-- Los avisos son las validaciones de la sección 6.1: avisan, no bloquean.
create function public.confirmar_lote(
  p_tipo text,
  p_series text[],
  p_cliente_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_operador text;
  v_hoy date := public.hoy_montevideo();
  v_lote uuid := gen_random_uuid();
  v_serie text;
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
  end if;

  foreach v_serie in array coalesce(p_series, '{}'::text[]) loop
    v_serie := upper(btrim(coalesce(v_serie, '')));

    if v_serie = any (v_vistas) then
      v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'serie_repetida');
      continue;
    end if;
    v_vistas := v_vistas || v_serie;

    -- `for update`: si otra persona está confirmando un lote con este mismo
    -- cilindro, esta transacción espera a que termine y ve el resultado.
    select c.* into v_cilindro
    from public.cilindros c
    where c.serie = v_serie
    for update;

    if not found then
      v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'serie_desconocida');
      continue;
    end if;

    select a.* into v_abierto
    from public.arriendos a
    where a.cilindro_id = v_cilindro.id and a.fecha_devolucion is null;

    v_hay_abierto := found;

    if p_tipo = 'entrega' then
      if v_hay_abierto and v_abierto.cliente_id = p_cliente_id then
        -- Ya estaba en este mismo cliente. NO se toca el arriendo: cerrarlo y
        -- abrir otro pondría el reloj en cero y borraría lo acumulado.
        v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'ya_en_este_cliente');
      else
        if v_hay_abierto then
          v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'ya_en_otro_cliente');

          update public.arriendos
          set fecha_devolucion = v_hoy
          where id = v_abierto.id;
        end if;

        insert into public.arriendos (cilindro_id, cliente_id, fecha_entrega)
        values (v_cilindro.id, p_cliente_id, v_hoy);
      end if;

      insert into public.movimientos (tipo, cilindro_id, cliente_id, fecha, lote_id, operador_id, operador)
      values ('entrega', v_cilindro.id, p_cliente_id, v_hoy, v_lote, v_usuario, v_operador)
      returning * into v_movimiento;
    else
      if v_hay_abierto then
        update public.arriendos
        set fecha_devolucion = v_hoy
        where id = v_abierto.id;
      else
        v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'ya_en_stock');
      end if;

      insert into public.movimientos (tipo, cilindro_id, cliente_id, fecha, lote_id, operador_id, operador)
      values (
        'devolucion',
        v_cilindro.id,
        case when v_hay_abierto then v_abierto.cliente_id end,
        v_hoy, v_lote, v_usuario, v_operador
      )
      returning * into v_movimiento;
    end if;

    v_movimientos := v_movimientos || jsonb_build_object(
      'id', v_movimiento.id,
      'tipo', v_movimiento.tipo,
      'serie', v_serie,
      'cilindro_id', v_movimiento.cilindro_id,
      'cliente_id', v_movimiento.cliente_id,
      'fecha', v_movimiento.fecha
    );
  end loop;

  return jsonb_build_object(
    'lote_id', v_lote,
    'fecha', v_hoy,
    'movimientos', v_movimientos,
    'avisos', v_avisos
  );
end
$$;

-- ───────────────────────────────────────────────────── Quién las puede llamar

-- Solo con sesión. Y aun con sesión, cada función vuelve a comprobar que el
-- usuario esté activo.
revoke execute on function public.alta_cilindro(text, text, text) from public, anon;
revoke execute on function public.confirmar_lote(text, text[], uuid) from public, anon;

grant execute on function public.alta_cilindro(text, text, text) to authenticated;
grant execute on function public.confirmar_lote(text, text[], uuid) to authenticated;
