-- ============================================================
-- GLOW BOXES - Supabase schema
-- Apply first, then run grants.sql and policies.sql.
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- Public media bucket for product, banner and brand assets.
-- Writes are restricted by storage RLS policies in policies.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'glow-media',
  'glow-media',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Private payment proof bucket. Files are readable only by their owner
-- and by admins through Storage RLS policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- Shared helpers
-- ============================================================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.slugify(value text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    lower(unaccent(coalesce(value, ''))),
    '[^a-z0-9]+',
    '-',
    'g'
  ))
$$;

create or replace function public.set_slug_from_nombre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.slugify(new.nombre);
  end if;
  return new;
end;
$$;

-- ============================================================
-- Categories
-- ============================================================
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null unique,
  descripcion text,
  imagen_url  text,
  orden       int default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

drop trigger if exists trg_categorias_slug on public.categorias;
create trigger trg_categorias_slug
  before insert or update of nombre, slug on public.categorias
  for each row execute function public.set_slug_from_nombre();

-- ============================================================
-- Brands
-- ============================================================
create table if not exists public.marcas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  slug       text unique,
  logo_url   text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_marcas_slug on public.marcas;
create trigger trg_marcas_slug
  before insert or update of nombre, slug on public.marcas
  for each row execute function public.set_slug_from_nombre();

-- ============================================================
-- Products
-- ============================================================
create table if not exists public.productos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  slug             text not null unique,
  descripcion      text,
  sku              text unique,
  precio           numeric(12,2) not null check (precio >= 0),
  precio_oferta    numeric(12,2) check (precio_oferta is null or precio_oferta >= 0),
  stock            int not null default 0 check (stock >= 0),
  stock_minimo     int not null default 5 check (stock_minimo >= 0),
  categoria_id     uuid references public.categorias(id) on delete set null,
  marca_id         uuid references public.marcas(id) on delete set null,
  imagen_url       text,
  imagenes         jsonb not null default '[]'::jsonb,
  atributos        jsonb not null default '{}'::jsonb,
  destacado        boolean not null default false,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_productos_slug on public.productos;
create trigger trg_productos_slug
  before insert or update of nombre, slug on public.productos
  for each row execute function public.set_slug_from_nombre();

drop trigger if exists trg_productos_updated_at on public.productos;
create trigger trg_productos_updated_at
  before update on public.productos
  for each row execute function public.update_updated_at();

-- ============================================================
-- Profiles (extends auth.users)
-- ============================================================
create table if not exists public.perfiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text,
  apellido      text,
  telefono      text,
  dni           text,
  fecha_nac     date,
  tipo          text not null check (tipo in ('particular','detailer','taller','wrapper','instalador','revendedor')) default 'particular',
  role          text not null check (role in ('user','admin')) default 'user',
  avatar_url    text,
  vip           boolean not null default false,
  estado_cuenta text not null check (estado_cuenta in ('activo','inactivo','suspendido')) default 'activo',
  ciudad        text,
  notas_admin   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_perfiles_updated_at on public.perfiles;
create trigger trg_perfiles_updated_at
  before update on public.perfiles
  for each row execute function public.update_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, apellido)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.role from public.perfiles p where p.id = auth.uid()),
    'anon'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.get_my_role() = 'admin'
$$;

create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = new.id
     and not public.is_admin()
     and (
       new.role is distinct from old.role
       or new.vip is distinct from old.vip
       or new.estado_cuenta is distinct from old.estado_cuenta
       or new.notas_admin is distinct from old.notas_admin
     ) then
    raise exception 'Only admins can update protected profile fields';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_perfiles_protect_admin_fields on public.perfiles;
create trigger trg_perfiles_protect_admin_fields
  before update on public.perfiles
  for each row execute function public.protect_profile_admin_fields();

-- ============================================================
-- Addresses
-- ============================================================
create table if not exists public.direcciones (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  nombre          text not null,
  calle           text not null,
  ciudad          text not null,
  provincia       text,
  cp              text,
  notas           text,
  predeterminada  boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- Coupons
-- ============================================================
create table if not exists public.cupones (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  descripcion       text,
  tipo              text not null check (tipo in ('porcentaje','monto','monto_fijo')) default 'porcentaje',
  descuento         numeric(10,2) not null default 0 check (descuento >= 0),
  min_compra        numeric(12,2) default 0 check (min_compra is null or min_compra >= 0),
  max_usos          int check (max_usos is null or max_usos > 0),
  usos_actuales     int not null default 0 check (usos_actuales >= 0),
  categoria_id      uuid references public.categorias(id) on delete set null,
  activo            boolean not null default true,
  fecha_fin         date,
  created_at        timestamptz not null default now(),
  -- Legacy-compatible aliases kept for older SQL/scripts.
  valor             numeric(10,2) generated always as (descuento) stored,
  minimo_compra     numeric(12,2) generated always as (min_compra) stored,
  usos_maximos      int generated always as (max_usos) stored,
  fecha_vencimiento date generated always as (fecha_fin) stored
);

-- ============================================================
-- Orders
-- ============================================================
create table if not exists public.pedidos (
  id                 uuid primary key default gen_random_uuid(),
  numero             text unique,
  user_id            uuid references auth.users(id) on delete set null,
  cliente_nombre     text,
  cliente_email      text,
  estado             text not null check (
    estado in (
      'pendiente','confirmado','en_preparacion','en_transito','entregado',
      'pagado','enviado','completado','cancelado'
    )
  ) default 'pendiente',
  metodo_pago        text check (metodo_pago in ('mp','transfer','efectivo','transferencia','mercado_pago','tarjeta','otro')) default 'mp',
  pago_metodo        text check (pago_metodo in ('mp','transfer','efectivo','transferencia','mercado_pago','tarjeta','otro')),
  pago_estado        text not null check (pago_estado in ('pendiente','acreditado','pagado','rechazado','reembolsado')) default 'pendiente',
  metodo_envio       text check (metodo_envio in ('pickup','own','correo')) default 'own',
  subtotal           numeric(12,2) not null default 0 check (subtotal >= 0),
  descuento          numeric(12,2) not null default 0 check (descuento >= 0),
  costo_envio        numeric(12,2) not null default 0 check (costo_envio >= 0),
  total              numeric(12,2) not null default 0 check (total >= 0),
  cupon_codigo       text,
  direccion_envio    jsonb,
  notas              text,
  tracking_code      text,
  numero_seguimiento text,
  comprobante_url    text,
  comprobante_filename text,
  comprobante_uploaded_at timestamptz,
  eta                date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.pedidos
  add column if not exists comprobante_url text,
  add column if not exists comprobante_filename text,
  add column if not exists comprobante_uploaded_at timestamptz;

drop trigger if exists trg_pedidos_updated_at on public.pedidos;
create trigger trg_pedidos_updated_at
  before update on public.pedidos
  for each row execute function public.update_updated_at();

-- ============================================================
-- Order items
-- ============================================================
create table if not exists public.pedido_items (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos(id) on delete cascade,
  producto_id     uuid references public.productos(id) on delete set null,
  nombre_producto text,
  sku             text,
  cantidad        int not null default 1 check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  subtotal        numeric(12,2) not null default 0 check (subtotal >= 0)
);

create or replace function public.set_pedido_item_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.subtotal := new.cantidad * new.precio_unitario;
  return new;
end;
$$;

drop trigger if exists trg_pedido_items_subtotal on public.pedido_items;
create trigger trg_pedido_items_subtotal
  before insert or update of cantidad, precio_unitario on public.pedido_items
  for each row execute function public.set_pedido_item_subtotal();

-- ============================================================
-- Favorites
-- ============================================================
create table if not exists public.favoritos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(user_id, producto_id)
);

-- ============================================================
-- Cart
-- ============================================================
create table if not exists public.carrito_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  cantidad    int not null default 1 check (cantidad > 0),
  created_at  timestamptz not null default now(),
  unique(user_id, producto_id)
);

-- ============================================================
-- Indexes for API/RLS performance
-- ============================================================
create index if not exists idx_productos_activo_created on public.productos (activo, created_at desc);
create index if not exists idx_productos_categoria on public.productos (categoria_id);
create index if not exists idx_productos_marca on public.productos (marca_id);
create index if not exists idx_pedidos_user_created on public.pedidos (user_id, created_at desc);
create index if not exists idx_pedido_items_pedido on public.pedido_items (pedido_id);
create index if not exists idx_direcciones_user on public.direcciones (user_id);
create index if not exists idx_favoritos_user on public.favoritos (user_id);
create index if not exists idx_carrito_items_user on public.carrito_items (user_id);

-- ============================================================
-- Initial data
-- ============================================================
insert into public.categorias (nombre, slug, orden)
values
  ('Detailing',    'detailing',    1),
  ('Audio Car',    'audio-car',    2),
  ('Wrap',         'wrap',         3),
  ('PPF',          'ppf',          4),
  ('Herramientas', 'herramientas', 5)
on conflict (slug) do nothing;
