-- GONGAS — el número de remito de cada lote: LOTE-0001, LOTE-0002…
--
-- Hasta acá un lote se identificaba solo con un código interno largo. Ahora
-- además lleva un número correlativo, que es lo que Joaquín le puede dictar a
-- un cliente.
--
-- Lo que garantiza: el número nunca se repite, aunque dos celulares confirmen
-- a la vez. Lo que no garantiza: que no quede un hueco. Si un lote falla a mitad
-- de camino después de tomar número, ese número se pierde. Para un remito
-- interno alcanza; para uno fiscal no, y la facturación está fuera del proyecto.
--
-- Los lotes anteriores quedan sin número.

create sequence public.numero_de_lote as integer start 1;

-- La secuencia la usa solo confirmar_lote, que corre como dueño de la base.
revoke all on sequence public.numero_de_lote from public, anon, authenticated;

alter table public.movimientos add column lote_numero integer;

create index movimientos_por_lote_numero on public.movimientos (lote_numero);

-- La misma función de 0003, con dos cambios marcados: toma el número recién al
-- grabar el primer movimiento (un lote donde todas las series eran
-- desconocidas no gasta número), y devuelve el número y la hora del servidor.
create or replace function public.confirmar_lote(
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
  v_numero integer := null;  -- nuevo en 0007
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

    -- Nuevo en 0007: el número se toma recién acá, con el primer movimiento real.
    if v_numero is null then
      v_numero := nextval('public.numero_de_lote');
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

      insert into public.movimientos (tipo, cilindro_id, cliente_id, fecha, lote_id, lote_numero, operador_id, operador)
      values ('entrega', v_cilindro.id, p_cliente_id, v_hoy, v_lote, v_numero, v_usuario, v_operador)
      returning * into v_movimiento;
    else
      if v_hay_abierto then
        update public.arriendos
        set fecha_devolucion = v_hoy
        where id = v_abierto.id;
      else
        v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'ya_en_stock');
      end if;

      insert into public.movimientos (tipo, cilindro_id, cliente_id, fecha, lote_id, lote_numero, operador_id, operador)
      values (
        'devolucion',
        v_cilindro.id,
        case when v_hay_abierto then v_abierto.cliente_id end,
        v_hoy, v_lote, v_numero, v_usuario, v_operador
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
    'numero', v_numero,                                                            -- nuevo en 0007
    'fecha', v_hoy,
    'hora', to_char(now() at time zone 'America/Montevideo', 'HH24:MI'),           -- nuevo en 0007
    'movimientos', v_movimientos,
    'avisos', v_avisos
  );
end
$$;
