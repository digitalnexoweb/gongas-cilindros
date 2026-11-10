-- GONGAS — esquema de la base compartida.
--
-- Es el modelo de la sección 4 del SPEC, llevado a Postgres. Lo que el
-- prototipo garantizaba en código, acá lo garantiza la base:
--
--   · la ubicación de un cilindro no se guarda, se deduce del arriendo abierto;
--   · un cilindro nunca tiene dos arriendos abiertos a la vez;
--   · los movimientos no se editan ni se borran.
--
-- Las fechas son `date`: viajan como 'YYYY-MM-DD' y no tienen zona horaria.

-- ───────────────────────────────────────────────────────────── Usuarios

-- Una fila por persona que entra a la app. La cuenta en sí (mail y contraseña)
-- vive en auth.users, que maneja Supabase; acá va lo que es nuestro.
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  rol text not null default 'operador' check (rol in ('admin', 'operador')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── El modelo

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  tipo text not null check (tipo in ('empresa', 'particular')),
  documento text not null default '',
  telefono text not null default '',
  creado_en timestamptz not null default now()
);

create table public.cilindros (
  id uuid primary key default gen_random_uuid(),
  -- Única, va en el QR. Misma forma que valida `pareceSerie` en la app.
  serie text not null unique check (serie ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  tipo_gas text not null default 'acetileno',
  tamano text not null check (tamano in ('chico', 'grande')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Se abre con cada entrega y se cierra con la devolución.
create table public.arriendos (
  id uuid primary key default gen_random_uuid(),
  cilindro_id uuid not null references public.cilindros (id),
  cliente_id uuid not null references public.clientes (id),
  fecha_entrega date not null,
  fecha_devolucion date,
  check (fecha_devolucion is null or fecha_devolucion >= fecha_entrega)
);

-- La regla que no se negocia: un solo arriendo abierto por cilindro. Aunque dos
-- personas escaneen el mismo cilindro a la vez, la base rechaza el segundo.
create unique index arriendos_un_abierto_por_cilindro
  on public.arriendos (cilindro_id)
  where fecha_devolucion is null;

create index arriendos_por_cliente on public.arriendos (cliente_id);

-- Registro inmutable. Nunca se edita ni se borra.
create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrega', 'devolucion')),
  cilindro_id uuid not null references public.cilindros (id),
  cliente_id uuid references public.clientes (id),
  fecha date not null,
  lote_id uuid not null,
  operador_id uuid not null references public.perfiles (id),
  -- El nombre queda copiado: el historial dice quién fue aunque después
  -- esa persona cambie de nombre o deje de trabajar.
  operador text not null,
  creado_en timestamptz not null default now()
);

create index movimientos_por_cilindro on public.movimientos (cilindro_id, creado_en);

create function public.movimientos_son_inmutables() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los movimientos no se editan ni se borran.'
    using errcode = 'restrict_violation';
end
$$;

-- Vale para todos, también para el administrador y para quien entre por el
-- panel de Supabase. Un error se corrige con el movimiento contrario.
create trigger movimientos_inmutables
  before update or delete on public.movimientos
  for each row execute function public.movimientos_son_inmutables();

-- ───────────────────────────────────────────────────────────── La plata

-- Va en tablas aparte a propósito: es lo que permite que la base no le
-- entregue las tarifas a quien no las tiene que ver. Si mañana se decide que
-- los empleados sí las vean, se cambia una regla en 0002, no el diseño.

-- La tarifa por defecto de cada tamaño, con la que nace un cilindro nuevo.
create table public.tarifas_por_tamano (
  tamano text primary key check (tamano in ('chico', 'grande')),
  tarifa_mensual numeric(10, 2) not null check (tarifa_mensual >= 0)
);

insert into public.tarifas_por_tamano (tamano, tarifa_mensual)
values ('chico', 380), ('grande', 440);

-- La tarifa de cada cilindro, editable uno por uno.
create table public.tarifas (
  cilindro_id uuid primary key references public.cilindros (id) on delete cascade,
  tarifa_mensual numeric(10, 2) not null check (tarifa_mensual >= 0)
);
