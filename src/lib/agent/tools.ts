import { backupContactOf, needsBackupContact } from "../backup-contact";
import { carrierChecklist } from "../carrier";
import { getDb } from "../db";
import { formatDateCL } from "../format";
import { getLoad } from "../listings";
import { accountStateOf, manualReadonlyOf } from "../manual-readonly";
import { matchTrucksForLoad } from "../match";
import { activeListings } from "../stats";
import type { EquipmentId, PublicUser } from "../types";
import { tripView } from "../viaje";
import { BACKUP_CONTACT_ASK, LINKS } from "../whatsapp/intents";

/**
 * Herramientas del agente (módulo 12 de la especificación). Cada una declara autenticación, roles,
 * si exige confirmación, si se audita y su estado real. Solo las "conectada" ejecutan algo:
 * el resto existe como contrato documentado y responde que no está disponible.
 */
export type ToolStatus = "conectada" | "no_conectada" | "pendiente";

export type AgentToolSpec = {
  name: string;
  description: string;
  input: string;
  output: string;
  auth: "publica" | "sesion";
  roles: string;
  confirmation: boolean;
  audited: boolean;
  status: ToolStatus;
  note?: string;
};

export const AGENT_TOOLS: AgentToolSpec[] = [
  { name: "get_public_freight_listings", description: "Cargas publicadas y vigentes, sin datos de contacto.", input: "—", output: "conteo y rutas", auth: "publica", roles: "todos", confirmation: false, audited: false, status: "conectada" },
  { name: "get_public_truck_listings", description: "Camiones publicados y vigentes, sin datos de contacto.", input: "—", output: "conteo y rutas", auth: "publica", roles: "todos", confirmation: false, audited: false, status: "conectada" },
  { name: "search_matching_trucks", description: "Cuenta camiones compatibles con la solicitud usando el motor Carga360 Match existente.", input: "origen, destino, fecha, equipo, peso", output: "cantidad y mejor puntaje calculado", auth: "publica", roles: "todos", confirmation: false, audited: false, status: "conectada" },
  { name: "search_matching_cargo", description: "Cargas compatibles con un camión.", input: "camión", output: "lista", auth: "sesion", roles: "transportista", confirmation: false, audited: false, status: "pendiente", note: "Ya existe en /camiones (panel); falta exponerla en la conversación." },
  { name: "get_reference_freight_estimate", description: "Costo del flete calculado por el motor de costos (ruta, peajes según ejes, diésel y costos operacionales).", input: "origen, destino, equipo, peso, ejes", output: "costo en CLP con desglose", auth: "publica", roles: "todos", confirmation: false, audited: false, status: "no_conectada", note: "Interfaz FreightCostProvider (src/lib/agent/costs.ts) PENDIENTE DE CONECTAR al endpoint de costos de la otra rama. Mientras tanto el agente no da cifras." },
  { name: "create_cargo_draft", description: "Registra la solicitud de cotización como lead (agent_leads) tras confirmar el resumen.", input: "datos del módulo 2", output: "código C360-XXXXXX", auth: "publica", roles: "todos", confirmation: true, audited: true, status: "conectada" },
  { name: "publish_cargo_after_confirmation", description: "Publicar la carga en la plataforma.", input: "borrador + sesión", output: "id de carga", auth: "sesion", roles: "mandante", confirmation: true, audited: true, status: "pendiente", note: "El agente deriva a /cargas/nueva; publicar por voz requiere sesión y confirmación explícita." },
  { name: "create_transporter_registration_draft", description: "Registra un pre-registro (lead de registro) con contacto y contacto de respaldo.", input: "tipo, nombre, contacto, respaldo", output: "código", auth: "publica", roles: "todos", confirmation: false, audited: true, status: "conectada" },
  { name: "get_authenticated_user_profile", description: "Estado de la propia cuenta: verificación, documentos, solo lectura manual, respaldo.", input: "sesión", output: "resumen", auth: "sesion", roles: "mandante, transportista", confirmation: false, audited: false, status: "conectada" },
  { name: "get_authorized_shipment_status", description: "Último evento registrado de las cargas del propio usuario (dueño o transportista adjudicado).", input: "sesión", output: "estado y fecha", auth: "sesion", roles: "partes del viaje", confirmation: false, audited: false, status: "conectada" },
  { name: "get_authorized_gps_position", description: "Posición GPS en vivo.", input: "sesión + carga", output: "posición", auth: "sesion", roles: "partes del viaje", confirmation: false, audited: true, status: "no_conectada", note: "No hay proveedor GPS ni telemetría conectados: solo se informa el último evento registrado." },
  { name: "create_support_ticket", description: "Lead de derivación con la conversación asociada.", input: "conversación", output: "código", auth: "publica", roles: "todos", confirmation: false, audited: true, status: "conectada" },
  { name: "request_human_assistance", description: "Deriva a una persona: auditoría agente.derivacion y aviso por correo al equipo.", input: "conversación", output: "código", auth: "publica", roles: "todos", confirmation: false, audited: true, status: "conectada" },
  { name: "get_document_expiration_alerts", description: "Vencimiento de documentos del transportista.", input: "sesión", output: "lista", auth: "sesion", roles: "transportista", confirmation: false, audited: false, status: "conectada", note: "Incluida en get_authenticated_user_profile (documentos vencidos)." },
  { name: "get_notification_preferences", description: "Preferencias de aviso.", input: "sesión", output: "preferencias", auth: "sesion", roles: "todos", confirmation: false, audited: false, status: "pendiente" },
];

export function publicListingsSummary(): { loads: number; trucks: number } {
  try {
    const { loads, trucks } = activeListings();
    return { loads: loads.length, trucks: trucks.length };
  } catch {
    return { loads: 0, trucks: 0 };
  }
}

/** search_matching_trucks: usa matchTrucksForLoad sobre camiones vigentes. null si faltan datos para calcular. */
export function countMatchingTrucks(input: { origin: string; destination: string; date: string | null; equipment: EquipmentId | null; weightT: number | null }): {
  count: number;
  bestScore: number | null;
} | null {
  if (!input.equipment || !input.weightT || !input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;
  try {
    const { trucks } = activeListings();
    const matches = matchTrucksForLoad(
      { equipment: input.equipment, weightT: input.weightT, origin: input.origin, destination: input.destination, pickupDate: input.date, specs: {} },
      trucks,
    );
    return { count: matches.length, bestScore: matches[0]?.match.score ?? null };
  } catch (error) {
    console.error("[carga360go] agente: match falló", error instanceof Error ? error.message : "error");
    return null;
  }
}

const ACCOUNT_LABEL = {
  verificado: "aprobada",
  manual_readonly: "con verificación manual (solo lectura)",
  pendiente: "en revisión",
  rechazado: "rechazada (revise la observación en su panel)",
} as const;

const LOAD_STATUS_LABEL: Record<string, string> = { abierta: "abierta a ofertas", adjudicada: "adjudicada", cerrada: "cerrada" };

function shipmentLines(user: PublicUser): string[] {
  const db = getDb();
  const ids =
    user.role === "transportista"
      ? (db
          .prepare(
            `SELECT l.id FROM loads l JOIN offers o ON o.id = l.awarded_offer_id WHERE o.carrier_id = ? ORDER BY l.updated_at DESC LIMIT 3`,
          )
          .all(user.id) as { id: string }[])
      : (db.prepare(`SELECT id FROM loads WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 3`).all(user.id) as { id: string }[]);
  const lines: string[] = [];
  for (const { id } of ids) {
    const load = getLoad(id);
    if (!load) continue;
    let line = `• ${load.origin} → ${load.destination} (${formatDateCL(load.pickupDate)}): ${LOAD_STATUS_LABEL[load.status] ?? load.status}`;
    if (load.status === "abierta") line += `, ${load.offerCount} oferta(s)`;
    if (load.status === "adjudicada") {
      const trip = tripView(id, user);
      const last = trip?.events.length ? trip.events[trip.events.length - 1] : null;
      line += last
        ? `. Último evento registrado: ${last.label}, ${formatDateCL(last.createdAt.slice(0, 10))} ${last.createdAt.slice(11, 16)} UTC`
        : `. Estado del viaje: ${trip?.label ?? "asignado"} (sin eventos registrados todavía)`;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * get_authenticated_user_profile + get_authorized_shipment_status: solo datos de la propia cuenta.
 * Nunca muestra datos de terceros (contactos, nombres de otras empresas).
 */
export function ownAccountStatus(user: PublicUser, now = new Date()): string {
  if (user.role === "admin") return `Usted es administrador: el estado de las cuentas y cargas está en ${LINKS.home}/admin.`;
  const parts: string[] = [];
  const state = accountStateOf(user, now);
  let head = `Su cuenta (${user.role === "transportista" ? "transportista" : "empresa"}) está ${ACCOUNT_LABEL[state]}.`;
  if (state === "manual_readonly") {
    const ro = manualReadonlyOf(user.id, now);
    if (ro.until) head += ` Puede ver cargas y camiones hasta el ${formatDateCL(ro.until.slice(0, 10))}, pero no publicar, ofertar ni tomar cargas hasta quedar acreditada.`;
  }
  parts.push(head);
  const missing: string[] = [];
  if (!user.emailVerifiedAt) missing.push("confirmar su correo");
  if (user.role === "transportista") {
    if (!user.phoneVerifiedAt) missing.push("confirmar su celular");
    const checklist = carrierChecklist(user.id);
    const docs = checklist.docs.filter((doc) => doc.status !== "verificado");
    if (docs.length) missing.push(`documentos: ${docs.map((doc) => `${doc.label} (${doc.status})`).join(", ")}`);
  }
  if (missing.length) parts.push(`Le falta: ${missing.join("; ")}.`);
  const shipments = shipmentLines(user);
  parts.push(shipments.length ? `Sus cargas más recientes:\n${shipments.join("\n")}` : "No tiene cargas asociadas todavía.");
  if (shipments.some((line) => line.includes("adjudicada"))) {
    parts.push("No hay GPS en vivo conectado: le informo el último evento registrado en la plataforma.");
  }
  if (needsBackupContact(user.id)) parts.push(BACKUP_CONTACT_ASK);
  else if (backupContactOf(user.id)) parts.push("Ya tiene un contacto de respaldo registrado.");
  parts.push(`Detalle completo en su panel: ${LINKS.home}/panel`);
  return parts.join("\n");
}
