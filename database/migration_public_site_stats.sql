-- ============================================================
-- GLOW BOXES - Public aggregate site stats
-- Safe for anonymous frontend pages: returns counts only,
-- without exposing customer/profile rows.
-- ============================================================

create or replace function public.get_public_site_stats()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'clientes',  (select count(*) from public.perfiles),
    'productos', (select count(*) from public.productos where activo = true),
    'marcas',    (select count(*) from public.marcas where activo = true),
    'rubros',    (select count(*) from public.categorias where activo = true),
    'rubros_detalle',
      (
        select coalesce(jsonb_object_agg(c.slug, coalesce(pc.total, 0)), '{}'::jsonb)
        from public.categorias c
        left join (
          select categoria_id, count(*) as total
          from public.productos
          where activo = true
          group by categoria_id
        ) pc on pc.categoria_id = c.id
        where c.activo = true
      )
  )
$$;

revoke all on function public.get_public_site_stats() from public, anon, authenticated;
grant execute on function public.get_public_site_stats() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
