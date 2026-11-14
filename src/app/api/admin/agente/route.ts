import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { setAgentEnabled, setAgentWhatsappEnabled } from "@/lib/agent/config";
import { getAgentLead, setLeadStatus } from "@/lib/agent/store";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/agent/types";
import { AppError } from "@/lib/errors";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

/** Administración del agente: encender o apagar el widget y el flujo en WhatsApp, y cambiar el estado de un lead. */
export const PATCH = guard(async (request) => {
  // Misma resolución de sesión (cookie o Bearer) que requireRoles, leída de la solicitud.
  const admin = userFromHeaders(request.headers);
  if (!admin) throw new AppError("Debes iniciar sesión.", 401);
  if (admin.role !== "admin") throw new AppError("No tienes permiso para esta acción.", 403);
  const body = await readJson(request);
  const ip = clientIp(request.headers);
  if (typeof body.enabled === "boolean") {
    setAgentEnabled(body.enabled);
    audit(admin, "agente.ajustes", { type: "ajustes" }, { widget: body.enabled }, ip);
    return NextResponse.json({ ok: true });
  }
  if (typeof body.whatsappEnabled === "boolean") {
    setAgentWhatsappEnabled(body.whatsappEnabled);
    audit(admin, "agente.ajustes", { type: "ajustes" }, { whatsapp: body.whatsappEnabled }, ip);
    return NextResponse.json({ ok: true });
  }
  const id = typeof body.leadId === "string" ? body.leadId : "";
  const status = body.status as LeadStatus;
  if (!LEAD_STATUSES.includes(status)) throw new AppError("Estado no válido.");
  const lead = id ? getAgentLead(id) : null;
  if (!lead) throw new AppError("Solicitud no encontrada.", 404);
  setLeadStatus(lead.id, status, new Date().toISOString());
  audit(admin, "agente.lead_estado", { type: "agente_lead", id: lead.id }, { solicitud: lead.code, de: lead.status, a: status }, ip);
  return NextResponse.json({ ok: true });
});
