-- ============================================================
-- GLOW BOXES - Explicit Supabase API grants
-- Apply after schema.sql and before policies.sql.
-- ============================================================

-- Do not rely on Supabase's historical default public-schema privileges.
revoke all on schema public from public;
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all tables in schema public from service_role;
revoke all on all functions in schema public from anon;
revoke all on all functions in schema public from authenticated;
revoke all on all functions in schema public from service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Explicit table permissions for Data API/PostgREST/GraphQL access.
grant select on public.categorias to anon;
grant select, insert, update, delete on public.categorias to authenticated;
grant all on public.categorias to service_role;

grant select on public.marcas to anon;
grant select, insert, update, delete on public.marcas to authenticated;
grant all on public.marcas to service_role;

grant select on public.productos to anon;
grant select, insert, update, delete on public.productos to authenticated;
grant all on public.productos to service_role;

grant select on public.perfiles to anon;
grant select, insert, update, delete on public.perfiles to authenticated;
grant all on public.perfiles to service_role;

grant select on public.direcciones to anon;
grant select, insert, update, delete on public.direcciones to authenticated;
grant all on public.direcciones to service_role;

grant select on public.cupones to anon;
grant select, insert, update, delete on public.cupones to authenticated;
grant all on public.cupones to service_role;

grant select on public.pedidos to anon;
grant select, insert, update, delete on public.pedidos to authenticated;
grant all on public.pedidos to service_role;

grant select on public.pedido_items to anon;
grant select, insert, update, delete on public.pedido_items to authenticated;
grant all on public.pedido_items to service_role;

grant select on public.favoritos to anon;
grant select, insert, update, delete on public.favoritos to authenticated;
grant all on public.favoritos to service_role;

grant select on public.carrito_items to anon;
grant select, insert, update, delete on public.carrito_items to authenticated;
grant all on public.carrito_items to service_role;

-- Function permissions: RPC is intentionally not open to anon.
grant execute on function public.get_my_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.slugify(text) to authenticated, service_role;
grant execute on function gen_random_uuid() to authenticated, service_role;
grant execute on function public.unaccent(text) to authenticated, service_role;
grant execute on function public.unaccent(regdictionary, text) to authenticated, service_role;
grant execute on function public.update_updated_at() to authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.protect_profile_admin_fields() to authenticated, service_role;
grant execute on function public.set_slug_from_nombre() to authenticated, service_role;
grant execute on function public.set_pedido_item_subtotal() to authenticated, service_role;

-- Keep future objects explicit too, without granting broad anon write access.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;
