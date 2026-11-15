/** Migración 17, SQLite. Solo crea tablas. No inserta personas ni ejemplos. */
export const MIGRATION_17_SQL = `
CREATE TABLE IF NOT EXISTS solicitudes_carga (
  id TEXT PRIMARY KEY,
  empresa TEXT,
  contacto TEXT,
  origen TEXT,
  destino TEXT,
  tipo_carga TEXT,
  fecha TEXT,
  mensaje TEXT,
  estado_admin TEXT NOT NULL DEFAULT 'pendiente_ok' CHECK (estado_admin IN ('pendiente_ok', 'aprobado', 'rechazado', 'renovacion')),
  estado_ia TEXT,
  comentario_ia TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transportistas (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  rut TEXT,
  telefono TEXT,
  correo TEXT,
  ciudad TEXT,
  mensaje TEXT,
  user_id TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'activo')),
  estado_admin TEXT NOT NULL DEFAULT 'pendiente_ok' CHECK (estado_admin IN ('pendiente_ok', 'aprobado', 'rechazado', 'renovacion')),
  estado_ia TEXT,
  comentario_ia TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documentos_acreditacion (
  id TEXT PRIMARY KEY,
  transportista_id TEXT NOT NULL REFERENCES transportistas(id),
  tipo TEXT NOT NULL,
  archivo TEXT,
  vencimiento TEXT,
  estado_admin TEXT NOT NULL DEFAULT 'pendiente_ok' CHECK (estado_admin IN ('pendiente_ok', 'aprobado', 'rechazado', 'renovacion')),
  estado_ia TEXT,
  comentario_ia TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documentos_acreditacion_estado ON documentos_acreditacion(estado_admin, vencimiento);
CREATE TABLE IF NOT EXISTS admin_bassam_360 (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('agente', 'humano', 'alerta')),
  tabla TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  comentario TEXT NOT NULL,
  accion TEXT NOT NULL,
  estado_ia TEXT,
  actor_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_bassam_360_registro ON admin_bassam_360(tabla, registro_id, created_at);
`;
