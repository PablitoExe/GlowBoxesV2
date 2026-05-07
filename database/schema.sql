-- ============================================================
-- GLOW BOXES — Schema Supabase
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- ============================================================
-- EXTENSIONES
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

-- Auto-actualizar updated_at
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
-- PERFILES DE USUARIO (extiende auth.users)
-- ============================================================
create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  apellido    text,
  telefono    text,
  tipo        text check (tipo in ('particular','detailer','taller','wrapper','instalador','revendedor')) default 'particular',
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
-- PEDIDOS
-- ============================================================
create table public.pedidos (
  id               uuid primary key default uuid_generate_v4(),
  numero           serial unique,
  user_id          uuid references auth.users(id) on delete set null,
  estado           text check (estado in ('pendiente','confirmado','en_preparacion','en_transito','entregado','cancelado')) default 'pendiente',
  subtotal         numeric(12,2) not null default 0,
  descuento        numeric(12,2) default 0,
  total            numeric(12,2) not null default 0,
  cupon_id         uuid,
  direccion_envio  jsonb,
  notas            text,
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
-- CUPONES
-- ============================================================
create table public.cupones (
  id              uuid primary key default uuid_generate_v4(),
  codigo          text not null unique,
  descripcion     text,
  tipo            text check (tipo in ('porcentaje','monto_fijo','categoria')) default 'porcentaje',
  valor           numeric(10,2) not null,
  minimo_compra   numeric(12,2) default 0,
  usos_maximos    int,
  usos_actuales   int default 0,
  categoria_id    uuid references public.categorias(id) on delete set null,
  activo          boolean default true,
  fecha_vencimiento date,
  created_at      timestamptz default now()
);

-- ============================================================
-- CARRITO (para usuarios logueados)
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
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS
alter table public.categorias      enable row level security;
alter table public.marcas          enable row level security;
alter table public.productos       enable row level security;
alter table public.perfiles        enable row level security;
alter table public.pedidos         enable row level security;
alter table public.pedido_items    enable row level security;
alter table public.cupones         enable row level security;
alter table public.carrito_items   enable row level security;

-- Catálogo: lectura pública
create policy "Categorias visibles" on public.categorias for select using (activo = true);
create policy "Marcas visibles"     on public.marcas     for select using (activo = true);
create policy "Productos visibles"  on public.productos  for select using (activo = true);

-- Perfiles: solo el propio usuario
create policy "Perfil propio lectura"     on public.perfiles for select using (auth.uid() = id);
create policy "Perfil propio escritura"   on public.perfiles for update using (auth.uid() = id);

-- Pedidos: solo el propio usuario
create policy "Pedidos propios"           on public.pedidos      for select using (auth.uid() = user_id);
create policy "Crear pedido"              on public.pedidos      for insert with check (auth.uid() = user_id);
create policy "Pedido items propios"      on public.pedido_items for select using (
  exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = auth.uid())
);

-- Carrito: solo el propio usuario
create policy "Carrito propio lectura"    on public.carrito_items for select using (auth.uid() = user_id);
create policy "Carrito propio escritura"  on public.carrito_items for all    using (auth.uid() = user_id);

-- Cupones: lectura pública (solo activos)
create policy "Cupones activos"           on public.cupones for select using (activo = true);

-- ============================================================
-- DATOS INICIALES — Categorías
-- ============================================================
insert into public.categorias (nombre, slug, orden) values
  ('Detailing',    'detailing',    1),
  ('Audio Car',    'audio-car',    2),
  ('Wrap',         'wrap',         3),
  ('PPF',          'ppf',          4),
  ('Herramientas', 'herramientas', 5);
