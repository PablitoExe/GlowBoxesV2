-- ================================================================
-- GLOW BOXES — Production v1 patch
-- Run AFTER migration_prod_v1.sql
--
-- Fixes:
--   1. decrement_stock_for_order: authenticated had no EXECUTE grant → 42501
--      on create_order (affects ALL users, not just Google OAuth)
--   2. Adds table-level grants for movimientos_stock and consentimientos
--   3. Hardens decrement_stock_for_order with idempotency check so that
--      exposing it to authenticated is safe
-- ================================================================

-- ── 1. Table grants (omitted from migration_prod_v1) ────────────

-- movimientos_stock: read by authenticated admins via RLS; writes only via
-- security definer functions (decrement_stock_for_order, release_order_stock,
-- admin_adjust_stock). Grant is still needed for PostgREST schema introspection.
grant select, insert, update, delete on public.movimientos_stock to authenticated;
grant all on public.movimientos_stock to service_role;

-- consentimientos: users can insert/read their own rows (enforced by RLS).
grant select, insert, update, delete on public.consentimientos to authenticated;
grant all on public.consentimientos to service_role;

-- ── 2. Harden decrement_stock_for_order before widening the grant ─

-- Recreate with idempotency guard so authenticated can safely call it.
-- The guard prevents double-decrement if someone calls the function
-- directly after create_order already ran it.
create or replace function public.decrement_stock_for_order(
  p_items     jsonb,
  p_numero    text,
  p_user_id   uuid,
  p_pedido_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item       jsonb;
  v_prod_id    uuid;
  v_cantidad   int;
  v_nombre     text;
  v_stock_prev int;
  v_stock_new  int;
begin
  -- When called as an authenticated user (not service_role), enforce:
  --   a) the pedido belongs to the calling user
  --   b) stock has NOT already been decremented for this pedido (idempotency)
  -- When called from within create_order (security invoker as authenticated),
  -- the pedido was just inserted so condition (b) is always satisfied.
  if auth.uid() is not null then
    if not exists (
      select 1 from public.pedidos
      where id = p_pedido_id and user_id = auth.uid()
    ) then
      raise exception 'UNAUTHORIZED: pedido does not belong to authenticated user';
    end if;

    if exists (
      select 1 from public.movimientos_stock
      where pedido_id = p_pedido_id and tipo = 'venta'
      limit 1
    ) then
      raise exception 'STOCK_ALREADY_DECREMENTED: double decrement prevented';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_prod_id  := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_nombre   := v_item->>'nombre_producto';

    update public.productos
    set    stock = stock - v_cantidad
    where  id = v_prod_id
      and  stock >= v_cantidad
    returning (stock + v_cantidad), stock
    into v_stock_prev, v_stock_new;

    if not found then
      raise exception 'STOCK_INSUFICIENTE:%', coalesce(v_nombre, v_prod_id::text);
    end if;

    insert into public.movimientos_stock (
      producto_id, pedido_id, tipo, cantidad,
      stock_previo, stock_nuevo, motivo, referencia, usuario_id
    ) values (
      v_prod_id, p_pedido_id, 'venta', -v_cantidad,
      v_stock_prev, v_stock_new,
      'Venta automática en checkout',
      p_numero,
      p_user_id
    );
  end loop;
end;
$$;

-- ── 3. Grant EXECUTE to authenticated ───────────────────────────
-- Required because create_order is security invoker and runs as authenticated.
-- The idempotency guard above makes direct calls from frontend safe.
revoke all on function public.decrement_stock_for_order(jsonb, text, uuid, uuid)
  from public, anon;

grant execute on function public.decrement_stock_for_order(jsonb, text, uuid, uuid)
  to authenticated, service_role;

-- ── 4. Diagnostic queries (run manually to confirm state) ────────
--
-- Check current grants on the function:
--   SELECT grantee, privilege_type
--   FROM information_schema.routine_privileges
--   WHERE specific_name LIKE 'decrement_stock_for_order%';
--
-- Verify auth.uid() works correctly for an authenticated request:
--   SELECT auth.uid();   -- must return your user UUID, not null
--
-- Check RLS policies on storage.objects for comprobantes:
--   SELECT policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename = 'objects' AND schemaname = 'storage'
--     AND policyname LIKE '%payment_proof%';
--
-- Check that the comprobantes bucket exists:
--   SELECT id, name, public FROM storage.buckets WHERE id = 'comprobantes';

notify pgrst, 'reload schema';
