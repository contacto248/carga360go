import { NextResponse } from "next/server";
import { guard, readJson, requireRoles } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { waConfig } from "@/lib/whatsapp/config";
import { getConversation, pauseConversation, resumeConversation, setConversationBotDisabled, setSetting } from "@/lib/whatsapp/store";

export const PATCH = guard(async (request) => {
  await requireRoles(["admin"]);
  const body = await readJson(request);
  if (typeof body.globalEnabled === "boolean") {
    setSetting("bot_enabled", body.globalEnabled ? "on" : "off");
    return NextResponse.json({ ok: true });
  }
  const id = typeof body.conversationId === "string" ? body.conversationId : "";
  if (!id || !getConversation(id)) throw new AppError("Conversación no encontrada.", 404);
  if (typeof body.botDisabled === "boolean") setConversationBotDisabled(id, body.botDisabled);
  if (body.action === "resume") resumeConversation(id);
  if (body.action === "pause") pauseConversation(id, waConfig().pauseHours, "pausa manual");
  return NextResponse.json({ ok: true });
});
