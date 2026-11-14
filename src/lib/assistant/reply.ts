import { BRAND } from "../catalog";
import { HANDOFF_INTENTS, HANDOFF_REPLY, detectIntent, menuChoice, ruleReply } from "../whatsapp/intents";
import { aiReply, type AiDeps, type ChatTurn } from "./ai";
import { liveContext } from "./live";
import type { ChatChannel } from "./prompt";

export type Decision = {
  text: string;
  engine: string;
  handoff: boolean;
  /** omitido: no hubo llamada. fallido: sí se llamó y el proveedor no dejó una respuesta usable. Una respuesta por reglas no garantiza coste cero. */
  aiAttempt: "omitido" | "fallido" | "ok";
  fallbackReason: string | null;
};

/** Si la IA o el motor fallan, se ofrece el correo de contacto y no se deja al visitante sin respuesta. */
export const AI_FALLBACK_REPLY =
  "Ahora no pude completar la respuesta automática. Puede escribirnos a " +
  BRAND.email +
  " y le atendemos a la brevedad.";

/** Decide la respuesta: derivaciones duras primero, luego IA y, si falla, reglas. */
export async function decideTextReply(text: string, history: ChatTurn[], channel: ChatChannel = "whatsapp", deps?: AiDeps): Promise<Decision> {
  try {
    const intent = (channel === "whatsapp" ? menuChoice(text) : null) ?? detectIntent(text);
    if (HANDOFF_INTENTS.includes(intent)) {
      return { text: ruleReply(intent, liveContext(), channel), engine: `reglas:${intent}`, handoff: true, aiAttempt: "omitido", fallbackReason: "derivacion" };
    }
    let live;
    try {
      live = liveContext();
    } catch (error) {
      console.error("[carga360go] decideTextReply", error);
      return { text: AI_FALLBACK_REPLY, engine: "fallback", handoff: false, aiAttempt: "omitido", fallbackReason: "excepcion" };
    }
    const outcome = await aiReply(history, text, live, channel, deps);
    if (outcome.attempt === "ok" && outcome.result) {
      return {
        text: outcome.result.text || ruleReply("humano", live, channel),
        engine: outcome.result.engine,
        handoff: outcome.result.handoff,
        aiAttempt: "ok",
        fallbackReason: null,
      };
    }
    return {
      text: ruleReply(intent, live, channel),
      engine: outcome.attempt === "fallido" ? `reglas:${intent}:fallo` : `reglas:${intent}`,
      handoff: false,
      aiAttempt: outcome.attempt,
      fallbackReason: outcome.reason,
    };
  } catch (error) {
    console.error("[carga360go] decideTextReply", error);
    return { text: AI_FALLBACK_REPLY, engine: "fallback:fallo", handoff: false, aiAttempt: "fallido", fallbackReason: "excepcion" };
  }
}

export { HANDOFF_REPLY };
