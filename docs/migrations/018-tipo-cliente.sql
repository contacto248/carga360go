-- Migración 18 (SQLite), posterior a la 17. No reutiliza el número 17.
-- Agrega tipo_cliente y permite documentos de mandante sin inventar un transportista.
-- El INSERT solo copia filas que ya existen. Si la tabla está vacía, no agrega ninguna.

CREATE TABLE documentos_acreditacion_18 (
  id TEXT PRIMARY KEY,
  tipo_cliente TEXT NOT NULL DEFAULT 'transportista' CHECK (tipo_cliente IN ('transportista', 'mandante')),
  transportista_id TEXT REFERENCES transportistas(id),
  user_id TEXT,
  tipo TEXT NOT NULL,
  archivo TEXT,
  vencimiento TEXT,
  estado_admin TEXT NOT NULL DEFAULT 'pendiente_ok' CHECK (estado_admin IN ('pendiente_ok', 'aprobado', 'rechazado', 'renovacion')),
  estado_ia TEXT,
  comentario_ia TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO documentos_acreditacion_18 (
  id, tipo_cliente, transportista_id, tipo, archivo, vencimiento, estado_admin, estado_ia, comentario_ia, created_at, updated_at
)
SELECT id, 'transportista', transportista_id, tipo, archivo, vencimiento, estado_admin, estado_ia, comentario_ia, created_at, updated_at
FROM documentos_acreditacion;
DROP TABLE documentos_acreditacion;
ALTER TABLE documentos_acreditacion_18 RENAME TO documentos_acreditacion;
CREATE INDEX IF NOT EXISTS idx_documentos_acreditacion_estado ON documentos_acreditacion(estado_admin, vencimiento);
CREATE INDEX IF NOT EXISTS idx_documentos_acreditacion_tipo ON documentos_acreditacion(tipo_cliente, estado_admin);
