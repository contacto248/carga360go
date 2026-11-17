-- Migración 031: severidad de las alertas de la torre.
-- La aplica src/lib/db.ts (MIGRATION_31_SQL) al arrancar, si aún no está la versión 31.
-- Aditiva: una columna en ops_alerts. No cambia los kinds (atraso, detencion, sin_senal).
-- No modifica users, loads, offers, trip_events, trip_gps_points ni las migraciones 022 a 030.
-- Las filas que ya existan quedan en 'media'. El código clasifica las que abre después.
-- Reversa: docs/migrations/031-ops-alertas-severity-rollback.sql

ALTER TABLE ops_alerts ADD COLUMN severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('baja', 'media', 'alta'));
