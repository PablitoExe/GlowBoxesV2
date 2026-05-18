-- ================================================================
-- GLOW BOXES — Production migration v1
-- Run AFTER schema.sql + grants.sql + policies.sql + migration_atomic_order.sql
-- ================================================================

-- ── 1. MP payment columns on pedidos ────────────────────────────
alter table public.pedidos
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id    text,
  add column if not exists mp_status        text,
  add column if not exists mp_external_ref  text;

create index if not exists idx_pedidos_mp_payment_id
  on public.pedidos (mp_payment_id);
create index if not exists idx_pedidos_mp_external_ref
  on public.pedidos (mp_external_ref);

-- ── 2. movimientos_stock ─────────────────────────────────────────
create table if not exists public.movimientos_stock (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.productos(id) on delete restrict,
  pedido_id    uuid references public.pedidos(id) on delete set null,
  tipo         text not null check (tipo in (
    'venta','devolucion','ajuste','entrada','reserva','liberacion'
  )),
  cantidad     int not null,    -- negative = salida, positive = entrada
  stock_previo int not null,
  stock_nuevo  int not null,
  motivo       text,
  referencia   text,            -- numero de pedido u otra referencia
  usuario_id   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_movimientos_stock_producto
  on public.movimientos_stock (producto_id, created_at desc);
create index if not exists idx_movimientos_stock_pedido
  on public.movimientos_stock (pedido_id);

alter table public.movimientos_stock enable row level security;

drop policy if exists "movimientos_stock: admin all" on public.movimientos_stock;
create policy "movimientos_stock: admin all"
  on public.movimientos_stock
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3. consentimientos ──────────────────────────────────────────
create table if not exists public.consentimientos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in (
    'terminos','privacidad','cookies','marketing','devoluciones'
  )),
  version    text not null default '1.0',
  ip_hash    text,   -- SHA-256 of IP — never store raw IP
  accepted   boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_consentimientos_user
  on public.consentimientos (user_id, tipo);

alter table public.consentimientos enable row level security;

drop policy if exists "consentimientos: own read"   on public.consentimientos;
drop policy if exists "consentimientos: own insert" on public.consentimientos;
drop policy if exists "consentimientos: admin all"  on public.consentimientos;

create policy "consentimientos: own read"
  on public.consentimientos
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "consentimientos: own insert"
  on public.consentimientos
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "consentimientos: admin all"
  on public.consentimientos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 4. decrement_stock_for_order ────────────────────────────────
-- Called inside create_order's transaction (security invoker).
-- Runs as security definer to write movimientos_stock regardless of RLS.
-- Raises STOCK_INSUFICIENTE:<nombre> if any item cannot be decremented.
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
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_prod_id  := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_nombre   := v_item->>'nombre_producto';

    -- Atomic CAS-style decrement: row locked, only proceeds if stock >= cantidad
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

revoke all on function public.decrement_stock_for_order(jsonb, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.decrement_stock_for_order(jsonb, text, uuid, uuid)
  to service_role;

-- ── 5. release_order_stock ──────────────────────────────────────
-- Restores stock when payment is rejected/refunded.
-- Called by MP webhook (service_role) or admin.
create or replace function public.release_order_stock(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item       record;
  v_stock_prev int;
  v_stock_new  int;
begin
  -- auth.uid() is NULL when called via service_role (webhook)
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'release_order_stock: admin privileges required';
  end if;

  for v_item in
    select pi.producto_id, pi.cantidad, pi.nombre_producto, p.numero
    from   public.pedido_items pi
    join   public.pedidos      p  on p.id = pi.pedido_id
    where  pi.pedido_id = p_pedido_id
      and  pi.producto_id is not null
  loop
    update public.productos
    set    stock = stock + v_item.cantidad
    where  id = v_item.producto_id
    returning (stock - v_item.cantidad), stock
    into v_stock_prev, v_stock_new;

    insert into public.movimientos_stock (
      producto_id, pedido_id, tipo, cantidad,
      stock_previo, stock_nuevo, motivo, referencia
    ) values (
      v_item.producto_id, p_pedido_id, 'liberacion', v_item.cantidad,
      v_stock_prev, v_stock_new,
      'Liberación por pago fallido/rechazado',
      v_item.numero
    );
  end loop;
end;
$$;

revoke all on function public.release_order_stock(uuid)
  from public, anon;
grant execute on function public.release_order_stock(uuid)
  to authenticated, service_role;

-- ── 6. admin_adjust_stock ───────────────────────────────────────
create or replace function public.admin_adjust_stock(
  p_producto_id uuid,
  p_cantidad    int,   -- positive = add stock, negative = remove
  p_motivo      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_prev int;
  v_stock_new  int;
begin
  if not public.is_admin() then
    raise exception 'admin_adjust_stock: admin privileges required';
  end if;

  update public.productos
  set    stock = greatest(0, stock + p_cantidad)
  where  id = p_producto_id
  returning (stock - p_cantidad), stock
  into v_stock_prev, v_stock_new;

  if not found then
    raise exception 'admin_adjust_stock: producto no encontrado';
  end if;

  insert into public.movimientos_stock (
    producto_id, tipo, cantidad, stock_previo, stock_nuevo, motivo, usuario_id
  ) values (
    p_producto_id,
    case when p_cantidad >= 0 then 'entrada' else 'ajuste' end,
    p_cantidad,
    v_stock_prev, v_stock_new,
    p_motivo,
    auth.uid()
  );

  return jsonb_build_object(
    'stock_previo', v_stock_prev,
    'stock_nuevo',  v_stock_new,
    'ajuste',       p_cantidad
  );
end;
$$;

revoke all on function public.admin_adjust_stock(uuid, int, text)
  from public, anon;
grant execute on function public.admin_adjust_stock(uuid, int, text)
  to authenticated;

-- ── 7. create_order — updated with stock decrement ───────────────
-- Drop previous signatures before recreating.
drop function if exists public.create_order(
  text, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text, jsonb,
  text, text, timestamptz, text, jsonb
);
drop function if exists public.create_order(
  text, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text, jsonb,
  text, text, timestamptz, text, jsonb, uuid
);

create or replace function public.create_order(
  p_numero                  text,
  p_cliente_nombre          text,
  p_cliente_email           text,
  p_estado                  text,
  p_metodo_pago             text,
  p_pago_metodo             text,
  p_pago_estado             text,
  p_metodo_envio            text,
  p_subtotal                numeric,
  p_descuento               numeric,
  p_costo_envio             numeric,
  p_total                   numeric,
  p_cupon_codigo            text,
  p_direccion_envio         jsonb,
  p_comprobante_url         text,
  p_comprobante_filename    text,
  p_comprobante_uploaded_at timestamptz,
  p_notas                   text,
  p_items                   jsonb,
  p_user_id                 uuid DEFAULT NULL
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_user_id   uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user_id is null then
    raise exception 'create_order: no authenticated user';
  end if;

  if auth.uid() is not null and v_user_id <> auth.uid() then
    raise exception 'create_order: p_user_id does not match authenticated user';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order: p_items must be a non-empty JSON array';
  end if;

  insert into public.pedidos (
    numero, user_id, cliente_nombre, cliente_email,
    estado, metodo_pago, pago_metodo, pago_estado,
    metodo_envio, subtotal, descuento, costo_envio, total,
    cupon_codigo, direccion_envio,
    comprobante_url, comprobante_filename, comprobante_uploaded_at,
    notas
  ) values (
    p_numero, v_user_id, p_cliente_nombre, p_cliente_email,
    p_estado, p_metodo_pago, p_pago_metodo, p_pago_estado,
    p_metodo_envio, p_subtotal, p_descuento, p_costo_envio, p_total,
    p_cupon_codigo, p_direccion_envio,
    p_comprobante_url, p_comprobante_filename, p_comprobante_uploaded_at,
    p_notas
  )
  returning id into v_pedido_id;

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

  -- Stock decrement runs last: any failure rolls back the entire transaction.
  -- Raises STOCK_INSUFICIENTE:<nombre> if any item has insufficient stock.
  perform public.decrement_stock_for_order(p_items, p_numero, v_user_id, v_pedido_id);

  return v_pedido_id;
end;
$$;

revoke all on function public.create_order(
  text, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text, jsonb,
  text, text, timestamptz, text, jsonb, uuid
) from public, anon, authenticated;

grant execute on function public.create_order(
  text, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text, jsonb,
  text, text, timestamptz, text, jsonb, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';
