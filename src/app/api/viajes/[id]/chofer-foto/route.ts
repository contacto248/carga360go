import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import { fotoChofer } from "@/lib/qr/assignment";
import { vistaQr } from "@/lib/qr/vista";

export const dynamic = "force-dynamic";

export const GET = guard(async (_request, ctx) => {
  const { id } = await ctx.params;
  await vistaQr(id, await getCurrentUser());
  const file = fotoChofer(id);
  if (!file) throw new AppError("Este chofer no tiene foto.", 404);
  return new NextResponse(new Uint8Array(readFileSync(file.path)), {
    headers: { "content-type": file.mime, "cache-control": "private, no-store" },
  });
});
