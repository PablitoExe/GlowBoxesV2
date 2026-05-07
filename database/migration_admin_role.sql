-- Ejecutar en Supabase → SQL Editor DESPUES del schema.sql

-- 1. Agregar columna role a perfiles
alter table public.perfiles
  add column if not exists role text
  check (role in ('user','admin'))
  default 'user';

-- 2. Política: admins ven TODO en catálogo (incluso inactivos)
create policy "Admin lee todo productos"
  on public.productos for select
  using (
    exists (
      select 1 from public.perfiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin escribe productos"
  on public.productos for all
  using (
    exists (
      select 1 from public.perfiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin lee pedidos"
  on public.pedidos for select
  using (
    exists (
      select 1 from public.perfiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin gestiona cupones"
  on public.cupones for all
  using (
    exists (
      select 1 from public.perfiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 3. ⚠️  IMPORTANTE: reemplazá el UUID por el tuyo
--    Lo encontrás en Supabase → Authentication → Users
--    Después de registrarte en la web, corré esto:
--
-- update public.perfiles set role = 'admin' where id = 'TU-UUID-AQUI';
