-- GONGAS — el gas de cada entrega, corregir el tamaño al escanear, y más
-- datos de cada cliente.
--
-- El gas se elige en cada entrega: el mismo cilindro puede salir hoy con
-- acetileno y mañana con oxígeno. Queda en el movimiento y en el arriendo, y
-- en el cilindro como "el último gas con el que salió", que es lo que la app
-- propone la próxima vez.
--
-- Nada de esto toca las reglas de los arriendos: la paridad con el
-- confirmarLote de TypeScript sigue igual. El gas es un dato que se guarda.

-- ───────────────────────────────────────────────────── Los gases

create table public.tipos_gas (
  nombre text primary key check (btrim(nombre) <> ''),
  -- Uno que ya se usó no se borra: se deja de ofrecer.
  activo boolean not null default true,
  orden integer not null default 100
);

insert into public.tipos_gas (nombre, orden) values
  ('Acetileno', 10),
  ('Argón', 20),
  ('Etileno', 30),
  ('Helio', 40),
  ('Hexafluoruro de azufre', 50),
  ('Hidrógeno', 60),
  ('Nitrógeno', 70),
  ('Oxígeno', 80);

revoke all on public.tipos_gas from anon, authenticated;
grant select, insert, update on public.tipos_gas to authenticated;

alter table public.tipos_gas enable row level security;

create policy tipos_gas_ver on public.tipos_gas
  for select to authenticated
  using (public.usuario_activo());

create policy tipos_gas_admin_agrega on public.tipos_gas
  for insert to authenticated
  with check (public.es_admin());

create policy tipos_gas_admin_edita on public.tipos_gas
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Los cilindros que ya existían quedan con el nombre lindo del gas.
update public.cilindros set tipo_gas = 'Acetileno' where lower(tipo_gas) = 'acetileno';
alter table public.cilindros alter column tipo_gas set default 'Acetileno';

-- El gas de cada entrega. Los de antes quedan con el gas del cilindro.
alter table public.movimientos add column tipo_gas text;
alter table public.arriendos add column tipo_gas text;

-- Los movimientos son inmutables: para completar el dato viejo se apaga el
-- trigger solo dentro de esta migración.
alter table public.movimientos disable trigger movimientos_inmutables;
update public.movimientos m
set tipo_gas = c.tipo_gas
from public.cilindros c
where c.id = m.cilindro_id and m.tipo = 'entrega' and m.tipo_gas is null;
alter table public.movimientos enable trigger movimientos_inmutables;

update public.arriendos a
set tipo_gas = c.tipo_gas
from public.cilindros c
where c.id = a.cilindro_id and a.tipo_gas is null;

-- ───────────────────────────────────────────────────── Datos del cliente

alter table public.clientes
  add column direccion text not null default '',
  add column ciudad text not null default '',
  add column notas text not null default '';

-- ───────────────────────────────────────────────────── confirmar_lote, con gas

-- El cuarto parámetro es nuevo: el gas de cada serie, en el mismo orden. Una
-- firma nueva no reemplaza a la vieja: hay que borrarla, o quedarían dos.
drop function public.confirmar_lote(text, text[], uuid);

create function public.confirmar_lote(
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

        insert into public.arriendos (cilindro_id, cliente_id, fecha_entrega, tipo_gas)
        values (v_cilindro.id, p_cliente_id, v_hoy, v_gas);
      end if;

      update public.cilindros set tipo_gas = v_gas where id = v_cilindro.id;

      insert into public.movimientos (tipo, cilindro_id, cliente_id, fecha, lote_id, lote_numero, operador_id, operador, tipo_gas)
      values ('entrega', v_cilindro.id, p_cliente_id, v_hoy, v_lote, v_numero, v_usuario, v_operador, v_gas)
      returning * into v_movimiento;
    else
      if v_hay_abierto then
        update public.arriendos
        set fecha_devolucion = v_hoy
        where id = v_abierto.id;
      else
        v_avisos := v_avisos || jsonb_build_object('serie', v_serie, 'tipo', 'ya_en_stock');
      end if;

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

revoke execute on function public.confirmar_lote(text, text[], uuid, text[]) from public, anon;
grant execute on function public.confirmar_lote(text, text[], uuid, text[]) to authenticated;

-- ───────────────────────────────────────────────────── Corregir el tamaño

-- Cualquier usuario activo: es un dato físico del cilindro. La tarifa sigue al
-- tamaño nuevo, salvo que el cilindro tuviera un precio propio, que se respeta.
create function public.corregir_tamano(p_serie text, p_tamano text) returns boolean
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

  if p_tamano is null or p_tamano not in ('chico', 'grande') then
    raise exception 'Tamaño inválido: "%".', p_tamano using errcode = 'check_violation';
  end if;

  select c.* into v_cilindro
  from public.cilindros c
  where c.serie = upper(btrim(coalesce(p_serie, '')))
  for update;

  if not found then
    raise exception 'El cilindro no existe.' using errcode = 'no_data_found';
  end if;

  if v_cilindro.tamano = p_tamano then
    return false;
  end if;

  select t.tarifa_mensual into v_vieja from public.tarifas_por_tamano t where t.tamano = v_cilindro.tamano;
  select t.tarifa_mensual into v_nueva from public.tarifas_por_tamano t where t.tamano = p_tamano;

  update public.cilindros set tamano = p_tamano where id = v_cilindro.id;

  update public.tarifas
  set tarifa_mensual = v_nueva
  where cilindro_id = v_cilindro.id and tarifa_mensual = v_vieja;

  insert into public.tarifas (cilindro_id, tarifa_mensual)
  values (v_cilindro.id, v_nueva)
  on conflict (cilindro_id) do nothing;

  return true;
end
$$;

revoke execute on function public.corregir_tamano(text, text) from public, anon;
grant execute on function public.corregir_tamano(text, text) to authenticated;

-- ───────────────────────────────────────────────────── alta_cilindro, con gas

-- El alta ya aceptaba el gas como tercer parámetro (0003); ahora se valida
-- contra la lista. Si no viene, Acetileno.
create or replace function public.alta_cilindro(
  p_serie text,
  p_tamano text,
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

  select t.tarifa_mensual into v_tarifa
  from public.tarifas_por_tamano t
  where t.tamano = p_tamano;

  if not found then
    raise exception 'Tamaño inválido: "%".', p_tamano using errcode = 'check_violation';
  end if;

  select t.nombre into v_gas
  from public.tipos_gas t
  where lower(t.nombre) = lower(coalesce(nullif(btrim(p_tipo_gas), ''), 'Acetileno'));

  if not found then
    raise exception 'Ese tipo de gas no está en la lista.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.cilindros c where c.serie = v_serie) then
    raise exception 'La serie % ya existe.', v_serie using errcode = 'unique_violation';
  end if;

  insert into public.cilindros (serie, tamano, tipo_gas)
  values (v_serie, p_tamano, v_gas)
  returning * into v_cilindro;

  insert into public.tarifas (cilindro_id, tarifa_mensual)
  values (v_cilindro.id, v_tarifa);

  return v_cilindro;
end
$$;

-- ───────────────────────────────────────────────────── Los mails, con gas

-- La misma de 0011, con el gas del arriendo, para el hueco {gas} del texto.
create or replace function public.datos_para_avisos_por_mail() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hoy', public.hoy_montevideo(),
    'textos', (
      select jsonb_build_object('con_cargo', t.con_cargo, 'por_vencer', t.por_vencer, 'copia_mail', t.copia_mail)
      from public.textos_aviso t
    ),
    'arriendos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'arriendo_id', a.id,
        'cliente', cl.nombre,
        'email', cl.email,
        'serie', c.serie,
        'fecha_entrega', a.fecha_entrega,
        'tarifa_mensual', t.tarifa_mensual,
        'tipo_gas', a.tipo_gas,
        'etapas_enviadas', coalesce((
          select jsonb_agg(v.etapa)
          from public.avisos v
          where v.arriendo_id = a.id and v.canal = 'mail'
        ), '[]'::jsonb)
      ) order by a.fecha_entrega)
      from public.arriendos a
      join public.clientes cl on cl.id = a.cliente_id
      join public.cilindros c on c.id = a.cilindro_id
      left join public.tarifas t on t.cilindro_id = c.id
      where a.fecha_devolucion is null
        and cl.email <> ''
        and public.hoy_montevideo() - a.fecha_entrega >= 54
    ), '[]'::jsonb)
  )
$$;

-- ───────────────────────────────────────────────────── En vivo

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tipos_gas;
  end if;
end
$$;
