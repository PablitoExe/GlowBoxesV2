-- ============================================================
-- GLOW BOXES — Schema Supabase
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- CATEGORIAS
-- ============================================================
create table public.categorias (
  id          uuid primary key default uuid_generate_v4(),
  nombre      text not null,
  slug        text not null unique,
  descripcion text,
  imagen_url  text,
  orden       int default 0,
  activo      boolean default true,
  created_at  timestamptz default now()
);

-- ============================================================
-- MARCAS
-- ============================================================
create table public.marcas (
  id         uuid primary key default uuid_generate_v4(),
  nombre     text not null,
  slug       text not null unique,
  logo_url   text,
  activo     boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- PRODUCTOS
-- ============================================================
create table public.productos (
  id               uuid primary key default uuid_generate_v4(),
  nombre           text not null,
  slug             text not null unique,
  descripcion      text,
  sku              text unique,
  precio           numeric(12,2) not null,
  precio_anterior  numeric(12,2),
  stock            int not null default 0,
  stock_minimo     int default 5,
  categoria_id     uuid references public.categorias(id) on delete set null,
  marca_id         uuid references public.marcas(id) on delete set null,
  imagen_url       text,
  imagenes         jsonb default '[]',
  atributos        jsonb default '{}',
  destacado        boolean default false,
  activo           boolean default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_productos_updated_at
  before update on public.productos
  for each row execute function update_updated_at();

-- ============================================================
-- PERFILES (extiende auth.users)
-- ============================================================
create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  apellido    text,
  telefono    text,
  dni         text,
  fecha_nac   date,
  tipo        text check (tipo in ('particular','detailer','taller','wrapper','instalador','revendedor')) default 'particular',
  role        text check (role in ('user','admin')) default 'user',
  avatar_url  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger trg_perfiles_updated_at
  before update on public.perfiles
  for each row execute function update_updated_at();

-- Crear perfil automáticamente al registrarse
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.perfiles (id, nombre, apellido)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- RPC: get_my_role  (usada en nav.js, login.js, admin-guard.js)
-- ============================================================
create or replace function get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.perfiles where id = auth.uid()
$$;

-- ============================================================
-- DIRECCIONES
-- ============================================================
create table public.direcciones (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete cascade,
  nombre       text not null,
  calle        text not null,
  ciudad       text not null,
  provincia    text,
  cp           text,
  notas        text,
  predeterminada boolean default false,
  created_at   timestamptz default now()
);

-- ============================================================
-- CUPONES
-- ============================================================
create table public.cupones (
  id               uuid primary key default uuid_generate_v4(),
  codigo           text not null unique,
  descripcion      text,
  tipo             text check (tipo in ('porcentaje','monto_fijo')) default 'porcentaje',
  valor            numeric(10,2) not null,
  minimo_compra    numeric(12,2) default 0,
  usos_maximos     int,
  usos_actuales    int default 0,
  categoria_id     uuid references public.categorias(id) on delete set null,
  activo           boolean default true,
  fecha_vencimiento date,
  created_at       timestamptz default now()
);

-- ============================================================
-- PEDIDOS
-- ============================================================
create table public.pedidos (
  id               uuid primary key default uuid_generate_v4(),
  numero           text unique,
  user_id          uuid references auth.users(id) on delete set null,
  estado           text check (estado in ('pendiente','confirmado','en_preparacion','en_transito','entregado','cancelado')) default 'pendiente',
  metodo_pago      text check (metodo_pago in ('mp','transfer','efectivo')) default 'mp',
  metodo_envio     text check (metodo_envio in ('pickup','own','correo')) default 'own',
  subtotal         numeric(12,2) not null default 0,
  descuento        numeric(12,2) default 0,
  costo_envio      numeric(12,2) default 0,
  total            numeric(12,2) not null default 0,
  cupon_codigo     text,
  direccion_envio  jsonb,
  notas            text,
  tracking_code    text,
  eta              date,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create trigger trg_pedidos_updated_at
  before update on public.pedidos
  for each row execute function update_updated_at();

-- ============================================================
-- ITEMS DE PEDIDO
-- ============================================================
create table public.pedido_items (
  id              uuid primary key default uuid_generate_v4(),
  pedido_id       uuid references public.pedidos(id) on delete cascade,
  producto_id     uuid references public.productos(id) on delete set null,
  nombre_producto text not null,
  sku             text,
  cantidad        int not null default 1,
  precio_unitario numeric(12,2) not null,
  subtotal        numeric(12,2) generated always as (cantidad * precio_unitario) stored
);

-- ============================================================
-- FAVORITOS
-- ============================================================
create table public.favoritos (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete cascade,
  created_at  timestamptz default now(),
  unique(user_id, producto_id)
);

-- ============================================================
-- CARRITO
-- ============================================================
create table public.carrito_items (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete cascade,
  cantidad    int not null default 1,
  created_at  timestamptz default now(),
  unique(user_id, producto_id)
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.categorias      enable row level security;
alter table public.marcas          enable row level security;
alter table public.productos       enable row level security;
alter table public.perfiles        enable row level security;
alter table public.direcciones     enable row level security;
alter table public.pedidos         enable row level security;
alter table public.pedido_items    enable row level security;
alter table public.cupones         enable row level security;
alter table public.favoritos       enable row level security;
alter table public.carrito_items   enable row level security;

-- Catálogo público
create policy "Categorias visibles"  on public.categorias  for select using (activo = true);
create policy "Marcas visibles"      on public.marcas      for select using (activo = true);
create policy "Productos visibles"   on public.productos   for select using (activo = true);

-- Perfiles
create policy "Perfil propio lectura"   on public.perfiles for select using (auth.uid() = id);
create policy "Perfil propio update"    on public.perfiles for update using (auth.uid() = id);

-- Direcciones
create policy "Direcciones propias"  on public.direcciones for all using (auth.uid() = user_id);

-- Pedidos
create policy "Pedidos propios"      on public.pedidos      for select using (auth.uid() = user_id);
create policy "Crear pedido"         on public.pedidos      for insert with check (auth.uid() = user_id);
create policy "Items pedido propios" on public.pedido_items for select using (
  exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = auth.uid())
);

-- Favoritos y carrito
create policy "Favoritos propios"     on public.favoritos     for all using (auth.uid() = user_id);
create policy "Carrito propio"        on public.carrito_items for all using (auth.uid() = user_id);

-- Cupones
create policy "Cupones activos"       on public.cupones for select using (activo = true);

-- ============================================================
-- DATOS INICIALES
-- ============================================================
insert into public.categorias (nombre, slug, orden) values
  ('Detailing',    'detailing',    1),
  ('Audio Car',    'audio-car',    2),
  ('Wrap',         'wrap',         3),
  ('PPF',          'ppf',          4),
  ('Herramientas', 'herramientas', 5);
