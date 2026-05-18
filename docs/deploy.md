# Deploy Guide — Glow Boxes

## Pre-requisitos

- Node.js 18+ (solo para herramientas locales de Supabase)
- Supabase CLI: `npm i -g supabase`
- PostgreSQL client (`psql`, `pg_dump`) para backups
- Acceso al panel de Supabase y Resend

---

## 1. Variables de Entorno (Supabase Secrets)

Configurar via CLI antes de deployer las Edge Functions:

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxxxx \
  EMAIL_FROM="Glow Boxes <noreply@glowboxes.com.ar>" \
  ADMIN_EMAIL=hola@glowboxes.com.ar \
  REPLY_TO=soporte@glowboxes.com.ar \
  MP_ACCESS_TOKEN=APP_USR-xxxxx \
  MP_WEBHOOK_SECRET=tu-secreto-mp-webhook \
  SITE_URL=https://glowboxes.com.ar \
  SUPABASE_SERVICE_ROLE_KEY=eyJxxxx   # encontralo en Settings > API
```

O desde el dashboard: **Settings → Edge Functions → Secrets**.

---

## 2. Deploy de Edge Functions

```bash
# Login
supabase login

# Enlazar al proyecto
supabase link --project-ref luduxepqcdhuhbuobduw

# Deploy de todas las funciones
supabase functions deploy send-email
supabase functions deploy mp-create-preference
supabase functions deploy mp-webhook
```

Verificar que estén activas en **Dashboard → Edge Functions**.

---

## 3. Migraciones SQL

Aplicar en orden en el **SQL Editor** de Supabase o via CLI:

```sql
-- 1. Esquema base
\i database/schema.sql

-- 2. Grants
\i database/grants.sql

-- 3. Políticas RLS
\i database/policies.sql

-- 4. Función create_order atómica (original)
\i database/migration_atomic_order.sql

-- 5. Producción v1: stock, MP, consentimientos
\i database/migration_prod_v1.sql
```

> **Importante:** `migration_prod_v1.sql` dropea y recrea `create_order`. Asegurate de que no haya pedidos en vuelo al aplicarlo.

---

## 4. Configuración de Resend

1. Verificar dominio `glowboxes.com.ar` en resend.com → Domains.
2. Agregar registros DNS indicados por Resend (SPF, DKIM, DMARC).
3. Obtener API Key y setearla como secret de Supabase.

---

## 5. Configuración de Mercado Pago (Producción)

1. Ir a **developers.mercadopago.com.ar** → Mi aplicación.
2. Obtener **Access Token de producción** (`APP_USR-...`).
3. Configurar webhook:
   - URL: `https://luduxepqcdhuhbuobduw.supabase.co/functions/v1/mp-webhook`
   - Eventos: `payment`
   - Copiar el **Secreto** y setearlo como `MP_WEBHOOK_SECRET`.

---

## 6. Frontend (Hosting estático)

El sitio es HTML/CSS/JS vanilla — se puede hostear en:
- **GitHub Pages**: `gh-pages` branch
- **Vercel / Netlify**: drag & drop o conectar repo
- **DonWeb**: subir archivos por FTP/cPanel

Asegurate de que `js/supabase.js` apunte a los valores correctos de `SUPABASE_URL` y `SUPABASE_ANON_KEY`.

---

## 7. Checklist de Producción

- [ ] Dominio verificado en Resend
- [ ] Secrets configurados en Supabase
- [ ] Edge Functions desplegadas y activas
- [ ] Migraciones SQL aplicadas
- [ ] Webhook de MP configurado y funcionando
- [ ] SSL activo en el dominio
- [ ] Backup automatizado configurado (ver `docs/backup-restore.md`)
- [ ] Admin con `role = 'admin'` en tabla `perfiles`
