import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { payRoute } from "@/lib/pagos/http";
import { submitPod, type PodFile } from "@/lib/pagos/service";
import { rateLimit } from "@/lib/rate-limit";

/** Multipart: foto_documento (1+), firma (opcional si firma_en_foto=1), otro (opcional). */
export const POST = payRoute(["transportista"], async (request, user, ctx) => {
  rateLimit(`pagos-pod:${user.id}`, 20, 60 * 60 * 1000);
  const { id } = await ctx.params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AppError("Envía los archivos como formulario (multipart).", 400, "multipart");
  }
  const files: PodFile[] = [];
  for (const kind of ["foto_documento", "firma", "otro"] as const) {
    for (const entry of form.getAll(kind)) {
      if (typeof entry === "string") continue;
      files.push({ kind, name: entry.name, type: entry.type, bytes: Buffer.from(await entry.arrayBuffer()) });
    }
  }
  const result = submitPod(user, id, files, { signatureInPhoto: form.get("firma_en_foto") === "1" });
  return NextResponse.json({ ok: true, ...result });
});
