# Sistema de Emails — Glow Boxes

## Arquitectura

```
Frontend JS (email.js)
    │  fire-and-forget via supabase.functions.invoke('send-email')
    ▼
Edge Function: send-email
    │  valida JWT (tipos privados) o rate-limit por IP (tipos públicos)
    │  renderiza template HTML
    ▼
Resend API → entrega al destinatario
```

---

## Tipos de Email

| Tipo | Trigger | Auth |
|------|---------|------|
| `welcome` | Registro de nuevo usuario | JWT |
| `order_confirmation` | Pedido creado | JWT |
| `payment_approved` | Pago acreditado (admin) | JWT |
| `order_shipped` | Pedido enviado (admin) | JWT |
| `order_delivered` | Pedido entregado (admin) | JWT |
| `password_recovery` | Recuperación de contraseña | JWT |
| `contact_received` | Formulario de contacto | Rate-limit por IP |
| `invoice_available` | Boleta disponible (admin) | JWT |

---

## Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `RESEND_API_KEY` | (requerido) | API key de Resend |
| `EMAIL_FROM` | `Glow Boxes <noreply@glowboxes.com.ar>` | Remitente |
| `ADMIN_EMAIL` | `hola@glowboxes.ar` | Email del administrador |
| `REPLY_TO` | `soporte@glowboxes.com.ar` | Reply-to para emails de soporte |

---

## Rate Limiting

El tipo `contact_received` es público (sin JWT). Está protegido por:
- **3 requests por IP cada 10 minutos**
- Responde `429 Too Many Requests` si se excede

El rate limit se resetea en cold-starts de la función. Es suficiente para protección básica anti-spam.

---

## Uso desde Frontend

```javascript
import { sendTransactionalEmail } from './email.js'

// Envío fire-and-forget — no bloquea la UI, nunca lanza excepción
sendTransactionalEmail('welcome', user.email, { nombre: 'Juan' })

// Para contact (endpoint público — no necesita JWT)
sendTransactionalEmail('contact_received', email, {
  nombre, email, telefono, asunto, mensaje, motivo
})
```

---

## Dual-Send para Contacto

Cuando se envía `contact_received`:
1. **Cliente recibe:** confirmación de que recibimos su mensaje.
2. **Admin recibe:** copia con todos los datos del formulario + replyTo = email del cliente.

El admin puede responder directamente desde su cliente de email.

---

## Deploy de la Función

```bash
supabase functions deploy send-email

# Setear secrets
supabase secrets set RESEND_API_KEY=re_xxxx
supabase secrets set EMAIL_FROM="Glow Boxes <noreply@glowboxes.com.ar>"
supabase secrets set ADMIN_EMAIL=hola@glowboxes.ar
```

---

## Agregar un Nuevo Tipo de Email

1. Agregar el tipo al enum en `_shared/types.ts`
2. Agregar a `VALID_TYPES` en `send-email/index.ts`
3. Implementar `renderNuevoTipo()` en `_shared/templates.ts`
4. Agregar el case al switch del dispatcher en `templates.ts`
5. Si es público: agregar a `PUBLIC_EMAIL_TYPES` en `types.ts`

---

## Troubleshooting

**El email no llega:**
- Verificar en Resend dashboard → Logs.
- Verificar que el dominio `glowboxes.com.ar` está verificado en Resend.
- Revisar SPF/DKIM/DMARC del dominio.

**`RESEND_API_KEY secret is not configured`:**
- `supabase secrets set RESEND_API_KEY=re_xxxx`

**Rate limit alcanzado en tests:**
- Resetear en frío haciendo un nuevo deploy de la función.
