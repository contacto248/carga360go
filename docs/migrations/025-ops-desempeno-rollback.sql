-- Reversa de la migración 025. Borra solo las tablas e índices que ella crea
-- y su fila en schema_migrations. No toca 022, 023, 024 ni las tablas previas.
DROP INDEX IF EXISTS idx_ops_score_events_carrier;
DROP INDEX IF EXISTS idx_ops_carrier_scores_carrier;
DROP TABLE IF EXISTS ops_score_events;
DROP TABLE IF EXISTS ops_carrier_scores;
DELETE FROM schema_migrations WHERE version = 25;
