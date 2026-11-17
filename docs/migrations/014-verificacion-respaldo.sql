-- Migración 14. La aplica src/lib/db.ts al arrancar, dentro de una transacción.
-- No se ejecutó en producción: va junto con la 15 y la 16, en ese orden.
-- Solo agrega columnas nulas. No modifica ni borra filas.
-- SQLite de este proyecto no acepta ADD COLUMN IF NOT EXISTS. La aplicación
-- revisa PRAGMA table_info y omite la columna si ya existe. Si la versión 14
-- ya estaba registrada, no inserta otro registro.
-- Volver a ejecutar este archivo a mano falla si las columnas ya existen.

ALTER TABLE users ADD COLUMN backup_contact TEXT;
ALTER TABLE users ADD COLUMN backup_contact_type TEXT;
ALTER TABLE users ADD COLUMN backup_contact_at TEXT;
ALTER TABLE users ADD COLUMN manual_readonly_until TEXT;
ALTER TABLE users ADD COLUMN manual_readonly_at TEXT;
ALTER TABLE users ADD COLUMN manual_readonly_by TEXT;
ALTER TABLE users ADD COLUMN manual_readonly_by_email TEXT;
CREATE INDEX IF NOT EXISTS idx_users_manual_readonly ON users(manual_readonly_until);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
