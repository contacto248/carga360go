-- Migración 022 (src/lib/db.ts, MIGRATION_22_SQL): organizaciones y miembros del núcleo operativo.
-- Se aplica sola al arrancar el sitio (getDb), aunque los flags OPS estén apagados.
-- Solo crea tablas e índices nuevos. No modifica users, loads, offers, trip_events,
-- freight_payments ni pod_evidence. No inserta filas de ejemplo.
-- Reversa: docs/migrations/022-ops-organizaciones-rollback.sql

CREATE TABLE IF NOT EXISTS ops_organizations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('mandante', 'transportista', 'plataforma')),
  razon_social TEXT NOT NULL,
  rut_norm TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES ops_organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area TEXT,
  ops_role TEXT NOT NULL CHECK (ops_role IN ('org_admin', 'procurement', 'trafico', 'finanzas', 'auditor', 'lectura')),
  status TEXT NOT NULL CHECK (status IN ('activo', 'suspendido')),
  created_at TEXT NOT NULL,
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ops_org_members_user ON ops_org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ops_org_members_org ON ops_org_members(org_id);
