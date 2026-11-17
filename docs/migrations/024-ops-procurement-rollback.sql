-- Reversa de la migración 024. Borra solo las tablas e índices que ella crea
-- y su fila en schema_migrations. No toca la 022 ni users, loads, offers,
-- trip_events, freight_payments ni pod_evidence.
DROP INDEX IF EXISTS idx_ops_versions_entity;
DROP INDEX IF EXISTS idx_ops_slas_contract;
DROP INDEX IF EXISTS idx_ops_terms_card;
DROP INDEX IF EXISTS idx_ops_rate_lines_card;
DROP INDEX IF EXISTS idx_ops_rate_cards_shipper;
DROP INDEX IF EXISTS idx_ops_contracts_shipper;
DROP INDEX IF EXISTS idx_ops_lanes_org;
DROP INDEX IF EXISTS idx_ops_zones_org;
DROP TABLE IF EXISTS ops_versions;
DROP TABLE IF EXISTS ops_slas;
DROP TABLE IF EXISTS ops_commercial_terms;
DROP TABLE IF EXISTS ops_rate_card_lines;
DROP TABLE IF EXISTS ops_rate_cards;
DROP TABLE IF EXISTS ops_contracts;
DROP TABLE IF EXISTS ops_lanes;
DROP TABLE IF EXISTS ops_zones;
DELETE FROM schema_migrations WHERE version = 24;
