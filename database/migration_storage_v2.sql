-- ============================================================
-- GLOW BOXES — Storage v2: product-images + brand-logos
-- Run in Supabase SQL Editor AFTER schema.sql + grants.sql + policies.sql.
-- This replaces the single glow-media bucket with two purpose-specific
-- public buckets, keeps comprobantes private, and wires Realtime.
-- ============================================================

-- ── Buckets ─────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-logos',
  'brand-logos',
  true,
  2097152,  -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- comprobantes bucket is created in schema.sql; re-assert here for safety.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Drop legacy glow-media policies (idempotent) ────────────

drop policy if exists "glow_media_public_read"   on storage.objects;
drop policy if exists "glow_media_admin_insert"  on storage.objects;
drop policy if exists "glow_media_admin_update"  on storage.objects;
drop policy if exists "glow_media_admin_delete"  on storage.objects;

-- Drop v2 policies before re-creating (makes this script re-runnable).
drop policy if exists "product_images_public_read"    on storage.objects;
drop policy if exists "product_images_admin_insert"   on storage.objects;
drop policy if exists "product_images_admin_update"   on storage.objects;
drop policy if exists "product_images_admin_delete"   on storage.objects;
drop policy if exists "brand_logos_public_read"       on storage.objects;
drop policy if exists "brand_logos_admin_insert"      on storage.objects;
drop policy if exists "brand_logos_admin_update"      on storage.objects;
drop policy if exists "brand_logos_admin_delete"      on storage.objects;

-- ── product-images: public read, admin write ─────────────────

create policy "product_images_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'product-images');

create policy "product_images_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product_images_admin_update"
  on storage.objects
  for update
  to authenticated
  using  (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product_images_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ── brand-logos: public read, admin write ────────────────────

create policy "brand_logos_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'brand-logos');

create policy "brand_logos_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'brand-logos' and public.is_admin());

create policy "brand_logos_admin_update"
  on storage.objects
  for update
  to authenticated
  using  (bucket_id = 'brand-logos' and public.is_admin())
  with check (bucket_id = 'brand-logos' and public.is_admin());

create policy "brand_logos_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'brand-logos' and public.is_admin());

-- ── Realtime: add tables to publication ─────────────────────
-- Supabase creates supabase_realtime automatically; these lines
-- are no-ops if the table is already in the publication.

do $$
begin
  alter publication supabase_realtime add table public.pedidos;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.productos;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.perfiles;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cupones;
exception when others then null;
end $$;
