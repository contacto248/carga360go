-- Migración 21: vuelve a sembrar peajes con INSERT OR IGNORE (src/lib/db.ts llama seedTolls).
-- Agrega Agua Amarilla (Ruta del Itata), tarifa de la columna homónima del PDF MOP 2026.
-- No borra plazas ni tarifas que ya estaban. Las plazas de Ruta 5 Sur sin nombre público no se insertan.
INSERT INTO schema_migrations (version, applied_at) VALUES (21, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
