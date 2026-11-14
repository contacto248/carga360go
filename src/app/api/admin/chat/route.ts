import { NextResponse } from "next/server";
import { guard, readJson, requireRoles } from "@/lib/api";
import { setWebChatEnabled } from "@/lib/chat/config";
import { getWebConversation, setWebConversationDisabled } from "@/lib/chat/store";
import { AppError } from "@/lib/errors";

export const PATCH = guard(async (request) => {
  await requireRoles(["admin"]);
  const body = await readJson(request);
  if (typeof body.globalEnabled === "boolean") {
    setWebChatEnabled(body.globalEnabled);
    return NextResponse.json({ ok: true });
  }
  const id = typeof body.conversationId === "string" ? body.conversationId : "";
  if (!id || !getWebConversation(id)) throw new AppError("Conversación no encontrada.", 404);
  if (typeof body.botDisabled === "boolean") setWebConversationDisabled(id, body.botDisabled);
  return NextResponse.json({ ok: true });
});
