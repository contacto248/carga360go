-- Migración 19 (SQLite). Solo agrega la columna del RUT leído del archivo. No inserta filas.
ALTER TABLE documentos_acreditacion ADD COLUMN rut_extraido TEXT;
