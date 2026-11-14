import { randomUUID } from "crypto";
import { getDb } from "../db";

export type WebChatConversation = {
  id: string;
  sessionId: string;
  ipHash: string | null;
  userAgent: string | null;
  botDisabled: boolean;
  handoffAt: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string;
  createdAt: string;
};

export type WebChatMessage = {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  source: "cliente" | "bot" | "sistema";
  body: string;
  engine: string | null;
  createdAt: string;
};

type ConvRow = {
  id: string;
  session_id: string;
  ip_hash: string | null;
  user_agent: string | null;
  bot_disabled: number;
  handoff_at: string | null;
  last_inbound_at: string | null;
  last_message_at: string;
  created_at: string;
};

type MsgRow = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  source: WebChatMessage["source"];
  body: string;
  engine: string | null;
  created_at: string;
};

function toConv(row: ConvRow): WebChatConversation {
  return {
    id: row.id,
    sessionId: row.session_id,
    ipHash: row.ip_hash,
    userAgent: row.user_agent,
    botDisabled: Boolean(row.bot_disabled),
    handoffAt: row.handoff_at,
    lastInboundAt: row.last_inbound_at,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

function toMsg(row: MsgRow): WebChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    source: row.source,
    body: row.body,
    engine: row.engine,
    createdAt: row.created_at,
  };
}

export function getWebConversation(id: string): WebChatConversation | null {
  const row = getDb().prepare(`SELECT * FROM web_chat_conversations WHERE id = ?`).get(id) as ConvRow | undefined;
  return row ? toConv(row) : null;
}

export function conversationForSession(sessionId: string): WebChatConversation | null {
  const row = getDb()
    .prepare(`SELECT * FROM web_chat_conversations WHERE session_id = ? ORDER BY last_message_at DESC LIMIT 1`)
    .get(sessionId) as ConvRow | undefined;
  return row ? toConv(row) : null;
}

export function upsertWebConversation(input: { sessionId: string; ipHash?: string | null; userAgent?: string | null }, at: string): WebChatConversation {
  const existing = conversationForSession(input.sessionId);
  const db = getDb();
  if (existing) {
    db.prepare(
      `UPDATE web_chat_conversations SET ip_hash = COALESCE(?, ip_hash), user_agent = COALESCE(?, user_agent) WHERE id = ?`,
    ).run(input.ipHash || null, input.userAgent || null, existing.id);
    return getWebConversation(existing.id)!;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO web_chat_conversations (id, session_id, ip_hash, user_agent, last_message_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.sessionId, input.ipHash || null, input.userAgent || null, at, at);
  return getWebConversation(id)!;
}

export function listWebConversations(limit = 200): (WebChatConversation & { lastBody: string | null; count: number })[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*, (SELECT body FROM web_chat_messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_body,
              (SELECT COUNT(*) FROM web_chat_messages m WHERE m.conversation_id = c.id) AS n
       FROM web_chat_conversations c ORDER BY c.last_message_at DESC LIMIT ?`,
    )
    .all(limit) as (ConvRow & { last_body: string | null; n: number })[];
  return rows.map((row) => ({ ...toConv(row), lastBody: row.last_body, count: row.n }));
}

export function listWebMessages(conversationId: string, limit = 200): WebChatMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM (SELECT *, rowid AS rid FROM web_chat_messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at ASC, rid ASC`,
    )
    .all(conversationId, limit) as MsgRow[];
  return rows.map(toMsg);
}

export function insertWebMessage(input: {
  conversationId: string;
  direction: "in" | "out";
  source: WebChatMessage["source"];
  body: string;
  engine?: string | null;
  at: string;
}): WebChatMessage {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO web_chat_messages (id, conversation_id, direction, source, body, engine, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.conversationId, input.direction, input.source, input.body.slice(0, 4000), input.engine || null, input.at);
  const sets = input.direction === "in" ? `last_message_at = ?, last_inbound_at = ?` : `last_message_at = ?`;
  const args = input.direction === "in" ? [input.at, input.at, input.conversationId] : [input.at, input.conversationId];
  db.prepare(`UPDATE web_chat_conversations SET ${sets} WHERE id = ?`).run(...args);
  const row = db.prepare(`SELECT * FROM web_chat_messages WHERE id = ?`).get(id) as MsgRow;
  return toMsg(row);
}

export function botRepliesSinceWeb(conversationId: string, sinceIso: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM web_chat_messages WHERE conversation_id = ? AND source = 'bot' AND created_at >= ?`)
    .get(conversationId, sinceIso) as { n: number };
  return row.n;
}

export function markWebHandoff(id: string, at: string) {
  getDb().prepare(`UPDATE web_chat_conversations SET handoff_at = ? WHERE id = ?`).run(at, id);
}

export function setWebConversationDisabled(id: string, disabled: boolean) {
  getDb().prepare(`UPDATE web_chat_conversations SET bot_disabled = ? WHERE id = ?`).run(disabled ? 1 : 0, id);
}
