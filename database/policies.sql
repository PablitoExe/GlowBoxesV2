-- ============================================================
-- GLOW BOXES - Row Level Security policies
-- Apply after schema.sql and grants.sql.
-- ============================================================

-- Enable RLS on every public table exposed to Supabase APIs.
alter table public.categorias    enable row level security;
alter table public.marcas        enable row level security;
alter table public.productos     enable row level security;
alter table public.perfiles      enable row level security;
alter table public.direcciones   enable row level security;
alter table public.cupones       enable row level security;
alter table public.pedidos       enable row level security;
alter table public.pedido_items  enable row level security;
alter table public.favoritos     enable row level security;
alter table public.carrito_items enable row level security;

-- Clean legacy/insecure policies before creating the modern set.
drop policy if exists "Categorias visibles" on public.categorias;
drop policy if exists "Marcas visibles" on public.marcas;
drop policy if exists "Productos visibles" on public.productos;
drop policy if exists "Perfil propio lectura" on public.perfiles;
drop policy if exists "Perfil propio update" on public.perfiles;
drop policy if exists "Direcciones propias" on public.direcciones;
drop policy if exists "Pedidos propios" on public.pedidos;
drop policy if exists "Crear pedido" on public.pedidos;
drop policy if exists "Items pedido propios" on public.pedido_items;
drop policy if exists "Favoritos propios" on public.favoritos;
drop policy if exists "Carrito propio" on public.carrito_items;
drop policy if exists "Cupones activos" on public.cupones;
drop policy if exists "Admin lee todo productos" on public.productos;
drop policy if exists "Admin escribe productos" on public.productos;
drop policy if exists "Admin lee pedidos" on public.pedidos;
drop policy if exists "Admin actualiza pedidos" on public.pedidos;
drop policy if exists "Admin gestiona cupones" on public.cupones;
drop policy if exists "Admin lee perfiles" on public.perfiles;

drop policy if exists "catalog_categories_read_active" on public.categorias;
drop policy if exists "catalog_categories_admin_all" on public.categorias;
drop policy if exists "catalog_brands_read_active" on public.marcas;
drop policy if exists "catalog_brands_admin_all" on public.marcas;
drop policy if exists "catalog_products_read_active" on public.productos;
drop policy if exists "catalog_products_admin_all" on public.productos;
drop policy if exists "profiles_select_own" on public.perfiles;
drop policy if exists "profiles_insert_own" on public.perfiles;
drop policy if exists "profiles_update_own_safe" on public.perfiles;
drop policy if exists "profiles_admin_all" on public.perfiles;
drop policy if exists "addresses_owner_all" on public.direcciones;
drop policy if exists "addresses_admin_all" on public.direcciones;
drop policy if exists "coupons_read_active_public" on public.cupones;
drop policy if exists "coupons_admin_all" on public.cupones;
drop policy if exists "orders_select_own" on public.pedidos;
drop policy if exists "orders_insert_own" on public.pedidos;
drop policy if exists "orders_admin_all" on public.pedidos;
drop policy if exists "order_items_select_own" on public.pedido_items;
drop policy if exists "order_items_insert_own_order" on public.pedido_items;
drop policy if exists "order_items_admin_all" on public.pedido_items;
drop policy if exists "favorites_owner_all" on public.favoritos;
drop policy if exists "favorites_admin_all" on public.favoritos;
drop policy if exists "cart_owner_all" on public.carrito_items;
drop policy if exists "cart_admin_all" on public.carrito_items;

-- ============================================================
-- Public catalog: readable when active, writable by admins only.
-- ============================================================
create policy "catalog_categories_read_active"
  on public.categorias
  for select
  to anon, authenticated
  using (activo = true);

create policy "catalog_categories_admin_all"
  on public.categorias
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "catalog_brands_read_active"
  on public.marcas
  for select
  to anon, authenticated
  using (activo = true);

create policy "catalog_brands_admin_all"
  on public.marcas
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "catalog_products_read_active"
  on public.productos
  for select
  to anon, authenticated
  using (activo = true);

create policy "catalog_products_admin_all"
  on public.productos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Profiles: users see/update their own profile; admins manage all.
-- Protected admin-only columns are also guarded by trigger.
-- No anon policy is defined, so anon profile access is denied by RLS.
-- ============================================================
create policy "profiles_select_own"
  on public.perfiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.perfiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and role = 'user'
    and vip = false
    and estado_cuenta = 'activo'
    and notas_admin is null
  );

create policy "profiles_update_own_safe"
  on public.perfiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_all"
  on public.perfiles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Addresses: owner-only customer data, with admin back-office access.
-- ============================================================
create policy "addresses_owner_all"
  on public.direcciones
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "addresses_admin_all"
  on public.direcciones
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Coupons: public clients can read only currently usable coupons.
-- Admins can manage the full coupon table.
-- ============================================================
create policy "coupons_read_active_public"
  on public.cupones
  for select
  to anon, authenticated
  using (
    activo = true
    and (fecha_fin is null or fecha_fin >= current_date)
    and (max_usos is null or usos_actuales < max_usos)
  );

create policy "coupons_admin_all"
  on public.cupones
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Orders: checkout creates authenticated user's own order.
-- Users can read their own orders but cannot update/delete them.
-- Admins retain full order-management access.
-- ============================================================
create policy "orders_select_own"
  on public.pedidos
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "orders_insert_own"
  on public.pedidos
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and estado in ('pendiente','confirmado')
    and pago_estado in ('pendiente','acreditado')
    and tracking_code is null
    and numero_seguimiento is null
    and eta is null
  );

create policy "orders_admin_all"
  on public.pedidos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "order_items_select_own"
  on public.pedido_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.user_id = auth.uid()
    )
  );

create policy "order_items_insert_own_order"
  on public.pedido_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.user_id = auth.uid()
        and p.estado in ('pendiente','confirmado')
    )
  );

create policy "order_items_admin_all"
  on public.pedido_items
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Favorites and cart: owner-only mutations, admin support access.
-- No anon policies are defined for customer-specific tables.
-- ============================================================
create policy "favorites_owner_all"
  on public.favoritos
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "favorites_admin_all"
  on public.favoritos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "cart_owner_all"
  on public.carrito_items
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "cart_admin_all"
  on public.carrito_items
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
