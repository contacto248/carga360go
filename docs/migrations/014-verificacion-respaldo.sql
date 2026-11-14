-- Migración 14 (copia legible; la app la aplica sola al arrancar desde src/lib/db.ts, dentro de una transacción).
-- NO se ha ejecutado contra producción. Antes de desplegar: respaldo de la base (ver README, sección de respaldos).
-- Solo agrega columnas nulas a users; no modifica ni borra datos existentes.

-- Contacto de respaldo (teléfono chileno o correo) para cuentas con verificación pendiente.
ALTER TABLE users ADD COLUMN backup_contact TEXT;        -- teléfono normalizado (56XXXXXXXXX) o correo en minúsculas
ALTER TABLE users ADD COLUMN backup_contact_type TEXT;   -- 'telefono' | 'email'
ALTER TABLE users ADD COLUMN backup_contact_at TEXT;     -- ISO 8601 UTC de la última actualización

-- Verificación manual del administrador: solo lectura por 30 días (estado efectivo "manual_readonly").
ALTER TABLE users ADD COLUMN manual_readonly_until TEXT;     -- ISO 8601 UTC; vigente si > ahora y la cuenta no está verificada
ALTER TABLE users ADD COLUMN manual_readonly_at TEXT;        -- cuándo se otorgó
ALTER TABLE users ADD COLUMN manual_readonly_by TEXT;        -- id del administrador que lo aprobó
ALTER TABLE users ADD COLUMN manual_readonly_by_email TEXT;  -- correo del administrador (además queda en audit_log)
CREATE INDEX IF NOT EXISTS idx_users_manual_readonly ON users(manual_readonly_until);

INSERT INTO schema_migrations (version, applied_at) VALUES (14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Reversión manual (SQLite >= 3.35):
-- DROP INDEX IF EXISTS idx_users_manual_readonly;
-- ALTER TABLE users DROP COLUMN backup_contact; ... (una por columna)
-- DELETE FROM schema_migrations WHERE version = 14;
