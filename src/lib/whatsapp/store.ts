import { randomUUID } from "crypto";
import { getDb } from "../db";
import { waConfig } from "./config";

export type WaConversation = {
  id: string;
  chatKey: string;
  waId: string | null;
  userId: string | null;
  name: string | null;
  botDisabled: boolean;
  pausedUntil: string | null;
  pauseReason: string | null;
  handoffAt: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string;
  createdAt: string;
};

export type WaMessage = {
  id: string;
  conversationId: string;
  wamid: string | null;
  direction: "in" | "out";
  source: "cliente" | "bot" | "humano" | "sistema";
  type: string;
  body: string;
  engine: string | null;
  status: string | null;
  createdAt: string;
};

type ConvRow = {
  id: string;
  chat_key: string;
  wa_id: string | null;
  user_id: string | null;
  name: string | null;
  bot_disabled: number;
  paused_until: string | null;
  pause_reason: string | null;
  handoff_at: string | null;
  last_inbound_at: string | null;
  last_message_at: string;
  created_at: string;
};

function toConv(row: ConvRow): WaConversation {
  return {
    id: row.id,
    chatKey: row.chat_key,
    waId: row.wa_id,
    userId: row.user_id,
    name: row.name,
    botDisabled: Boolean(row.bot_disabled),
    pausedUntil: row.paused_until,
    pauseReason: row.pause_reason,
    handoffAt: row.handoff_at,
    lastInboundAt: row.last_inbound_at,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

type MsgRow = {
  id: string;
  conversation_id: string;
  wamid: string | null;
  direction: "in" | "out";
  source: WaMessage["source"];
  type: string;
  body: string;
  engine: string | null;
  status: string | null;
  created_at: string;
};

function toMsg(row: MsgRow): WaMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    wamid: row.wamid,
    direction: row.direction,
    source: row.source,
    type: row.type,
    body: row.body,
    engine: row.engine,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Clave estable del chat: número (wa_id) si viene; si no, el identificador de usuario por empresa (BSUID). */
export function chatKeyFor(waId: string | null | undefined, userId: string | null | undefined): string | null {
  if (waId) return `wa:${waId}`;
  if (userId) return `uid:${userId}`;
  return null;
}

export function upsertConversation(input: { waId?: string | null; userId?: string | null; name?: string | null }, at: string): WaConversation | null {
  const key = chatKeyFor(input.waId, input.userId);
  if (!key) return null;
  const db = getDb();
  let row = db.prepare(`SELECT * FROM wa_conversations WHERE chat_key = ?`).get(key) as ConvRow | undefined;
  if (!row && input.waId && input.userId) {
    // Mismo usuario visto antes solo por BSUID.
    row = db.prepare(`SELECT * FROM wa_conversations WHERE chat_key = ?`).get(`uid:${input.userId}`) as ConvRow | undefined;
    if (row) db.prepare(`UPDATE wa_conversations SET chat_key = ? WHERE id = ?`).run(key, row.id);
  }
  if (!row) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO wa_conversations (id, chat_key, wa_id, user_id, name, last_message_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, key, input.waId || null, input.userId || null, input.name || null, at, at);
    row = db.prepare(`SELECT * FROM wa_conversations WHERE id = ?`).get(id) as ConvRow;
    return toConv(row);
  }
  db.prepare(
    `UPDATE wa_conversations SET wa_id = COALESCE(?, wa_id), user_id = COALESCE(?, user_id), name = COALESCE(?, name) WHERE id = ?`,
  ).run(input.waId || null, input.userId || null, input.name || null, row.id);
  return getConversation(row.id);
}

export function getConversation(id: string): WaConversation | null {
  const row = getDb().prepare(`SELECT * FROM wa_conversations WHERE id = ?`).get(id) as ConvRow | undefined;
  return row ? toConv(row) : null;
}

/** Último mensaje entrante conocido para un número (wa_id) o una cuenta vinculada. */
export function lastInboundAtFor(phoneDigits: string | null | undefined, userId?: string | null): string | null {
  const waId = (phoneDigits || "").replace(/\D/g, "") || null;
  const uid = userId || null;
  if (!waId && !uid) return null;
  const row = getDb()
    .prepare(
      `SELECT last_inbound_at FROM wa_conversations
       WHERE last_inbound_at IS NOT NULL AND ((? IS NOT NULL AND wa_id = ?) OR (? IS NOT NULL AND user_id = ?))
       ORDER BY last_inbound_at DESC LIMIT 1`,
    )
    .get(waId, waId, uid, uid) as { last_inbound_at: string } | undefined;
  return row?.last_inbound_at ?? null;
}

export function listConversations(limit = 200): (WaConversation & { lastBody: string | null; count: number })[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*, (SELECT body FROM wa_messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_body,
              (SELECT COUNT(*) FROM wa_messages m WHERE m.conversation_id = c.id) AS n
       FROM wa_conversations c ORDER BY c.last_message_at DESC LIMIT ?`,
    )
    .all(limit) as (ConvRow & { last_body: string | null; n: number })[];
  return rows.map((row) => ({ ...toConv(row), lastBody: row.last_body, count: row.n }));
}

export function listMessages(conversationId: string, limit = 200): WaMessage[] {
  const rows = getDb()
    .prepare(`SELECT * FROM (SELECT *, rowid AS rid FROM wa_messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at ASC, rid ASC`)
    .all(conversationId, limit) as MsgRow[];
  return rows.map(toMsg);
}

/** Inserta un mensaje. Devuelve null si el wamid ya existía (webhook repetido). */
export function insertMessage(input: {
  conversationId: string;
  wamid?: string | null;
  direction: "in" | "out";
  source: WaMessage["source"];
  type: string;
  body: string;
  engine?: string | null;
  status?: string | null;
  at: string;
}): WaMessage | null {
  const db = getDb();
  const id = randomUUID();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO wa_messages (id, conversation_id, wamid, direction, source, type, body, engine, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.conversationId, input.wamid || null, input.direction, input.source, input.type, input.body.slice(0, 4000), input.engine || null, input.status || null, input.at);
  if (result.changes === 0) return null;
  const sets = input.direction === "in" ? `last_message_at = ?, last_inbound_at = ?` : `last_message_at = ?`;
  const args = input.direction === "in" ? [input.at, input.at, input.conversationId] : [input.at, input.conversationId];
  db.prepare(`UPDATE wa_conversations SET ${sets} WHERE id = ?`).run(...args);
  const row = db.prepare(`SELECT * FROM wa_messages WHERE id = ?`).get(id) as MsgRow;
  return toMsg(row);
}

export function messageExists(wamid: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM wa_messages WHERE wamid = ?`).get(wamid));
}

export function updateMessageStatus(wamid: string, status: string) {
  getDb().prepare(`UPDATE wa_messages SET status = ? WHERE wamid = ?`).run(status.slice(0, 40), wamid);
}

export function setMessageWamid(id: string, wamid: string | null, status: string) {
  const db = getDb();
  if (wamid && !messageExists(wamid)) db.prepare(`UPDATE wa_messages SET wamid = ? WHERE id = ?`).run(wamid, id);
  db.prepare(`UPDATE wa_messages SET status = ? WHERE id = ?`).run(status, id);
}

export function recentHistory(conversationId: string, limit = 12): WaMessage[] {
  return listMessages(conversationId, limit);
}

export function botRepliesSince(conversationId: string, sinceIso: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM wa_messages WHERE conversation_id = ? AND source = 'bot' AND created_at >= ?`)
    .get(conversationId, sinceIso) as { n: number };
  return row.n;
}

export function pauseConversation(id: string, hours: number, reason: string, now = new Date()) {
  const until = new Date(now.getTime() + hours * 3600_000).toISOString();
  getDb().prepare(`UPDATE wa_conversations SET paused_until = ?, pause_reason = ? WHERE id = ?`).run(until, reason, id);
}

export function resumeConversation(id: string) {
  getDb().prepare(`UPDATE wa_conversations SET paused_until = NULL, pause_reason = NULL, handoff_at = NULL WHERE id = ?`).run(id);
}

export function setConversationBotDisabled(id: string, disabled: boolean) {
  getDb().prepare(`UPDATE wa_conversations SET bot_disabled = ? WHERE id = ?`).run(disabled ? 1 : 0, id);
}

export function markHandoff(id: string, at: string) {
  getDb().prepare(`UPDATE wa_conversations SET handoff_at = ? WHERE id = ?`).run(at, id);
}

export function isPaused(conv: WaConversation, now = new Date()): boolean {
  return Boolean(conv.pausedUntil && conv.pausedUntil > now.toISOString());
}

// ---- Ajustes globales ----

export function getSetting(key: string): string | null {
  const row = getDb().prepare(`SELECT value FROM wa_settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(`INSERT INTO wa_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, value, new Date().toISOString());
}

/** Bot global: el panel manda si se tocó; si no, WA_BOT_ENABLED. */
export function botGloballyEnabled(): boolean {
  const value = getSetting("bot_enabled");
  if (value === "on") return true;
  if (value === "off") return false;
  return waConfig().envEnabled;
}
