import { randomBytes, randomUUID } from "crypto";
import { getDb } from "../db";
import { EMPTY_STATE, type AgentChannel, type AgentState, type ContactType, type LeadKind, type LeadStatus } from "./types";

export type AgentConversation = {
  id: string;
  channel: AgentChannel;
  sessionKey: string;
  userId: string | null;
  ipHash: string | null;
  state: AgentState;
  lastIntent: string | null;
  handoffAt: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentMessage = {
  id: string;
  conversationId: string;
  role: "cliente" | "agente" | "sistema";
  body: string;
  via: "texto" | "voz" | null;
  engine: string | null;
  createdAt: string;
};

export type AgentLead = {
  id: string;
  code: string;
  conversationId: string | null;
  channel: AgentChannel;
  kind: LeadKind;
  status: LeadStatus;
  userId: string | null;
  name: string | null;
  contact: string | null;
  contactType: ContactType | null;
  backupContact: string | null;
  backupContactType: ContactType | null;
  role: string | null;
  data: Record<string, string>;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

type ConvRow = {
  id: string;
  channel: AgentChannel;
  session_key: string;
  user_id: string | null;
  ip_hash: string | null;
  state: string;
  last_intent: string | null;
  handoff_at: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
};

type MsgRow = {
  id: string;
  conversation_id: string;
  role: AgentMessage["role"];
  body: string;
  via: AgentMessage["via"];
  engine: string | null;
  created_at: string;
};

type LeadRow = {
  id: string;
  code: string;
  conversation_id: string | null;
  channel: AgentChannel;
  kind: LeadKind;
  status: LeadStatus;
  user_id: string | null;
  name: string | null;
  contact: string | null;
  contact_type: ContactType | null;
  backup_contact: string | null;
  backup_contact_type: ContactType | null;
  role: string | null;
  data: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function toConv(row: ConvRow): AgentConversation {
  const state = parseJson<AgentState>(row.state, { ...EMPTY_STATE });
  return {
    id: row.id,
    channel: row.channel,
    sessionKey: row.session_key,
    userId: row.user_id,
    ipHash: row.ip_hash,
    state: { flow: state.flow ?? null, step: state.step ?? null, data: state.data ?? {}, correcting: state.correcting, leadId: state.leadId ?? null },
    lastIntent: row.last_intent,
    handoffAt: row.handoff_at,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMsg(row: MsgRow): AgentMessage {
  return { id: row.id, conversationId: row.conversation_id, role: row.role, body: row.body, via: row.via, engine: row.engine, createdAt: row.created_at };
}

function toLead(row: LeadRow): AgentLead {
  return {
    id: row.id,
    code: row.code,
    conversationId: row.conversation_id,
    channel: row.channel,
    kind: row.kind,
    status: row.status,
    userId: row.user_id,
    name: row.name,
    contact: row.contact,
    contactType: row.contact_type,
    backupContact: row.backup_contact,
    backupContactType: row.backup_contact_type,
    role: row.role,
    data: parseJson<Record<string, string>>(row.data, {}),
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAgentConversation(id: string): AgentConversation | null {
  const row = getDb().prepare(`SELECT * FROM agent_conversations WHERE id = ?`).get(id) as ConvRow | undefined;
  return row ? toConv(row) : null;
}

export function findAgentConversation(channel: AgentChannel, sessionKey: string): AgentConversation | null {
  const row = getDb()
    .prepare(`SELECT * FROM agent_conversations WHERE channel = ? AND session_key = ? ORDER BY updated_at DESC LIMIT 1`)
    .get(channel, sessionKey) as ConvRow | undefined;
  return row ? toConv(row) : null;
}

export function upsertAgentConversation(
  input: { channel: AgentChannel; sessionKey: string; userId?: string | null; ipHash?: string | null },
  at: string,
): AgentConversation {
  const db = getDb();
  const existing = findAgentConversation(input.channel, input.sessionKey);
  if (existing) {
    db.prepare(`UPDATE agent_conversations SET user_id = COALESCE(?, user_id), ip_hash = COALESCE(?, ip_hash), updated_at = ? WHERE id = ?`).run(
      input.userId ?? null,
      input.ipHash ?? null,
      at,
      existing.id,
    );
    return getAgentConversation(existing.id)!;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO agent_conversations (id, channel, session_key, user_id, ip_hash, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
  ).run(id, input.channel, input.sessionKey, input.userId ?? null, input.ipHash ?? null, at, at);
  return getAgentConversation(id)!;
}

export function saveAgentState(id: string, state: AgentState, lastIntent: string | null, at: string) {
  getDb()
    .prepare(`UPDATE agent_conversations SET state = ?, last_intent = COALESCE(?, last_intent), updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(state), lastIntent, at, id);
}

export function markAgentHandoff(id: string, at: string) {
  getDb().prepare(`UPDATE agent_conversations SET handoff_at = COALESCE(handoff_at, ?) WHERE id = ?`).run(at, id);
}

export function insertAgentMessage(input: {
  conversationId: string;
  role: AgentMessage["role"];
  body: string;
  via?: AgentMessage["via"];
  engine?: string | null;
  at: string;
}): AgentMessage {
  const id = randomUUID();
  const db = getDb();
  db.prepare(`INSERT INTO agent_messages (id, conversation_id, role, body, via, engine, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    input.conversationId,
    input.role,
    input.body.slice(0, 2000),
    input.via ?? null,
    input.engine ?? null,
    input.at,
  );
  db.prepare(`UPDATE agent_conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?`).run(input.at, input.conversationId);
  return { id, conversationId: input.conversationId, role: input.role, body: input.body, via: input.via ?? null, engine: input.engine ?? null, createdAt: input.at };
}

/** Últimos `limit` mensajes en orden cronológico. */
export function listAgentMessages(conversationId: string, limit = 200): AgentMessage[] {
  const rows = getDb()
    .prepare(`SELECT * FROM (SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at ASC`)
    .all(conversationId, Math.min(Math.max(limit, 1), 500)) as MsgRow[];
  return rows.map(toMsg);
}

/** Respuestas del agente desde `sinceIso` (límite por sesión, independiente del proceso). */
export function agentRepliesSince(conversationId: string, sinceIso: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM agent_messages WHERE conversation_id = ? AND role = 'agente' AND created_at >= ?`)
    .get(conversationId, sinceIso) as { n: number };
  return row.n;
}

export function listAgentConversations(limit = 100): AgentConversation[] {
  const rows = getDb()
    .prepare(`SELECT * FROM agent_conversations ORDER BY updated_at DESC LIMIT ?`)
    .all(Math.min(Math.max(limit, 1), 500)) as ConvRow[];
  return rows.map(toConv);
}

/** Código corto y legible para el cliente (sin 0/O/1/I). */
export function newLeadCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `C360-${code}`;
}

export function createAgentLead(input: {
  conversationId: string | null;
  channel: AgentChannel;
  kind: LeadKind;
  userId?: string | null;
  name?: string | null;
  contact?: string | null;
  contactType?: ContactType | null;
  backupContact?: string | null;
  backupContactType?: ContactType | null;
  role?: string | null;
  data?: Record<string, string>;
  summary?: string | null;
  at: string;
}): AgentLead {
  const id = randomUUID();
  const db = getDb();
  let code = newLeadCode();
  for (let i = 0; i < 5 && db.prepare(`SELECT 1 FROM agent_leads WHERE code = ?`).get(code); i += 1) code = newLeadCode();
  db.prepare(
    `INSERT INTO agent_leads (id, code, conversation_id, channel, kind, status, user_id, name, contact, contact_type, backup_contact,
       backup_contact_type, role, data, summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'nuevo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    code,
    input.conversationId,
    input.channel,
    input.kind,
    input.userId ?? null,
    input.name ?? null,
    input.contact ?? null,
    input.contactType ?? null,
    input.backupContact ?? null,
    input.backupContactType ?? null,
    input.role ?? null,
    JSON.stringify(input.data ?? {}),
    input.summary ? input.summary.slice(0, 2000) : null,
    input.at,
    input.at,
  );
  return getAgentLead(id)!;
}

export function getAgentLead(id: string): AgentLead | null {
  const row = getDb().prepare(`SELECT * FROM agent_leads WHERE id = ?`).get(id) as LeadRow | undefined;
  return row ? toLead(row) : null;
}

export function updateLeadContact(
  id: string,
  contact: { contact?: string | null; contactType?: ContactType | null; backupContact?: string | null; backupContactType?: ContactType | null },
  at: string,
) {
  getDb()
    .prepare(
      `UPDATE agent_leads SET contact = COALESCE(?, contact), contact_type = COALESCE(?, contact_type),
         backup_contact = COALESCE(?, backup_contact), backup_contact_type = COALESCE(?, backup_contact_type), updated_at = ? WHERE id = ?`,
    )
    .run(contact.contact ?? null, contact.contactType ?? null, contact.backupContact ?? null, contact.backupContactType ?? null, at, id);
}

export function setLeadStatus(id: string, status: LeadStatus, at: string): boolean {
  return getDb().prepare(`UPDATE agent_leads SET status = ?, updated_at = ? WHERE id = ?`).run(status, at, id).changes > 0;
}

export function listAgentLeads(filters: { status?: LeadStatus; kind?: LeadKind; limit?: number } = {}): AgentLead[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.status) {
    where.push("status = ?");
    args.push(filters.status);
  }
  if (filters.kind) {
    where.push("kind = ?");
    args.push(filters.kind);
  }
  const sql = `SELECT * FROM agent_leads ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`;
  args.push(Math.min(Math.max(filters.limit ?? 200, 1), 1000));
  return (getDb().prepare(sql).all(...args) as LeadRow[]).map(toLead);
}

export type AgentIndicators = {
  conversations7d: number;
  messages7d: number;
  voiceMessages7d: number;
  handoffs7d: number;
  leadsByKind: Record<LeadKind, number>;
  leadsByStatus: Record<LeadStatus, number>;
  byChannel: Record<AgentChannel, number>;
};

export function agentIndicators(now = new Date()): AgentIndicators {
  const db = getDb();
  const since = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
  const one = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const leadsByKind: Record<LeadKind, number> = { cotizacion: 0, registro: 0, derivacion: 0 };
  for (const row of db.prepare(`SELECT kind, COUNT(*) AS n FROM agent_leads GROUP BY kind`).all() as { kind: LeadKind; n: number }[]) leadsByKind[row.kind] = row.n;
  const leadsByStatus: Record<LeadStatus, number> = { nuevo: 0, en_gestion: 0, cerrado: 0, descartado: 0 };
  for (const row of db.prepare(`SELECT status, COUNT(*) AS n FROM agent_leads GROUP BY status`).all() as { status: LeadStatus; n: number }[]) {
    leadsByStatus[row.status] = row.n;
  }
  const byChannel: Record<AgentChannel, number> = { web: 0, whatsapp: 0, telefono: 0 };
  for (const row of db
    .prepare(`SELECT channel, COUNT(*) AS n FROM agent_conversations WHERE updated_at >= ? GROUP BY channel`)
    .all(since) as { channel: AgentChannel; n: number }[]) {
    byChannel[row.channel] = row.n;
  }
  return {
    conversations7d: one(`SELECT COUNT(*) AS n FROM agent_conversations WHERE updated_at >= ?`, since),
    messages7d: one(`SELECT COUNT(*) AS n FROM agent_messages WHERE created_at >= ?`, since),
    voiceMessages7d: one(`SELECT COUNT(*) AS n FROM agent_messages WHERE created_at >= ? AND via = 'voz'`, since),
    handoffs7d: one(`SELECT COUNT(*) AS n FROM agent_conversations WHERE handoff_at >= ?`, since),
    leadsByKind,
    leadsByStatus,
    byChannel,
  };
}

/**
 * Retención: borra conversaciones sin lead más antiguas que `days` (sus mensajes se borran en cascada).
 * Las conversaciones con lead se conservan para el seguimiento comercial. No está programada: ver CAMBIOS_AGENTE_VOZ.md.
 */
export function purgeOldAgentConversations(days = 180, now = new Date()): number {
  const cutoff = new Date(now.getTime() - days * 24 * 3600_000).toISOString();
  return getDb()
    .prepare(
      `DELETE FROM agent_conversations WHERE updated_at < ? AND id NOT IN (SELECT conversation_id FROM agent_leads WHERE conversation_id IS NOT NULL)`,
    )
    .run(cutoff).changes;
}

/** Último lead de un tipo en la conversación (para no duplicar derivaciones). */
export function latestLeadFor(conversationId: string, kind: LeadKind): AgentLead | null {
  const row = getDb()
    .prepare(`SELECT * FROM agent_leads WHERE conversation_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1`)
    .get(conversationId, kind) as LeadRow | undefined;
  return row ? toLead(row) : null;
}
