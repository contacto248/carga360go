import fs from "fs";
import { NextResponse } from "next/server";
import { asStatus, guard, readJson, requireRoles } from "@/lib/api";
import { adminDeleteUser, profileFromBody, setUserVerification, updateProfile } from "@/lib/auth";
import { approveCarrier, REQUIREMENT_STATUS_LABELS, REQUIREMENTS, setRequirement, type RequirementStatus } from "@/lib/accreditation";
import { markContactVerified, rejectCarrier } from "@/lib/carrier";
import { resolveStored } from "@/lib/documents";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request-auth";

export const PATCH = guard(async (request, ctx) => {
  const admin = await requireRoles(["admin"]);
  const { id } = await ctx.params;
  const body = await readJson(request);
  const profile = profileFromBody(body);
  const ip = clientIp(request.headers);
  const target = { type: "usuario", id };
  if (Object.keys(profile).length > 0) {
    updateProfile(id, profile, "admin");
    audit(admin, "usuario.editado", target, { campos: Object.keys(profile) }, ip);
  }
  if (typeof body.emailVerified === "boolean") {
    markContactVerified(id, "email", body.emailVerified);
    audit(admin, "usuario.correo_verificado", target, String(body.emailVerified), ip);
  }
  if (typeof body.phoneVerified === "boolean") {
    markContactVerified(id, "phone", body.phoneVerified);
    audit(admin, "usuario.telefono_verificado", target, String(body.phoneVerified), ip);
  }
  if (typeof body.requirement === "string") {
    const status = String(body.requirementStatus ?? "");
    setRequirement(id, body.requirement, status);
    const label = REQUIREMENTS.find((item) => item.key === body.requirement)?.label ?? body.requirement;
    audit(admin, "usuario.requisito", target, `${label}: ${REQUIREMENT_STATUS_LABELS[status as RequirementStatus] ?? status}`, ip);
  }
  if (body.verificationStatus !== undefined) {
    const status = asStatus(body.verificationStatus);
    const note = body.note == null ? null : String(body.note).slice(0, 500);
    if (status === "verificado") approveCarrier(admin.id, id);
    else if (status === "rechazado") rejectCarrier(admin.id, id, note);
    else setUserVerification(id, status, note);
    audit(admin, status === "verificado" ? "usuario.aprobado" : status === "rechazado" ? "usuario.rechazado" : "usuario.estado", target, note || status, ip);
  }
  return NextResponse.json({ ok: true });
});

/** Borra un registro pendiente o rechazado que quedó mal (no cuentas verificadas ni administradoras). */
export const DELETE = guard(async (request, ctx) => {
  const admin = await requireRoles(["admin"]);
  const { id } = await ctx.params;
  const { storedPaths } = adminDeleteUser(id);
  audit(admin, "usuario.borrado", { type: "usuario", id }, null, clientIp(request.headers));
  for (const stored of storedPaths) {
    try {
      fs.rmSync(resolveStored(stored), { force: true });
    } catch (error) {
      console.error("[carga360go] No se pudo borrar un archivo de la cuenta eliminada", error);
    }
  }
  return NextResponse.json({ ok: true });
});
