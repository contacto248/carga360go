import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { opsGuard } from "@/lib/ops/http";
import { addMember, listMembers, updateMember } from "@/lib/ops/organizations";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const GET = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json({ members: listMembers(actor(request), id) });
});

export const POST = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const member = addMember(actor(request), id, await readJson(request), clientIp(request.headers));
  return NextResponse.json({ member }, { status: 201 });
});

export const PATCH = opsGuard(async (request, ctx) => {
  const { id } = await ctx.params;
  const member = updateMember(actor(request), id, await readJson(request), clientIp(request.headers));
  return NextResponse.json({ member });
});
