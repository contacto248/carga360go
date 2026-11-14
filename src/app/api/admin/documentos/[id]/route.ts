import { NextResponse } from "next/server";
import { asStatus, guard, readJson, requireRoles } from "@/lib/api";
import { setDocumentVerification } from "@/lib/documents";
import { audit } from "@/lib/audit";
import { docTypeLabel } from "@/lib/catalog";
import { clientIp } from "@/lib/request-auth";

export const PATCH = guard(async (request, ctx) => {
  const admin = await requireRoles(["admin"]);
  const { id } = await ctx.params;
  const body = await readJson(request);
  const note = body.note == null ? null : String(body.note).slice(0, 500);
  const document = setDocumentVerification(id, asStatus(body.verificationStatus), note);
  audit(admin, "documento.revisado", { type: "documento", id }, `${docTypeLabel(document.type)}: ${document.verificationStatus}${note ? ` (${note})` : ""}`, clientIp(request.headers));
  return NextResponse.json({ document });
});
