-- GONGAS — avisos automáticos por mail.
--
-- La red de seguridad por si nadie toca "Avisar por WhatsApp": todos los días
-- una función del servidor (supabase/functions/avisos-por-mail) manda un mail
-- por arriendo y por etapa —uno al entrar en "por vencer", otro al empezar a
-- generar cargo—, se haya avisado por WhatsApp o no.
--
-- Qué mandar y con qué texto lo decide src/dominio/avisosPorMail.ts, el mismo
-- código que usa la app. Acá queda lo que tiene que garantizar la base: que un
-- mail de una etapa no salga dos veces, y que nadie más que el servidor pueda
-- registrarlo.

-- ───────────────────────────────────────────────────── El mail del cliente

-- Opcional: sin mail, a ese cliente no se le avisa automático.
alter table public.clientes
  add column email text not null default ''
  check (email = '' or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

-- ───────────────────────────────────────────────────── El canal de cada aviso

alter table public.avisos
  add column canal text not null default 'whatsapp' check (canal in ('whatsapp', 'mail')),
  add column etapa text check (etapa in ('por_vencer', 'con_cargo')),
  -- A qué dirección salió un mail. En WhatsApp, nada: el teléfono está en el cliente.
  add column destino text;

update public.avisos
set etapa = case when dias > 60 then 'con_cargo' else 'por_vencer' end;

alter table public.avisos alter column etapa set not null;

-- Un mail no lo manda una persona: lo manda el servidor, y figura como "Automático".
alter table public.avisos alter column operador_id drop not null;

alter table public.avisos add constraint avisos_canal_coherente check (
  (canal = 'whatsapp' and operador_id is not null and destino is null)
  or (canal = 'mail' and operador_id is null and destino is not null)
);

-- La garantía central: un solo mail por arriendo y por etapa. Aunque el proceso
-- corra dos veces, o dos a la vez, el segundo no entra.
create unique index avisos_un_mail_por_etapa
  on public.avisos (arriendo_id, etapa)
  where canal = 'mail';

-- registrar_aviso (0010) ahora también dice la etapa. El resto, igual.
create or replace function public.registrar_aviso(p_arriendo_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_operador text;
  v_arriendo public.arriendos;
  v_dias integer;
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

  v_dias := public.hoy_montevideo() - v_arriendo.fecha_entrega;

  insert into public.avisos (arriendo_id, cilindro_id, cliente_id, dias, etapa, canal, operador_id, operador)
  values (
    v_arriendo.id,
    v_arriendo.cilindro_id,
    v_arriendo.cliente_id,
    v_dias,
    case when v_dias > 60 then 'con_cargo' else 'por_vencer' end,
    'whatsapp',
    v_usuario,
    v_operador
  )
  returning * into v_aviso;

  return jsonb_build_object('id', v_aviso.id, 'creado_en', v_aviso.creado_en);
end
$$;

-- ───────────────────────────────────────────────────── La copia oculta

alter table public.textos_aviso
  add column copia_mail text not null default 'info@gongasuruguay.com'
  check (copia_mail = '' or copia_mail ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

grant update (copia_mail) on public.textos_aviso to authenticated;

-- ───────────────────────────────────────────────────── Para el servidor

-- Lo que necesita la función del servidor para decidir: cada arriendo abierto
-- de 54 días o más cuyo cliente tiene mail, con las etapas que ya recibieron
-- mail. La decisión en sí la toma avisosPorMail.ts.
create function public.datos_para_avisos_por_mail() returns jsonb
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

-- Deja constancia de un mail que el proveedor ya aceptó. Si esa etapa ya tenía
-- mail, no hace nada y devuelve false: el índice único es el que manda.
create function public.registrar_aviso_por_mail(
  p_arriendo_id uuid,
  p_etapa text,
  p_destino text
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_arriendo public.arriendos;
begin
  select a.* into v_arriendo
  from public.arriendos a
  where a.id = p_arriendo_id and a.fecha_devolucion is null;

  if not found then
    return false;
  end if;

  insert into public.avisos (arriendo_id, cilindro_id, cliente_id, dias, etapa, canal, destino, operador)
  values (
    v_arriendo.id,
    v_arriendo.cilindro_id,
    v_arriendo.cliente_id,
    public.hoy_montevideo() - v_arriendo.fecha_entrega,
    p_etapa,
    'mail',
    p_destino,
    'Automático'
  )
  on conflict (arriendo_id, etapa) where canal = 'mail' do nothing;

  return found;
end
$$;

-- Ni sin sesión ni con sesión: solo el servidor, con su clave propia.
revoke execute on function public.datos_para_avisos_por_mail() from public, anon, authenticated;
revoke execute on function public.registrar_aviso_por_mail(uuid, text, text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.datos_para_avisos_por_mail() to service_role;
    grant execute on function public.registrar_aviso_por_mail(uuid, text, text) to service_role;
  end if;
end
$$;
