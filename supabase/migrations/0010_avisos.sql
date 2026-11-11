-- GONGAS — los avisos de WhatsApp: quién avisó y cuándo, y el texto editable.
--
-- La app no manda WhatsApp sola: arma el mensaje y abre `wa.me` con el texto
-- escrito, y la persona toca Enviar. Lo que se registra acá es que se abrió
-- WhatsApp con ese aviso, no que el cliente lo haya recibido.

-- ───────────────────────────────────────────────────── Avisos

-- Un registro por cada vez que alguien toca "Avisar por WhatsApp". Como los
-- movimientos: se ve, no se toca. Se graba solo con registrar_aviso().
create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  arriendo_id uuid not null references public.arriendos (id),
  cilindro_id uuid not null references public.cilindros (id),
  cliente_id uuid not null references public.clientes (id),
  -- Los días que llevaba ese arriendo cuando se avisó.
  dias integer not null,
  operador_id uuid not null references public.perfiles (id),
  -- El nombre queda copiado, como en los movimientos.
  operador text not null,
  creado_en timestamptz not null default now()
);

create index avisos_por_arriendo on public.avisos (arriendo_id, creado_en desc);

revoke all on public.avisos from anon, authenticated;
grant select on public.avisos to authenticated;

alter table public.avisos enable row level security;

create policy avisos_ver on public.avisos
  for select to authenticated
  using (public.usuario_activo());

create function public.registrar_aviso(p_arriendo_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_operador text;
  v_arriendo public.arriendos;
  v_aviso public.avisos;
begin
  select p.nombre into v_operador
  from public.perfiles p
  where p.id = v_usuario and p.activo;

  if not found then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  select a.* into v_arriendo
  from public.arriendos a
  where a.id = p_arriendo_id;

  if not found then
    raise exception 'Ese arriendo no existe.' using errcode = 'no_data_found';
  end if;

  if v_arriendo.fecha_devolucion is not null then
    raise exception 'Ese cilindro ya fue devuelto: no hay nada que avisar.'
      using errcode = 'check_violation';
  end if;

  insert into public.avisos (arriendo_id, cilindro_id, cliente_id, dias, operador_id, operador)
  values (
    v_arriendo.id,
    v_arriendo.cilindro_id,
    v_arriendo.cliente_id,
    public.hoy_montevideo() - v_arriendo.fecha_entrega,
    v_usuario,
    v_operador
  )
  returning * into v_aviso;

  return jsonb_build_object('id', v_aviso.id, 'creado_en', v_aviso.creado_en);
end
$$;

revoke execute on function public.registrar_aviso(uuid) from public, anon;
grant execute on function public.registrar_aviso(uuid) to authenticated;

-- ───────────────────────────────────────────────────── El texto

-- Una sola fila. Dos textos, porque no dicen lo mismo: el de 61 días o más
-- lleva el importe; el de 54 a 60 avisa cuánto le queda sin cargo. Los huecos
-- entre llaves los completa la app con los datos de cada cliente.
create table public.textos_aviso (
  id boolean primary key default true check (id),
  con_cargo text not null check (btrim(con_cargo) <> ''),
  por_vencer text not null check (btrim(por_vencer) <> ''),
  actualizado_en timestamptz not null default now()
);

insert into public.textos_aviso (con_cargo, por_vencer) values (
  'Hola {cliente}, les recordamos que el cilindro {serie} está en su poder desde el {desde} ({dias} días). A partir del día 61 genera un arrendamiento de {importe} a la fecha. Cualquier duda quedamos a las órdenes. GONGAS',
  'Hola {cliente}, les recordamos que el cilindro {serie} está en su poder desde el {desde} ({dias} días). A partir del día 61 empieza a generar arrendamiento: {sin_cargo}. Cualquier duda quedamos a las órdenes. GONGAS'
);

revoke all on public.textos_aviso from anon, authenticated;
grant select on public.textos_aviso to authenticated;
grant update (con_cargo, por_vencer, actualizado_en) on public.textos_aviso to authenticated;

alter table public.textos_aviso enable row level security;

-- Lo leen todos: un empleado manda los avisos "por vencer".
create policy textos_aviso_ver on public.textos_aviso
  for select to authenticated
  using (public.usuario_activo());

create policy textos_aviso_admin_edita on public.textos_aviso
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ───────────────────────────────────────────────────── En vivo

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.avisos, public.textos_aviso;
  end if;
end
$$;
