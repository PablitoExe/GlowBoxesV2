-- ============================================================
-- GLOW BOXES — Migración: Admin role
-- Ejecutar DESPUÉS de schema.sql
-- ============================================================

-- Políticas admin — usan get_my_role() (security definer) para evitar recursión RLS
create policy "Admin lee todo productos"
  on public.productos for select
  using (get_my_role() = 'admin');

create policy "Admin escribe productos"
  on public.productos for all
  using (get_my_role() = 'admin');

create policy "Admin lee pedidos"
  on public.pedidos for select
  using (get_my_role() = 'admin');

create policy "Admin actualiza pedidos"
  on public.pedidos for update
  using (get_my_role() = 'admin');

create policy "Admin gestiona cupones"
  on public.cupones for all
  using (get_my_role() = 'admin');

create policy "Admin lee perfiles"
  on public.perfiles for select
  using (get_my_role() = 'admin');

-- ============================================================
-- ⚠️  PASO FINAL: Asignar tu usuario como admin
-- 1. Registrate en la web (login.html)
-- 2. Buscá tu UUID en Supabase → Authentication → Users
-- 3. Ejecutá esto reemplazando el UUID:
-- ============================================================
-- update public.perfiles set role = 'admin' where id = 'TU-UUID-AQUI';
