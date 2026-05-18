# MercadoPago — Guía de Integración

## Flujo de Pago

```
Usuario hace checkout
    │
    ▼
create_order RPC (stock decrementado)
    │
    ▼
mp-create-preference Edge Function
    │  POST /checkout/preferences con X-Idempotency-Key: pedido_id
    ▼
MP devuelve { preference_id, init_point }
    │
    ▼
redirect → init_point (glowboxes.com.ar sale, abre mercadopago.com.ar)
    │
    ▼
Usuario paga en MP
    │
    ├── Aprobado → back_url: /checkout.html?pago=ok&numero=GB-xxx
    ├── Rechazado → back_url: /checkout.html?pago=fail&numero=GB-xxx
    └── Pendiente → back_url: /checkout.html?pago=pending&numero=GB-xxx
    │
    ▼ (simultáneo, asíncrono)
mp-webhook Edge Function
    │  Valida HMAC-SHA256 de la firma
    │  GET /v1/payments/{id} para obtener estado real
    │  UPDATE pedidos SET pago_estado, mp_payment_id, mp_status
    └── Si rechazado/reembolsado: RPC release_order_stock
```

---

## Edge Functions

### `mp-create-preference`

**Endpoint:** `POST /functions/v1/mp-create-preference`  
**Auth:** Bearer token (JWT del usuario)

**Body:**
```json
{
  "pedido_id": "uuid",
  "numero": "GB-123456",
  "items": [
    { "nombre": "Producto", "cantidad": 1, "precio_unitario": 5000 }
  ],
  "total": 5000,
  "cliente_email": "user@example.com"
}
```

**Response:**
```json
{
  "preference_id": "1234567890-abc...",
  "init_point": "https://www.mercadopago.com.ar/checkout/v1/redirect?...",
  "sandbox_init_point": "https://sandbox.mercadopago.com.ar/..."
}
```

### `mp-webhook`

**Endpoint:** `POST /functions/v1/mp-webhook`  
**Auth:** HMAC-SHA256 (validación de firma, no JWT)

**Firma:**
```
x-signature: ts=1234567890,v1=abc123...
payload: id:{data.id};request-id:{x-request-id};ts:{ts};
key: MP_WEBHOOK_SECRET
```

---

## Mapeo de Estados

| Estado MP            | `pago_estado` en DB | `estado` en DB |
|---------------------|---------------------|----------------|
| `approved`          | `acreditado`        | `confirmado`   |
| `pending`           | `pendiente`         | `pendiente`    |
| `in_process`        | `pendiente`         | `pendiente`    |
| `rejected`          | `rechazado`         | `pendiente`    |
| `cancelled`         | `rechazado`         | `pendiente`    |
| `refunded`          | `reembolsado`       | `cancelado`    |
| `charged_back`      | `reembolsado`       | `cancelado`    |

---

## Idempotencia

El webhook verifica antes de actualizar:
```sql
SELECT mp_payment_id, pago_estado FROM pedidos WHERE numero = external_reference
```
Si `mp_payment_id = payment.id AND pago_estado = nuevo_estado` → skip (ya procesado).

---

## Variables de Entorno Necesarias

| Variable | Dónde obtenerla |
|----------|----------------|
| `MP_ACCESS_TOKEN` | developers.mercadopago.com.ar → Credenciales |
| `MP_WEBHOOK_SECRET` | Panel MP → Tu aplicación → Webhooks → Secreto |
| `SITE_URL` | `https://glowboxes.com.ar` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |

---

## Testing en Sandbox

1. Usar `sandbox_init_point` en lugar de `init_point`.
2. Credenciales de prueba en developers.mercadopago.com.ar.
3. Tarjetas de prueba: ver docs de MP para números de tarjeta por estado.
4. El webhook funciona igual en sandbox — usar la misma URL.

---

## Troubleshooting

**El webhook no llega:**
- Verificar que la URL está configurada en el panel de MP.
- Revisar logs en Supabase → Edge Functions → `mp-webhook`.
- La URL debe ser HTTPS y públicamente accesible.

**Signature validation failed:**
- Verificar que `MP_WEBHOOK_SECRET` coincide exactamente con el secreto del panel.
- El payload es sensible al orden: `id:{id};request-id:{x-request-id};ts:{ts};`

**Stock no se libera:**
- El webhook llama a `release_order_stock` vía service_role.
- Verificar que `SUPABASE_SERVICE_ROLE_KEY` está seteado correctamente.
- Revisar movimientos_stock para auditar qué pasó.
