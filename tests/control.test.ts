import assert from "node:assert/strict";
import { test } from "node:test";
import { upsertAdmin, createSession, registerUser, COOKIE_NAME } from "../src/lib/auth";
import { getDb, closeDb } from "../src/lib/db";
import { controlSnapshot } from "../src/lib/control/snapshot";
import { controlRecords, saveControlRecord } from "../src/lib/control/store";
import { GET, POST, PATCH } from "../src/app/api/admin/control/route";
import { AppError } from "../src/lib/errors";

const admin = upsertAdmin({ email: "control@example.test", password: "Camino-Largo-QA-2026", razonSocial: "QA Control", rut: "78.553.352-6", contactName: "QA", whatsapp: "+56900000000", city: "La Serena" });
const user = registerUser({ role: "mandante", email: "control-user@example.test", password: "Camino-Largo-QA-2026", razonSocial: "QA Usuario", rut: "12.345.678-5", contactName: "QA", whatsapp: "+56900000001", city: "Calama" }).user;
const token = createSession(admin.id, { mfa: true });
const ctx = { params: Promise.resolve({}) };
const task = { title: "Prueba registro persistente", owner: "QA", due: "2026-11-20", status: "pendiente", priority: "alta", evidence: "" };
const service = { title: "Arriendo de maquinaria", owner: "Operaciones", due: "2026-11-21", status: "nuevo", customer: "Cliente de prueba", equipment: "Excavadora", origin: "Calama", destination: "Antofagasta", notes: "Registro de QA" };
const status = (n: number) => (e: unknown) => e instanceof AppError && e.status === n;
function req(method: string, body?: unknown, session = token, origin = "http://127.0.0.1:4317") {
  return new Request("http://127.0.0.1:4317/api/admin/control?company=carga360go", { method, headers: { host: "127.0.0.1:4317", origin, ...(session ? { cookie: `${COOKIE_NAME}=${session}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
}

test("datos del centro solo para administrador con sesión MFA", async () => {
  assert.equal((await GET(req("GET", undefined, ""), ctx)).status, 401);
  assert.equal((await GET(req("GET", undefined, createSession(user.id)), ctx)).status, 403);
  assert.equal((await GET(req("GET", undefined, createSession(admin.id)), ctx)).status, 401);
  const result = await GET(req("GET"), ctx);
  assert.equal(result.status, 200);
  assert.match(result.headers.get("cache-control") || "", /no-store/);
  const data = await result.json();
  assert.equal(data.company, "carga360go");
  assert.equal(data.tasks.length, 8);
  assert.ok(data.tasks.every((t: {owner: string;due: string;status: string}) => t.owner && t.due && t.status === "pendiente"));
  assert.doesNotMatch(JSON.stringify(data), /password_hash|SMTP_PASS|TWILIO_AUTH_TOKEN|token_hash/);
});
test("siembra inicial idempotente y ningún cierre inventado", () => {
  controlSnapshot(admin, "carga360go");
  controlSnapshot(admin, "carga360go");
  assert.equal(controlRecords(admin, "carga360go", "task").length, 8);
  assert.equal(controlRecords(admin, "bassam", "task").length, 0);
});
test("separación por empresa en lectura, escritura y auditoría", () => {
  const row = saveControlRecord(admin, "bassam", "task", task);
  assert.equal(controlRecords(admin, "bassam", "task").length, 1);
  assert.equal(controlRecords(admin, "carga360go", "task").some(t => t.id === row.id), false);
  assert.throws(() => saveControlRecord(admin, "carga360go", "task", { ...task, revision: 1 }, row.id), status(404));
  const cargo = controlSnapshot(admin, "carga360go");
  assert.equal(cargo.activity.some(a => a.action === "control.task.creado"), false);
  assert.ok(controlSnapshot(admin, "bassam").activity.some(a => a.action === "control.task.creado"));
});
test("persistencia tras cerrar y reabrir SQLite", () => {
  const row = saveControlRecord(admin, "bassam", "service", service);
  closeDb();
  assert.equal(controlRecords(admin, "bassam", "service").find(s => s.id === row.id)?.customer, service.customer);
  assert.equal(controlSnapshot(admin, "bassam").metrics[2].value, 1);
});
test("control de concurrencia evita perder cambios de otro administrador", () => {
  const row = controlRecords(admin, "bassam", "task")[0];
  saveControlRecord(admin, "bassam", "task", { ...row, title: "Título actualizado" }, row.id);
  assert.throws(() => saveControlRecord(admin, "bassam", "task", { ...row, title: "Sobrescritura atrasada" }, row.id), status(409));
  assert.equal(controlRecords(admin, "bassam", "task")[0].title, "Título actualizado");
});
test("validación de fecha, prioridad y empresa; no admite cerrar sin evidencia", () => {
  for (const changes of [{ due: "2026-02-31" }, { priority: "urgente" }, { title: "" }, { status: "terminada" }]) assert.throws(() => saveControlRecord(admin, "bassam", "task", { ...task, ...changes }), status(400));
  assert.throws(() => saveControlRecord(admin, "otra", "task", task), status(400));
  assert.throws(() => saveControlRecord(user, "bassam", "task", task), status(403));
  const row = saveControlRecord(admin, "bassam", "task", { ...task, status: "terminada", evidence: "Prueba ejecutada y evidencia adjunta" });
  assert.equal(row.status, "terminada");
});
test("API: creación, modificación y bloqueo CSRF", async () => {
  const body = { ...task, company: "carga360go", kind: "task" };
  assert.equal((await POST(req("POST", body, token, "https://otro.example"), ctx)).status, 403);
  assert.equal((await POST(req("POST", body, ""), ctx)).status, 401);
  assert.equal((await POST(req("POST", { ...body, company: "otra" }), ctx)).status, 400);
  const created = await POST(req("POST", body), ctx);
  assert.equal(created.status, 201);
  const row = await created.json();
  assert.equal((await PATCH(req("PATCH", { ...row, kind: "task", status: "en_curso" }), ctx)).status, 200);
  assert.equal((await PATCH(req("PATCH", { ...row, kind: "task", status: "bloqueada" }), ctx)).status, 409);
  assert.equal((await PATCH(req("PATCH", { ...row, kind: "task", company: "bassam" }), ctx)).status, 404);
});
test("exportación privada no mezcla empresas ni credenciales", async () => {
  const result = await GET(new Request("http://127.0.0.1:4317/api/admin/control?company=bassam&export=1", { headers: { cookie: `${COOKIE_NAME}=${token}` } }), ctx);
  assert.match(result.headers.get("content-disposition") || "", /bassam360-bassam.json/);
  const data = await result.json();
  assert.ok(data.tasks.every((t: {company: string}) => t.company === "bassam"));
  assert.equal(data.corridors.length, 0);
  assert.equal(data.integrations.some((i: {name: string}) => i.name === "Correo"), false);
});
test("auditoría y cambio se guardan en una sola transacción", () => {
  const db = getDb();
  const before = controlRecords(admin, "bassam", "task").length;
  db.exec("CREATE TRIGGER fail_control_audit BEFORE INSERT ON audit_log WHEN NEW.action='control.task.creado' BEGIN SELECT RAISE(ABORT,'QA audit failure'); END;");
  try { assert.throws(() => saveControlRecord(admin, "bassam", "task", task), /QA audit failure/); }
  finally { db.exec("DROP TRIGGER fail_control_audit"); }
  assert.equal(controlRecords(admin, "bassam", "task").length, before);
});
