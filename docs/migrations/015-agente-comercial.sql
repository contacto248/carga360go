-- Migración 15 (src/lib/db.ts, MIGRATION_15_SQL): agente comercial de voz y texto.
-- Se aplica sola al arrancar el sitio (getDb). Solo crea tablas e índices nuevos:
-- no modifica ni borra filas de tablas existentes. Respaldar la base antes de desplegar.
-- Reversión manual (borra solo lo que agrega esta migración):
--   DROP TABLE agent_leads; DROP TABLE agent_messages; DROP TABLE agent_conversations;
--   DELETE FROM schema_migrations WHERE version = 15;

CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'telefono')),
  session_key TEXT NOT NULL,            -- web: cookie c360_agente; whatsapp: id de conversación; teléfono: CallSid
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ip_hash TEXT,                         -- sha256 truncado, nunca la IP
  state TEXT NOT NULL DEFAULT '{}',     -- paso del flujo (JSON)
  last_intent TEXT,
  handoff_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_conv_session ON agent_conversations(channel, session_key);
CREATE INDEX IF NOT EXISTS idx_agent_conv_updated ON agent_conversations(updated_at);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('cliente', 'agente', 'sistema')),
  body TEXT NOT NULL,                   -- texto con números de tarjeta y claves enmascarados
  via TEXT CHECK (via IN ('texto', 'voz')),
  engine TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_msg_conv ON agent_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS agent_leads (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- número visible para el cliente (C360-XXXXXX)
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'telefono')),
  kind TEXT NOT NULL CHECK (kind IN ('cotizacion', 'registro', 'derivacion')),
  status TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'en_gestion', 'cerrado', 'descartado')),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT,
  contact TEXT,
  contact_type TEXT CHECK (contact_type IS NULL OR contact_type IN ('email', 'telefono')),
  backup_contact TEXT,
  backup_contact_type TEXT CHECK (backup_contact_type IS NULL OR backup_contact_type IN ('email', 'telefono')),
  role TEXT,
  data TEXT NOT NULL DEFAULT '{}',      -- datos de la solicitud (origen, destino, fecha, mercancía...)
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_leads_created ON agent_leads(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_leads_status ON agent_leads(status, kind);
