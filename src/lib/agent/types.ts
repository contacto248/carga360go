/**
 * Tipos del agente comercial CARGA360 (web, WhatsApp y teléfono).
 * El mismo motor (engine.ts) atiende los tres canales; cada canal solo adapta la entrada y la salida.
 */
export type AgentChannel = "web" | "whatsapp" | "telefono";
export const AGENT_CHANNELS: AgentChannel[] = ["web", "whatsapp", "telefono"];

/** Intenciones comerciales que maneja el flujo guiado. "otro" pasa al asistente existente (IA o reglas). */
export type AgentIntent = "cotizar" | "costos" | "registro" | "estado" | "humano" | "otro";

export type AgentFlow = "cotizar" | "registro" | "humano";

export type LeadKind = "cotizacion" | "registro" | "derivacion";
export type LeadStatus = "nuevo" | "en_gestion" | "cerrado" | "descartado";
export const LEAD_STATUSES: LeadStatus[] = ["nuevo", "en_gestion", "cerrado", "descartado"];

export type ContactType = "email" | "telefono";

/** Estado de la conversación que se guarda entre turnos (JSON en agent_conversations.state). */
export type AgentState = {
  flow: AgentFlow | null;
  /** Dato que el agente está pidiendo ahora, o "confirmar"/"corregir". */
  step: string | null;
  data: Record<string, string>;
  /** Si se está corrigiendo un dato, al responder se vuelve al resumen. */
  correcting?: boolean;
  /** Último lead creado en esta conversación (para completar una derivación). */
  leadId?: string | null;
};

export const EMPTY_STATE: AgentState = { flow: null, step: null, data: {} };

/** Cómo se generó la respuesta: flujo guiado, IA conectada o reglas (IA sin clave o con falla). */
export type AgentMode = "flujo" | "ia" | "reglas";

export type AgentReply = {
  conversationId: string;
  text: string;
  /** Texto para síntesis de voz: sin enlaces ni emojis. */
  speak: string;
  intent: AgentIntent;
  mode: AgentMode;
  step: string | null;
  handoff: boolean;
  leadCode: string | null;
  quick: string[];
};
