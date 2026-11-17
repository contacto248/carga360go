import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiRouterEnabled, readRouterEnv, scrubSecrets } from "@/lib/ai-router/config";
import { orchestrate } from "@/lib/ai-router/orchestrator";
import { sessionActor } from "@/lib/ai-router/session";
import { persistRouterUsage } from "@/lib/ai-router/usage-store";
import { assertSameOrigin, jsonError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(1).max(100_000),
  provider: z.enum(["auto", "openai", "xai", "both"]).default("auto"),
  max_output_tokens: z.number().int().min(1).max(8000).default(1200),
});

function missing(): Response {
  return NextResponse.json({ error: "No encontrado." }, { status: 404, headers: { "cache-control": "no-store" } });
}

function scrubBody(body: Record<string, unknown>, secrets: string[]): Record<string, unknown> {
  return JSON.parse(scrubSecrets(JSON.stringify(body), secrets)) as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (!aiRouterEnabled()) return missing();
  try {
    assertSameOrigin(request);
    const user = userFromHeaders(request.headers);
    if (!user) throw new AppError("Debes iniciar sesión.", 401);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new AppError("Solicitud inválida.", 400);
    }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) throw new AppError("Solicitud inválida.", 400);
    const actor = sessionActor(user);
    const settings = readRouterEnv();
    const traceId = randomUUID();
    const outcome = await orchestrate({
      prompt: parsed.data.prompt,
      provider: parsed.data.provider,
      maxOutputTokens: parsed.data.max_output_tokens,
      settings,
      fetchImpl: globalThis.fetch,
      traceId,
    });
    persistRouterUsage(traceId, actor.userId, actor.tenantId, outcome.usage);
    const body = scrubBody(
      { ...outcome.body, tenant_id: actor.tenantId, user_id: actor.userId },
      [settings.openaiKey, settings.xaiKey],
    );
    return NextResponse.json(body, { status: outcome.status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
