-- ============================================================
-- GLOW BOXES - Atomic order creation function
-- Run AFTER schema.sql + grants.sql + policies.sql.
-- This replaces the two-step client-side INSERT pattern with a
-- single server-side transaction so a pedido_items failure can
-- never leave an orphaned pedido row.
-- ============================================================

-- Drop old version if re-running.
drop function if exists public.create_order(
  text, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text, jsonb,
  text, text, timestamptz, text, jsonb
);

create or replace function public.create_order(
  p_numero                    text,
  p_cliente_nombre            text,
  p_cliente_email             text,
  p_estado                    text,
  p_metodo_pago               text,
  p_pago_metodo               text,
  p_pago_estado               text,
  p_metodo_envio              text,
  p_subtotal                  numeric,
  p_descuento                 numeric,
  p_costo_envio               numeric,
  p_total                     numeric,
  p_cupon_codigo              text,
  p_direccion_envio           jsonb,
  p_comprobante_url           text,
  p_comprobante_filename      text,
  p_comprobante_uploaded_at   timestamptz,
  p_notas                     text,
  p_items                     jsonb   -- [{producto_id,nombre_producto,sku,cantidad,precio_unitario}]
)
returns uuid
language plpgsql
security invoker          -- RLS policies (orders_insert_own, order_items_insert_own_order) still apply
set search_path = public
as $$
declare
  v_pedido_id uuid;
begin
  -- INSERT pedido; orders_insert_own RLS enforces user_id = auth.uid() and proof fields.
  insert into public.pedidos (
    numero, user_id, cliente_nombre, cliente_email,
    estado, metodo_pago, pago_metodo, pago_estado,
    metodo_envio, subtotal, descuento, costo_envio, total,
    cupon_codigo, direccion_envio,
    comprobante_url, comprobante_filename, comprobante_uploaded_at,
    notas
  ) values (
    p_numero, auth.uid(), p_cliente_nombre, p_cliente_email,
    p_estado, p_metodo_pago, p_pago_metodo, p_pago_estado,
    p_metodo_envio, p_subtotal, p_descuento, p_costo_envio, p_total,
    p_cupon_codigo, p_direccion_envio,
    p_comprobante_url, p_comprobante_filename, p_comprobante_uploaded_at,
    p_notas
  )
  returning id into v_pedido_id;

  -- INSERT items; order_items_insert_own_order RLS verifies the pedido belongs to auth.uid().
  -- The trigger trg_pedido_items_subtotal auto-computes subtotal = cantidad * precio_unitario.
  insert into public.pedido_items (
    pedido_id, producto_id, nombre_producto, sku, cantidad, precio_unitario
  )
  select
    v_pedido_id,
    (item->>'producto_id')::uuid,
    item->>'nombre_producto',
    nullif(trim(item->>'sku'), ''),
    (item->>'cantidad')::int,
    (item->>'precio_unitario')::numeric
  from jsonb_array_elements(p_items) as item
  where (item->>'cantidad')::int > 0;

  return v_pedido_id;
  -- Any exception automatically rolls back both INSERTs — no orphan possible.
end;
$$;

-- Grant execute to authenticated users so RPC calls work via Supabase client.
grant execute on function public.create_order(
  text, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text, jsonb,
  text, text, timestamptz, text, jsonb
) to authenticated, service_role;
