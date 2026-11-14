import { NextResponse } from "next/server";
import { guard, requireUser } from "@/lib/api";
import { reopenAfterUpload } from "@/lib/carrier";
import { addDocument, type StoredFile } from "@/lib/documents";
import { audit } from "@/lib/audit";
import { notifyDocumentUploaded } from "@/lib/admin-notify";
import { docTypeLabel } from "@/lib/catalog";
import { rateLimit } from "@/lib/rate-limit";

export const POST = guard(async (request) => {
  const user = await requireUser();
  rateLimit(`upload:${user.id}`, 40, 60 * 60 * 1000);
  const form = await request.formData();
  const fileValue = form.get("file");
  let file: StoredFile | null = null;
  if (fileValue instanceof File && fileValue.size > 0) {
    file = {
      buffer: Buffer.from(await fileValue.arrayBuffer()),
      originalName: fileValue.name,
      mime: fileValue.type,
    };
  }
  const truckId = String(form.get("truckId") ?? "");
  const doc = addDocument(user, {
    type: String(form.get("type") ?? ""),
    expiry: String(form.get("expiry") ?? ""),
    truckId: truckId || null,
    holderName: String(form.get("holderName") ?? ""),
    detail: String(form.get("detail") ?? ""),
    file,
  });
  reopenAfterUpload(user);
  audit(user, "documento.subido", { type: "documento", id: doc.id }, docTypeLabel(doc.type));
  notifyDocumentUploaded(user, docTypeLabel(doc.type));
  return NextResponse.json({ document: doc }, { status: 201 });
});
