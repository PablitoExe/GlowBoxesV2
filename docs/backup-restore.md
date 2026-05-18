# Backup y Restauración — Glow Boxes

## Setup

```bash
cd backups/
cp .env.example .env
# Editar .env con las credenciales reales
```

Los scripts leen las credenciales del archivo `.env` en el mismo directorio.

---

## Backup Manual

```bash
cd backups/
./backup-db.sh
# Crea: dumps/glowboxes_20250517_143022.sql.gz
```

Para especificar directorio de salida:
```bash
./backup-db.sh /tmp/mi-backup
```

---

## Rotación de Backups

```bash
./rotate.sh
# Mantiene los últimos 14 backups (configurable via BACKUP_KEEP en .env)
```

---

## Backup + Rotación Automática (cron)

```bash
# crontab -e
# Backup diario a las 3 AM + rotación inmediata
0 3 * * * cd /home/ubuntu/glowboxes/backups && ./backup-db.sh >> /var/log/glowboxes-backup.log 2>&1 && ./rotate.sh >> /var/log/glowboxes-backup.log 2>&1
```

---

## Restaurar un Backup

> ⚠️ **PELIGRO:** La restauración sobreescribe el schema public. Usarlo solo en emergencias o entornos de desarrollo.

```bash
cd backups/
./restore-db.sh dumps/glowboxes_20250517_143022.sql.gz
# Pide confirmación manual: "yes"
```

---

## Backup en Supabase (alternativa)

Supabase Pro y Team plans incluyen **Point-in-Time Recovery (PITR)**:
- Dashboard → Settings → Database → Backups
- Retención de hasta 30 días
- Sin necesidad de scripts externos

Los scripts de este directorio son útiles para backups locales adicionales o planes gratuitos.

---

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `PGHOST` | Host de la DB (db.{ref}.supabase.co) |
| `PGPORT` | Puerto (5432) |
| `PGDATABASE` | Nombre de la DB (postgres) |
| `PGUSER` | Usuario (postgres) |
| `PGPASSWORD` | Contraseña (en Settings → Database) |
| `BACKUP_DIR` | Directorio donde se guardan los backups |
| `BACKUP_KEEP` | Cantidad de backups a mantener (default: 14) |

---

## Verificar un Backup

```bash
# Ver contenido sin restaurar
gunzip -c dumps/glowboxes_20250517_143022.sql.gz | head -50

# Ver tamaño y fecha de todos los backups
ls -lh dumps/

# Contar tablas en el backup
gunzip -c dumps/glowboxes_20250517_143022.sql.gz | grep "^CREATE TABLE" | wc -l
```
