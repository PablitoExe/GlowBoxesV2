-- ============================================================
-- GLOW BOXES — Migración: Admin role
-- Ejecutar DESPUÉS de schema.sql
-- ============================================================

-- Políticas para admin: acceso total a catálogo e inactivos
create policy "Admin lee todo productos"
  on public.productos for select
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin escribe productos"
  on public.productos for all
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin lee pedidos"
  on public.pedidos for select
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin actualiza pedidos"
  on public.pedidos for update
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin gestiona cupones"
  on public.cupones for all
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin lee perfiles"
  on public.perfiles for select
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- ⚠️  PASO FINAL: Asignar tu usuario como admin
-- 1. Registrate en la web (login.html)
-- 2. Buscá tu UUID en Supabase → Authentication → Users
-- 3. Ejecutá esto reemplazando el UUID:
-- ============================================================
-- update public.perfiles set role = 'admin' where id = 'TU-UUID-AQUI';
