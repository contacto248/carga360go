-- Migración 024 (src/lib/db.ts, MIGRATION_24_SQL): procurement del núcleo operativo.
-- Se aplica sola al arrancar el sitio (getDb), aunque los flags OPS estén apagados.
-- Solo crea tablas e índices nuevos. No modifica users, loads, offers, trip_events,
-- freight_payments, pod_evidence ni las tablas de la 022. No inserta filas de ejemplo.
-- Las zonas de ejemplo viven solo en scripts/seed-dev.ts.
-- Reversa: docs/migrations/024-ops-procurement-rollback.sql

CREATE TABLE IF NOT EXISTS ops_zones (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES ops_organizations(id),
  name TEXT NOT NULL,
  comunas_json TEXT NOT NULL DEFAULT '[]',
  region TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_lanes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES ops_organizations(id),
  origin_zone_id TEXT NOT NULL REFERENCES ops_zones(id),
  destination_zone_id TEXT NOT NULL REFERENCES ops_zones(id),
  distance_km REAL,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, origin_zone_id, destination_zone_id)
);

CREATE TABLE IF NOT EXISTS ops_contracts (
  id TEXT PRIMARY KEY,
  shipper_org_id TEXT NOT NULL REFERENCES ops_organizations(id),
  carrier_org_id TEXT REFERENCES ops_organizations(id),
  kind TEXT NOT NULL CHECK (kind IN ('contrato_marco', 'licitacion', 'spot')),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('borrador', 'en_revision', 'vigente', 'vencido', 'terminado')),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  parent_id TEXT REFERENCES ops_contracts(id),
  document_id TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (valid_from < valid_to)
);

CREATE TABLE IF NOT EXISTS ops_rate_cards (
  id TEXT PRIMARY KEY,
  contract_id TEXT REFERENCES ops_contracts(id),
  shipper_org_id TEXT NOT NULL REFERENCES ops_organizations(id),
  carrier_org_id TEXT REFERENCES ops_organizations(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('borrador', 'vigente', 'vencida', 'anulada')),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (valid_from < valid_to)
);

CREATE TABLE IF NOT EXISTS ops_rate_card_lines (
  id TEXT PRIMARY KEY,
  rate_card_id TEXT NOT NULL REFERENCES ops_rate_cards(id) ON DELETE CASCADE,
  lane_id TEXT NOT NULL REFERENCES ops_lanes(id),
  equipment TEXT NOT NULL,
  vehicle_class TEXT,
  rate_kind TEXT NOT NULL CHECK (rate_kind IN ('por_viaje', 'por_tonelada', 'por_km')),
  amount_clp INTEGER NOT NULL CHECK (amount_clp > 0),
  min_charge_clp INTEGER CHECK (min_charge_clp IS NULL OR min_charge_clp > 0),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS ops_commercial_terms (
  id TEXT PRIMARY KEY,
  rate_card_id TEXT NOT NULL REFERENCES ops_rate_cards(id) ON DELETE CASCADE,
  payment_days INTEGER NOT NULL CHECK (payment_days >= 0),
  diesel_clause_json TEXT,
  detention_free_hours REAL,
  detention_rate_clp INTEGER CHECK (detention_rate_clp IS NULL OR detention_rate_clp >= 0),
  insurance_required INTEGER NOT NULL CHECK (insurance_required IN (0, 1)),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS ops_slas (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES ops_contracts(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('retiro_a_tiempo', 'entrega_a_tiempo', 'tiempo_aceptacion', 'pod_en_plazo', 'documentos_al_dia')),
  target REAL NOT NULL,
  unit TEXT NOT NULL,
  tolerance REAL,
  penalty_note TEXT,
  CHECK (unit != '%' OR (target >= 0 AND target <= 100))
);

CREATE TABLE IF NOT EXISTS ops_versions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  changed_by TEXT,
  change_note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (entity_type, entity_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ops_zones_org ON ops_zones(org_id);
CREATE INDEX IF NOT EXISTS idx_ops_lanes_org ON ops_lanes(org_id);
CREATE INDEX IF NOT EXISTS idx_ops_contracts_shipper ON ops_contracts(shipper_org_id, status);
CREATE INDEX IF NOT EXISTS idx_ops_rate_cards_shipper ON ops_rate_cards(shipper_org_id, status);
CREATE INDEX IF NOT EXISTS idx_ops_rate_lines_card ON ops_rate_card_lines(rate_card_id);
CREATE INDEX IF NOT EXISTS idx_ops_terms_card ON ops_commercial_terms(rate_card_id);
CREATE INDEX IF NOT EXISTS idx_ops_slas_contract ON ops_slas(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_versions_entity ON ops_versions(entity_type, entity_id);
