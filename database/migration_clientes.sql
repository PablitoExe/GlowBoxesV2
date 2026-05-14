-- ============================================================
-- GLOW BOXES — Migración: Campos extra clientes + pago_estado
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- Columnas extra en perfiles
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS vip           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS estado_cuenta text CHECK (estado_cuenta IN ('activo','inactivo','suspendido')) DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS ciudad        text,
  ADD COLUMN IF NOT EXISTS notas_admin   text;

-- pago_estado en pedidos (separado del estado de envío)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pago_estado text
    CHECK (pago_estado IN ('pendiente','acreditado','rechazado','reembolsado'))
    DEFAULT 'pendiente';

-- Marcar como acreditado los pedidos que ya estaban confirmados
UPDATE public.pedidos SET pago_estado = 'acreditado'
WHERE estado IN ('confirmado','en_preparacion','en_transito','entregado')
  AND pago_estado = 'pendiente';
