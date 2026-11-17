import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { uploadAccountDocument } from "@/lib/bassam/acreditacion";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

export const POST = guard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AppError("Adjunta el documento.");
  const saved = await uploadAccountDocument(user, {
    tipo: String(form.get("tipo") ?? ""),
    filename: file.name,
    mime: file.type || "application/octet-stream",
    bytes: Buffer.from(await file.arrayBuffer()),
  });
  return NextResponse.json({ id: saved.id, estadoAdmin: saved.estadoAdmin, estadoIa: saved.estadoIa, comentarioIa: saved.comentarioIa }, { status: 201 });
});
