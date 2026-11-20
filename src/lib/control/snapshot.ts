import { getDb } from "../db";
import { agentEnabled, agentWhatsappEnabled } from "../agent/config";
import { aiReady } from "../assistant/config";
import { canSend } from "../whatsapp/config";
import { botGloballyEnabled } from "../whatsapp/store";
import { emailChannelReady } from "../notify";
import { twilio } from "../agent/voice";
import { activeListings } from "../stats";
import type { PublicUser } from "../types";
import { assertControlAdmin, controlRecords, parseCompany, seedControlTasks } from "./store";
import type { Integration, Snapshot } from "./types";

export function controlSnapshot(user: PublicUser, companyValue: unknown): Snapshot {
  assertControlAdmin(user);
  const company = parseCompany(companyValue);
  seedControlTasks(user);
  const tasks = controlRecords(user, company, "task");
  const services = controlRecords(user, company, "service");
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const open = tasks.filter(t => !["terminada", "archivada"].includes(t.status)).length;
  const rows = db.prepare("SELECT action,actor_email,created_at FROM audit_log WHERE target_type=? ORDER BY created_at DESC,rowid DESC LIMIT 12").all(`b360:${company}`) as { action: string; actor_email: string; created_at: string }[];
  const base = { company, tasks, services, generatedAt: new Date().toISOString(), activity: rows.map(r => ({ action: r.action, actor: r.actor_email || "Sistema", at: r.created_at })) };
  if (company === "bassam") return {
    ...base,
    metrics: [
      { label: "Servicios en curso", value: services.filter(s => s.status === "en_curso").length, detail: "Órdenes registradas en BASSAM SPA" },
      { label: "Por confirmar", value: services.filter(s => ["nuevo", "cotizado"].includes(s.status)).length, detail: "Solicitudes y cotizaciones" },
      { label: "Clientes registrados", value: new Set(services.map(s => s.customer.trim().toLocaleLowerCase("es-CL"))).size, detail: "Clientes de las órdenes registradas" },
      { label: "Tareas abiertas", value: open, detail: "Plan de BASSAM SPA" },
    ], corridors: [], integrations: [
      { name: "Sitio BASSAM SPA", state: "Acceso disponible", detail: "Sitio externo; no importa datos al tablero.", href: "https://www.bassamspa.com/" },
      { name: "Horómetros", state: "Acceso disponible", detail: "Portal externo con su propia sesión; datos sin sincronizar.", href: "https://horometros.bassamspa.com/" },
      { name: "GPS desde el teléfono", state: "Probada en test", detail: "La API guarda lat, lng y hora solo de un viaje autorizado. No hay dispositivo emisor: no está operativa y no se simulan posiciones.", href: "/admin?seccion=panel" },
    ],
  };
  const live = activeListings();
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const pairs = [["Calama", "Antofagasta"], ["Calama", "Copiapó"], ["Antofagasta", "Copiapó"]];
  const corridors = pairs.map(([a, b]) => {
    const match = (r: { origin: string; destination: string }) => (norm(r.origin) === norm(a) && norm(r.destination) === norm(b)) || (norm(r.origin) === norm(b) && norm(r.destination) === norm(a));
    return { name: `${a}–${b}`, loads: live.loads.filter(match).length, trucks: live.trucks.filter(match).length };
  });
  const configured = (name: string, ready: boolean, href: string, detail: string): Integration => ({ name, state: ready ? "Configurado" : "Sin configurar", detail: `${detail} Configuración no equivale a entrega o conexión comprobada.`, href });
  return {
    ...base, corridors,
    metrics: [
      { label: "Cargas vigentes", value: live.loads.length, detail: "Publicaciones reales; excluye demostraciones" },
      { label: "Camiones publicados", value: live.trucks.length, detail: "Disponibilidad vigente; no es conexión GPS" },
      { label: "Empresas registradas", value: count("SELECT COUNT(*) n FROM users WHERE role='mandante'"), detail: "Cuentas de mandantes" },
      { label: "Tareas abiertas", value: open, detail: "Pendientes, en curso y bloqueadas" },
    ],
    integrations: [
      { name: "Asistente web", state: agentEnabled() ? "Habilitado" : "Apagado", detail: "Ajuste del asistente comercial.", href: "/admin/agente" },
      configured("Motor IA", aiReady(), "/admin/agente", "Disponibilidad de credenciales."),
      configured("Correo", emailChannelReady(), "/admin/transportistas", "Canal SMTP del servidor."),
      { name: "WhatsApp", state: canSend() && botGloballyEnabled() ? "Configurado y habilitado" : "Pendiente de activación", detail: `Credenciales: ${canSend() ? "configuradas" : "ausentes"}. Flujo del agente: ${agentWhatsappEnabled() ? "habilitado" : "apagado"}. Requiere consentimiento y prueba de recepción.`, href: "/admin/whatsapp" },
      configured("Telefonía", twilio.status().connected, "/admin/agente", "Configuración del adaptador Twilio existente."),
      { name: "GPS desde el teléfono", state: "Probada en test", detail: "La API guarda lat, lng y hora solo de un viaje autorizado. No hay dispositivo emisor: no está operativa y no se simulan posiciones.", href: "/admin?seccion=panel" },
    ],
  };
}
