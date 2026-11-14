-- Migración 16: motor de costos logísticos (copia legible; la aplica src/lib/db.ts al arrancar).
-- Solo crea tablas nuevas; luego seedTolls() carga fuentes, plazas y tarifas verificadas (src/lib/costos/tolls-data.ts).
CREATE TABLE IF NOT EXISTS cost_params (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS cost_geocode_cache (
  key TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  label TEXT NOT NULL,
  region TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cost_route_cache (
  key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cost_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('peaje', 'diesel')),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  expected_sha256 TEXT,
  last_sha256 TEXT,
  status TEXT NOT NULL,
  last_ok_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cost_toll_plazas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  concession TEXT NOT NULL,
  route TEXT NOT NULL,
  km TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ambos', 'norte', 'sur')),
  scheme TEXT NOT NULL CHECK (scheme IN ('ejes', 'remolque')),
  kind TEXT NOT NULL,
  location_source TEXT NOT NULL,
  location_note TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES cost_sources(id),
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS cost_toll_rates (
  id TEXT PRIMARY KEY,
  plaza_id TEXT NOT NULL REFERENCES cost_toll_plazas(id),
  category TEXT NOT NULL,
  rate_type TEXT NOT NULL CHECK (rate_type IN ('unica', 'TBFP', 'TBP')),
  amount REAL NOT NULL CHECK (amount > 0),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES cost_sources(id),
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_toll_rates_plaza ON cost_toll_rates(plaza_id, category);
CREATE TABLE IF NOT EXISTS cost_diesel_prices (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  zone TEXT NOT NULL,
  price REAL NOT NULL,
  price_min REAL,
  price_max REAL,
  unit TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_diesel_zone ON cost_diesel_prices(zone, fetched_at);
CREATE TABLE IF NOT EXISTS cost_job_runs (
  id TEXT PRIMARY KEY,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS cost_quotes (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'revisada', 'enviada', 'descartada')),
  channel TEXT NOT NULL,
  origin_label TEXT NOT NULL,
  destination_label TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  distance_km REAL,
  base_cost INTEGER NOT NULL,
  reference_price INTEGER NOT NULL,
  complete INTEGER NOT NULL,
  method TEXT NOT NULL,
  input TEXT NOT NULL,
  result TEXT NOT NULL,
  contact TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_by_email TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_quotes_status ON cost_quotes(status, created_at);
