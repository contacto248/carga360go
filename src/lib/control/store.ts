import { randomUUID } from "crypto";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import { todayChile } from "../format";
import type { PublicUser } from "../types";
import { COMPANIES, SERVICE_STATES, TASK_STATES, type Company, type Service, type Task } from "./types";

// Módulo independiente: nombres propios, aditivo e idempotente, sin renumerar migraciones de otras ramas.
export const CONTROL_SCHEMA = `
CREATE TABLE IF NOT EXISTS b360_records (
 id TEXT PRIMARY KEY, company TEXT NOT NULL CHECK(company IN ('bassam','carga360go')),
 kind TEXT NOT NULL CHECK(kind IN ('task','service')), payload TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS b360_records_scope ON b360_records(company,kind,updated_at);
CREATE TABLE IF NOT EXISTS b360_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function assertControlAdmin(user: PublicUser | null | undefined): asserts user is PublicUser {
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  if (user.role !== "admin") throw new AppError("Acceso exclusivo de administración.", 403);
}
export function parseCompany(value: unknown): Company {
  if (!COMPANIES.includes(value as Company)) throw new AppError("Empresa no válida.", 400);
  return value as Company;
}

function text(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new AppError(`${name}: valor no válido (máximo ${max} caracteres).`);
  const clean = value.trim();
  if (required && !clean) throw new AppError(`${name} es obligatorio.`);
  return clean;
}
function date(value: unknown): string {
  const clean = text(value, "Fecha", 10);
  if (clean && (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || !Number.isFinite(Date.parse(clean)) || new Date(clean).toISOString().slice(0, 10) !== clean)) throw new AppError("Fecha no válida.");
  return clean;
}
function validate(kind: string, input: Record<string, unknown>) {
  const common = { title: text(input.title, "Título", 160, true), owner: text(input.owner, "Responsable", 100), due: date(input.due) };
  if (kind === "task") {
    if (!TASK_STATES.includes(input.status as Task["status"]) || !["alta", "media", "baja"].includes(String(input.priority))) throw new AppError("Estado o prioridad no válido.");
    const evidence = text(input.evidence, "Evidencia", 3000);
    if (input.status === "terminada" && (!evidence || !common.owner)) throw new AppError("Para terminar una tarea registra responsable y evidencia de cierre.");
    return { ...common, status: input.status, priority: input.priority, evidence };
  }
  if (kind !== "service" || !SERVICE_STATES.includes(input.status as Service["status"])) throw new AppError("Tipo o estado no válido.");
  return { ...common, status: input.status, customer: text(input.customer, "Cliente", 160, true), equipment: text(input.equipment, "Equipo", 100), origin: text(input.origin, "Origen", 160), destination: text(input.destination, "Destino", 160), notes: text(input.notes, "Notas", 3000) };
}

export function initControl() { getDb().exec(CONTROL_SCHEMA); }

export function seedControlTasks(user: PublicUser) {
  assertControlAdmin(user);
  initControl();
  const db = getDb();
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM b360_meta WHERE key='initial_tasks_v1'").get()) return;
    const tasks = [
      ["Comprobar acceso al servidor y tickets #327243 / #522011", "Infraestructura", "alta", 1],
      ["Revisar alcance de permisos de mantenimiento", "Infraestructura", "alta", 1],
      ["Probar registro, verificación y aprobación de transportista", "Calidad", "alta", 2],
      ["Probar carga, oferta, adjudicación y privacidad de contactos", "Calidad", "alta", 2],
      ["Probar recepción y pausa de alertas de correo", "Calidad", "alta", 2],
      ["Definir precios y condiciones después del período gratuito", "Gerencia", "media", 3],
      ["Definir activación de WhatsApp con consentimiento", "Gerencia", "media", 3],
      ["Medir demanda en los tres corredores piloto", "Comercial", "media", 7],
    ] as const;
    const today = todayChile();
    for (const [index, [title, owner, priority, days]] of tasks.entries()) {
      const due = new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
      const now = new Date().toISOString();
      db.prepare("INSERT INTO b360_records(id,company,kind,payload,created_at,updated_at) VALUES(?,'carga360go','task',?,?,?)").run(`initial-${index + 1}`, JSON.stringify({ title, owner, priority, due, status: "pendiente", evidence: "Plan inicial: responsable por función y fecha propuestos. Confirmar asignación y adjuntar pruebas antes de cerrar." }), now, now);
    }
    db.prepare("INSERT INTO b360_meta(key,value) VALUES('initial_tasks_v1',?)").run(new Date().toISOString());
    auditStrict(user, "control.plan_inicial", { type: "b360:carga360go" }, { tasks: 8, proposed: true });
  })();
}

export function controlRecords(user: PublicUser, companyValue: unknown, kind: "task"): Task[];
export function controlRecords(user: PublicUser, companyValue: unknown, kind: "service"): Service[];
export function controlRecords(user: PublicUser, companyValue: unknown, kind: "task" | "service"): (Task | Service)[] {
  assertControlAdmin(user);
  const company = parseCompany(companyValue);
  initControl();
  const rows = getDb().prepare("SELECT * FROM b360_records WHERE company=? AND kind=? ORDER BY updated_at DESC, id").all(company, kind) as { id: string; company: Company; payload: string; revision: number; updated_at: string }[];
  return rows.map(row => ({ ...JSON.parse(row.payload), id: row.id, company: row.company, revision: row.revision, updatedAt: row.updated_at }));
}

export function saveControlRecord(user: PublicUser, companyValue: unknown, kind: string, input: Record<string, unknown>, id?: string) {
  assertControlAdmin(user);
  const company = parseCompany(companyValue);
  const payload = validate(kind, input);
  initControl();
  const db = getDb();
  return db.transaction(() => {
    const now = new Date().toISOString();
    const recordId = id || randomUUID();
    let revision = 1;
    if (id) {
      const old = db.prepare("SELECT revision FROM b360_records WHERE id=? AND company=? AND kind=?").get(id, company, kind) as { revision: number } | undefined;
      if (!old) throw new AppError("Registro no encontrado en esta empresa.", 404);
      if (!Number.isInteger(input.revision) || old.revision !== input.revision) throw new AppError("Otra persona modificó el registro. Actualiza antes de guardar.", 409);
      revision = old.revision + 1;
      db.prepare("UPDATE b360_records SET payload=?,revision=?,updated_at=? WHERE id=? AND company=? AND kind=?").run(JSON.stringify(payload), revision, now, id, company, kind);
    } else {
      db.prepare("INSERT INTO b360_records(id,company,kind,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(recordId, company, kind, JSON.stringify(payload), now, now);
    }
    auditStrict(user, `control.${kind}.${id ? "actualizado" : "creado"}`, { type: `b360:${company}`, id: recordId }, { title: payload.title, status: payload.status, revision });
    return { ...payload, id: recordId, company, revision, updatedAt: now };
  })();
}
