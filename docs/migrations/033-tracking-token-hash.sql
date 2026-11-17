-- Migración 033: hash SHA-256 del token del enlace público de seguimiento.
-- La aplica src/lib/db.ts (MIGRATION_33_SQL) al arrancar, si aún no está la versión 33.
-- Aditiva: una columna en ops_tracking_links. Sustituye el token en claro por su hash.
-- sha256(texto) es SHA-256 en hexadecimal, la misma cuenta que tokenHash. El arranque la registra antes de este SQL.
-- Un valor que ya es 64 hexadecimales en minúscula se conserva (no se vuelve a hashear).
-- En audit_log la metadata es la columna detail. Las filas ops.seguimiento_emitido
-- cambian {"token":"..."} por {"prefijo":"......"}. No se borran filas.
-- No modifica users, loads, offers, trip_events ni las migraciones 022 a 032.
-- Reversa: docs/migrations/033-tracking-token-hash-rollback.sql
-- La reversa no recupera el token en claro.

ALTER TABLE ops_tracking_links ADD COLUMN token_hash TEXT NOT NULL DEFAULT '';

UPDATE ops_tracking_links
SET token_hash = CASE
  WHEN length(token) = 64 AND token NOT GLOB '*[^0-9a-f]*' THEN token
  ELSE sha256(token)
END
WHERE token_hash = '';

UPDATE ops_tracking_links
SET token = token_hash
WHERE token != token_hash;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_tracking_links_token_hash ON ops_tracking_links(token_hash);

UPDATE audit_log
SET detail = json_remove(
  json_set(detail, '$.prefijo', substr(json_extract(detail, '$.token'), 1, 6)),
  '$.token'
)
WHERE action = 'ops.seguimiento_emitido'
  AND json_extract(detail, '$.token') IS NOT NULL;
