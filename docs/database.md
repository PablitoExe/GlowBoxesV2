# Base de Datos — Glow Boxes

## Stack

- **Motor:** PostgreSQL 15 (via Supabase)
- **Auth:** Supabase Auth (JWT)
- **Seguridad:** Row Level Security (RLS) en todas las tablas
- **Extensiones:** `pgcrypto`, `unaccent`

---

## Tablas Principales

| Tabla | Descripción |
|-------|-------------|
| `perfiles` | Extiende `auth.users`. Campos: nombre, apellido, role, vip, estado. |
| `productos` | Catálogo con stock, SKU, precios, imágenes (JSONB). |
| `categorias` | Rubros de productos (detailing, wrap, PPF, etc.). |
| `marcas` | Marcas de productos. |
| `pedidos` | Órdenes de compra. Incluye campos MP y pago. |
| `pedido_items` | Líneas de cada pedido. |
| `movimientos_stock` | Auditoría de cambios de stock (venta, liberación, ajuste). |
| `consentimientos` | Registro de aceptación de términos/privacidad por usuario. |
| `cupones` | Códigos de descuento con reglas de validez. |
| `direcciones` | Direcciones de envío guardadas por usuario. |
| `favoritos` | Lista de favoritos del usuario. |
| `carrito_items` | Carrito persistido en DB (backup del carrito local). |

---

## Funciones RPC

| Función | Tipo | Descripción |
|---------|------|-------------|
| `create_order(...)` | `security invoker` | Crea pedido + items + decrementa stock en una sola transacción. |
| `decrement_stock_for_order(items, numero, user_id, pedido_id)` | `security definer` | Decrementa stock de cada producto. Raises `STOCK_INSUFICIENTE:nombre` si falla. |
| `release_order_stock(pedido_id)` | `security definer` | Restaura stock cuando el pago es rechazado/reembolsado. |
| `admin_adjust_stock(producto_id, cantidad, motivo)` | `security definer` | Ajuste manual de stock por admin. |
| `get_my_role()` | `security definer` | Retorna el role del usuario autenticado (`user`, `admin`, `anon`). |
| `is_admin()` | `security definer` | Helper: `get_my_role() = 'admin'`. |
| `get_public_site_stats()` | `security definer` | Stats públicas (conteos de clientes, productos, etc.). |

---

## RLS — Reglas Principales

### `pedidos`
- Usuario autenticado: ve/modifica solo sus propios pedidos.
- Admin: ve/modifica todos.

### `productos`, `categorias`, `marcas`
- Lectura: pública (anon puede leer).
- Escritura: solo admin.

### `movimientos_stock`
- Lectura/escritura: solo admin.
- Las funciones `security definer` escriben sin restricción de RLS.

### `consentimientos`
- Lectura/inserción: propio usuario.
- Todas las operaciones: admin.

---

## Convenciones

- UUIDs como primary keys (`gen_random_uuid()`).
- `created_at` / `updated_at` en todas las tablas.
- Trigger `update_updated_at()` actualiza `updated_at` automáticamente.
- Trigger `set_slug_from_nombre()` genera slug desde el nombre.
- `security definer` solo para funciones que necesitan bypasear RLS (stock, stats).
- `security invoker` para funciones que deben respetar los permisos del llamador.

---

## Aplicar Migraciones

Ver `docs/deploy.md` para el orden correcto. Siempre en el SQL Editor o via CLI:

```bash
supabase db push   # aplica migraciones pendientes
supabase db reset  # resetea a estado inicial (destructivo — solo dev)
```
