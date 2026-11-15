import { randomUUID } from "crypto";
import { getDb } from "./db";
import type { PublicUser } from "./types";

export type AuditEntry = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
};

export const AUDIT_LABELS: Record<string, string> = {
  "usuario.registro": "Cuenta nueva",
  "usuario.privacidad_aceptada": "Aceptó la Política de Privacidad",
  "usuario.requisito": "Requisito de acreditación",
  "usuario.aprobado": "Cuenta aprobada",
  "usuario.rechazado": "Cuenta rechazada",
  "usuario.estado": "Cambio de estado de cuenta",
  "usuario.editado": "Datos de cuenta editados",
  "usuario.correo_verificado": "Correo marcado como verificado",
  "usuario.telefono_verificado": "Teléfono marcado como verificado",
  "usuario.borrado": "Cuenta borrada",
  "usuario.bloqueo_login": "Bloqueo por intentos fallidos",
  "usuario.clave_restablecida": "Contraseña restablecida",
  "admin.2fa_codigo_enviado": "Código de ingreso enviado al administrador",
  "admin.2fa_ok": "Administrador ingresó con código",
  "admin.2fa_fallido": "Código de ingreso incorrecto",
  "admin.2fa_limite": "Límite de códigos de ingreso alcanzado",
  "admin.dispositivo_confiable": "Dispositivo de confianza registrado (30 días)",
  "admin.ingreso_dispositivo_confiable": "Administrador ingresó desde dispositivo de confianza",
  "documento.revisado": "Documento revisado",
  "documento.subido": "Documento subido",
  "oferta.creada": "Oferta enviada",
  "oferta.mejorada": "Oferta mejorada",
  "oferta.retirada": "Oferta retirada",
  "oferta.aceptada": "Oferta aceptada (carga adjudicada)",
  "carga.publicada": "Carga publicada",
  "carga.cerrada": "Solicitud cerrada",
  "carga.plazo": "Plazo de ofertas fijado por el administrador",
  "carga.borrada": "Carga borrada",
  "camion.borrado": "Camión borrado",
  "usuario.datos_propios": "Usuario corrigió sus datos",
  "usuario.respaldo": "Contacto de respaldo guardado",
  "usuario.solo_lectura_otorgada": "Verificación manual: solo lectura por 30 días",
  "usuario.solo_lectura_revocada": "Verificación manual revocada",
  "usuario.solo_lectura_vencida": "Solo lectura vencida: cuenta vuelve a pendiente",
  "usuario.solo_lectura_avisada": "Aviso de verificación manual (correo y WhatsApp)",
  "usuario.solo_lectura_aviso_omitido": "Aviso de verificación manual omitido (mismo día)",
  "ajustes.editados": "Ajustes de la plataforma",
  "agente.derivacion": "Agente comercial: derivación a una persona",
  "agente.lead_creado": "Agente comercial: solicitud registrada",
  "agente.lead_estado": "Agente comercial: estado de solicitud cambiado",
  "agente.ajustes": "Agente comercial: ajustes",
  "costos.parametro": "Parámetro de costos modificado",
  "costos.cotizacion_estado": "Revisión de cotización",
  "costos.refresco_manual": "Actualización manual de fuentes de costos",
  "costos.cotizacion_publicacion": "Cotización guardada al publicar carga",
  "bassam.autorizar": "Viaje autorizado",
  "bassam.rechazar": "Viaje rechazado",
  "bassam.solicitar_revision": "Revisión de viaje solicitada",
  "bassam.gps": "Punto GPS del viaje autorizado",
  "bassam.qr": "QR de origen y destino emitido",
};

function writeAudit(
  actor: Pick<PublicUser, "id" | "email"> | null,
  action: string,
  target: { type?: string; id?: string } = {},
  detail?: string | Record<string, unknown> | null,
  ip?: string | null,
) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (id, actor_id, actor_email, action, target_type, target_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      actor?.id ?? null,
      actor?.email ?? null,
      action,
      target.type ?? null,
      target.id ?? null,
      detail == null ? null : (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 1000),
      ip ?? null,
      new Date().toISOString(),
    );
}

/** Registra un evento. Nunca lanza: la auditoría no debe romper la acción principal. */
export function audit(
  actor: Pick<PublicUser, "id" | "email"> | null,
  action: string,
  target: { type?: string; id?: string } = {},
  detail?: string | Record<string, unknown> | null,
  ip?: string | null,
) {
  try {
    writeAudit(actor, action, target, detail, ip);
  } catch (error) {
    console.error("[carga360go] No se pudo registrar la auditoría", error);
  }
}

/** Igual que audit, pero propaga el error (para emparejar con la escritura principal en una transacción). */
export function auditStrict(
  actor: Pick<PublicUser, "id" | "email"> | null,
  action: string,
  target: { type?: string; id?: string } = {},
  detail?: string | Record<string, unknown> | null,
  ip?: string | null,
) {
  writeAudit(actor, action, target, detail, ip);
}

export function listAudit(limit = 300): AuditEntry[] {
  const rows = getDb()
    .prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`)
    .all(Math.min(Math.max(limit, 1), 2000)) as {
    id: string;
    actor_id: string | null;
    actor_email: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    detail: string | null;
    ip: string | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: row.detail,
    ip: row.ip,
    createdAt: row.created_at,
  }));
}

const TARGETS: Record<string, string> = {
  usuario: "Cuenta",
  carga: "Carga",
  camion: "Camión",
  documento: "Documento",
  oferta: "Oferta",
  ajustes: "Ajustes",
  agente: "Conversación del agente",
  agente_lead: "Solicitud del agente",
  costos: "Motor de costos",
  cotizacion: "Cotización",
};

/** Etiqueta en español para cualquier acción, incluso si no está en la lista (ej. "carga.x_y" → "Carga: x y"). */
export function auditLabel(action: string): string {
  if (AUDIT_LABELS[action]) return AUDIT_LABELS[action];
  const [target, verb = ""] = action.split(".");
  const name = TARGETS[target] ?? target.charAt(0).toUpperCase() + target.slice(1);
  return verb ? `${name}: ${verb.replace(/_/g, " ")}` : name;
}

export function auditTargetLabel(type: string | null): string {
  return type ? (TARGETS[type] ?? type) : "";
}
