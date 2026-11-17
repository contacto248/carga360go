-- Migración 029 (OPS-302, OPS-303 y OPS-304): geocercas, ETA, alertas y enlace de seguimiento.
-- La aplica src/lib/db.ts (MIGRATION_29_SQL) al arrancar, si aún no está la versión 29.
-- Solo crea tablas e índices nuevos. No modifica users, loads, offers, trip_events,
-- trip_gps_points ni las tablas de las migraciones 022 a 028.
-- El ETA lee la última fila de trip_gps_points; no reconstruye esa tabla.
-- Reversa: docs/migrations/029-ops-torre-rollback.sql

CREATE TABLE IF NOT EXISTS ops_geofences (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  point TEXT NOT NULL CHECK (point IN ('origen', 'destino')),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_m REAL NOT NULL CHECK (radius_m > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (shipment_id, point)
);
CREATE INDEX IF NOT EXISTS idx_ops_geofences_shipment ON ops_geofences(shipment_id);

CREATE TABLE IF NOT EXISTS ops_eta_snapshots (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  gps_point_id TEXT,
  from_lat REAL NOT NULL,
  from_lng REAL NOT NULL,
  to_lat REAL NOT NULL,
  to_lng REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  distance_m REAL NOT NULL,
  duration_s REAL NOT NULL,
  duration_truck_s REAL NOT NULL,
  factor REAL NOT NULL,
  eta_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  profile TEXT NOT NULL,
  truck_aware INTEGER NOT NULL CHECK (truck_aware IN (0, 1)),
  evaluacion_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_eta_shipment ON ops_eta_snapshots(shipment_id, created_at);

CREATE TABLE IF NOT EXISTS ops_alert_rules (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('atraso', 'detencion', 'sin_senal')),
  threshold_min INTEGER NOT NULL CHECK (threshold_min > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (shipment_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_ops_alert_rules_shipment ON ops_alert_rules(shipment_id);

CREATE TABLE IF NOT EXISTS ops_alerts (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES ops_shipments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('atraso', 'detencion', 'sin_senal')),
  status TEXT NOT NULL CHECK (status IN ('abierta', 'cerrada')),
  evidence_json TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_shipment ON ops_alerts(shipment_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_alerts_open ON ops_alerts(shipment_id, kind) WHERE status = 'abierta';

CREATE TABLE IF NOT EXISTS ops_tracking_links (
  token TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL UNIQUE REFERENCES ops_shipments(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
