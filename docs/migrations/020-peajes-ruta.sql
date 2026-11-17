-- Migración 20: vuelve a sembrar peajes con INSERT OR IGNORE (src/lib/db.ts llama seedTolls).
-- Agrega las plazas verificadas de Ruta 68 (Lo Prado, Zapata, Troncal Sur) y Angostura (Ruta 5 Sur).
-- No borra plazas ni tarifas que ya estaban. Las tarifas salen de los PDF del MOP citados en tolls-data.ts.
INSERT INTO schema_migrations (version, applied_at) VALUES (20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
