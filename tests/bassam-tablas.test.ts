import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { POST } from "../src/app/api/admin/bassam/documentos/route";
import { FLETE_EMPRESA, FLETE_TRANSPORTISTA } from "../src/lib/bassam/flete";
import { COOKIE_NAME, createSession, upsertAdmin } from "../src/lib/auth";
import {
  listPendingDocuments,
  readRutAndDate,
  recordAgentComment,
  reviewDocument,
  runExpiryAlerts,
  storeAccreditationUpload,
} from "../src/lib/bassam/acreditacion";
import { MIGRATION_17_SQL } from "../src/lib/bassam/schema";
import { waLink } from "../src/lib/format";
import { BRAND } from "../src/lib/catalog";
import { getDb } from "../src/lib/db";

delete process.env.GOOGLE_VISION_KEY;

const admin = upsertAdmin({
  email: "tablas-admin@bassam-panel.test",
  password: "Camino-Largo-2026",
  razonSocial: "Admin tablas",
  rut: "76.111.222-8",
  contactName: "Admin",
  whatsapp: "+56 9 32223344",
  city: "La Serena",
});

function carrier(tag: string): string {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO transportistas (id, nombre, rut, telefono, correo, ciudad, mensaje, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, `Transportista ${tag}`, `20.000.${tag.slice(0, 3)}-5`, "+56911112222", `${tag}@tablas.test`, "Calama", "Mensaje de prueba", stamp, stamp);
  return id;
}

test("la migración 17 es SQLite, no inserta personas y deja pendiente_ok", () => {
  assert.doesNotMatch(MIGRATION_17_SQL, /AUTO_INCREMENT|ENGINE\s*=|UNSIGNED|TINYINT/i);
  assert.doesNotMatch(MIGRATION_17_SQL, /Juan Pérez|12\.345\.678-9/);
  assert.doesNotMatch(MIGRATION_17_SQL, /INSERT\s+INTO/i);
  const db = getDb();
  for (const table of ["solicitudes_carga", "transportistas", "documentos_acreditacion", "admin_bassam_360"]) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; dflt_value: string | null }[];
    if (table !== "admin_bassam_360") {
      const estado = cols.find((col) => col.name === "estado_admin");
      assert.equal(estado?.dflt_value, "'pendiente_ok'");
    }
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0);
  }
  assert.equal(listPendingDocuments().length, 0);
});

test("el agente solo llena comentario_ia y estado_ia, y el comentario queda en el historial", () => {
  const id = carrier("agente");
  recordAgentComment({ table: "transportistas", id, comentarioIa: "Falta un documento.", estadoIa: "observado" });
  const row = getDb().prepare(`SELECT estado_admin, estado, comentario_ia, estado_ia FROM transportistas WHERE id = ?`).get(id) as {
    estado_admin: string;
    estado: string;
    comentario_ia: string;
    estado_ia: string;
  };
  assert.equal(row.estado_admin, "pendiente_ok");
  assert.equal(row.estado, "pendiente");
  assert.equal(row.comentario_ia, "Falta un documento.");
  assert.equal(row.estado_ia, "observado");
  const log = getDb().prepare(`SELECT origen, comentario, accion FROM admin_bassam_360 WHERE registro_id = ?`).get(id) as { origen: string; comentario: string; accion: string };
  assert.equal(log.origen, "agente");
  assert.equal(log.comentario, "Falta un documento.");
  assert.equal(log.accion, "comentario");
});

test("solo Aprobar activa al transportista; rechazar y pedir renovación no", async () => {
  const owner = carrier("humano");
  const stamp = new Date().toISOString();
  const make = () => {
    const id = randomUUID();
    getDb().prepare(`INSERT INTO documentos_acreditacion (id, transportista_id, tipo, created_at, updated_at) VALUES (?, ?, 'licencia', ?, ?)`).run(id, owner, stamp, stamp);
    return id;
  };
  const rejected = make();
  const renewed = make();
  const approved = make();
  reviewDocument(admin, rejected, "rechazar");
  reviewDocument(admin, renewed, "pedir_renovacion");
  let carrierRow = getDb().prepare(`SELECT estado FROM transportistas WHERE id = ?`).get(owner) as { estado: string };
  assert.equal(carrierRow.estado, "pendiente");
  assert.equal((getDb().prepare(`SELECT estado_admin FROM documentos_acreditacion WHERE id = ?`).get(rejected) as { estado_admin: string }).estado_admin, "rechazado");
  assert.equal((getDb().prepare(`SELECT estado_admin FROM documentos_acreditacion WHERE id = ?`).get(renewed) as { estado_admin: string }).estado_admin, "renovacion");
  const token = createSession(admin.id, { mfa: true });
  const response = await POST(
    new Request("http://127.0.0.1:4317/api/admin/bassam/documentos", {
      method: "POST",
      headers: { host: "127.0.0.1:4317", "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: `${COOKIE_NAME}=${token}` },
      body: JSON.stringify({ id: approved, action: "aprobar" }),
    }),
    { params: Promise.resolve({}) },
  );
  assert.equal(response.status, 200);
  carrierRow = getDb().prepare(`SELECT estado FROM transportistas WHERE id = ?`).get(owner) as { estado: string };
  assert.equal(carrierRow.estado, "activo");
  assert.equal((getDb().prepare(`SELECT estado_admin FROM documentos_acreditacion WHERE id = ?`).get(approved) as { estado_admin: string }).estado_admin, "aprobado");
  const actions = getDb().prepare(`SELECT accion, origen FROM admin_bassam_360 WHERE tabla = 'documentos_acreditacion' AND registro_id IN (?, ?, ?)`).all(rejected, renewed, approved) as { accion: string; origen: string }[];
  assert.deepEqual(actions.map((item) => item.accion).sort(), ["aprobar", "pedir_renovacion", "rechazar"]);
  assert.ok(actions.every((item) => item.origen === "humano"));
});

test("las alertas de 30, 15 y 7 días solo comentan y no crean transportistas ni aprueban", () => {
  const before = (getDb().prepare(`SELECT COUNT(*) AS n FROM transportistas`).get() as { n: number }).n;
  const id = carrier("alerta");
  const stamp = new Date().toISOString();
  const doc = (day: string) => {
    const docId = randomUUID();
    getDb().prepare(`INSERT INTO documentos_acreditacion (id, transportista_id, tipo, vencimiento, created_at, updated_at) VALUES (?, ?, 'soap', ?, ?, ?)`).run(docId, id, day, stamp, stamp);
    return docId;
  };
  const d30 = doc("2026-12-15");
  const d15 = doc("2026-11-30");
  const d7 = doc("2026-11-22");
  const later = doc("2026-12-16");
  const first = runExpiryAlerts("2026-11-15");
  assert.equal(first.written, 3);
  assert.equal(runExpiryAlerts("2026-11-15").written, 0);
  for (const [docId, accion] of [[d30, "alerta_30"], [d15, "alerta_15"], [d7, "alerta_7"]] as const) {
    const row = getDb().prepare(`SELECT estado_admin, comentario_ia, estado_ia FROM documentos_acreditacion WHERE id = ?`).get(docId) as { estado_admin: string; comentario_ia: string; estado_ia: string };
    assert.equal(row.estado_admin, "pendiente_ok");
    assert.equal(row.estado_ia, accion);
    assert.match(row.comentario_ia, /Vence en (30|15|7) días/);
    const log = getDb().prepare(`SELECT origen, accion FROM admin_bassam_360 WHERE registro_id = ? AND accion = ?`).get(docId, accion) as { origen: string; accion: string };
    assert.equal(log.origen, "alerta");
  }
  assert.equal((getDb().prepare(`SELECT comentario_ia FROM documentos_acreditacion WHERE id = ?`).get(later) as { comentario_ia: string | null }).comentario_ia, null);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM transportistas`).get() as { n: number }).n, before + 1);
  const source = fs.readFileSync(new URL("../src/lib/bassam/acreditacion.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /whatsapp\/send|sendEmail|nodemailer/);
});

test("la subida guarda el archivo privado, lee RUT y fecha, y no aprueba", async () => {
  const id = carrier("archivo");
  const saved = await storeAccreditationUpload({
    transportistaId: id,
    tipo: "cedula",
    filename: "cedula.txt",
    mime: "text/plain",
    bytes: Buffer.from("Titular 15.432.109-K. Vencimiento 15-12-2026."),
  });
  assert.equal(saved.estadoAdmin, "pendiente_ok");
  assert.match(saved.comentarioIa, /15\.432\.109-K/);
  assert.match(saved.comentarioIa, /2026-12-15/);
  const full = path.join(process.env.UPLOAD_DIR!, saved.archivo);
  assert.equal(fs.statSync(full).mode & 0o777, 0o600);
  assert.equal(full.includes(`${path.sep}public${path.sep}`), false);
  const row = getDb().prepare(`SELECT estado_admin, vencimiento FROM documentos_acreditacion WHERE id = ?`).get(saved.id) as { estado_admin: string; vencimiento: string };
  assert.equal(row.estado_admin, "pendiente_ok");
  assert.equal(row.vencimiento, "2026-12-15");
  assert.equal(readRutAndDate("sin numeros").rut, null);
});

test("sin GOOGLE_VISION_KEY una imagen queda ILEGIBLE y no llama a Google", async () => {
  delete process.env.GOOGLE_VISION_KEY;
  const id = carrier("vision");
  let called = false;
  const saved = await storeAccreditationUpload(
    { transportistaId: id, tipo: "padron", filename: "padron.jpg", mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    { fetchImpl: async () => { called = true; return new Response("no"); } },
  );
  assert.equal(called, false);
  assert.equal(saved.estadoIa, "ILEGIBLE");
  assert.equal(saved.estadoAdmin, "pendiente_ok");
  assert.equal(saved.comentarioIa, "ILEGIBLE");
  process.env.GOOGLE_VISION_KEY = "clave-de-prueba";
  let seenKey = false;
  const read = await storeAccreditationUpload(
    { transportistaId: id, tipo: "padron", filename: "padron2.jpg", mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    {
      fetchImpl: async (url, init) => {
        seenKey = String(url).includes("clave-de-prueba") || JSON.stringify(init).includes("clave-de-prueba");
        return new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: "RUT 9.876.543-2" } }] }));
      },
    },
  );
  delete process.env.GOOGLE_VISION_KEY;
  assert.equal(seenKey, true);
  assert.equal(read.estadoAdmin, "pendiente_ok");
  assert.match(read.comentarioIa, /9\.876\.543-2/);
  assert.equal(read.comentarioIa.includes("clave-de-prueba"), false);
  await assert.rejects(() => storeAccreditationUpload({ transportistaId: randomUUID(), tipo: "cedula", filename: "x.txt", mime: "text/plain", bytes: Buffer.from("hola") }), /no encontrado/);
});

test("el botón ¿Necesitas Flete? enlaza a WhatsApp y no usa la API de Meta", () => {
  const source = fs.readFileSync(new URL("../src/components/FleteButton.tsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/components/flete-button.module.css", import.meta.url), "utf8");
  assert.match(source, /¿Necesitas Flete\?/);
  assert.match(source, /Cerrar/);
  assert.doesNotMatch(source, /WA_ACCESS_TOKEN|GOOGLE_VISION_KEY|fetch\(/);
  assert.match(css, /#ff6d00/i);
  assert.match(css, /#0a1931/i);
  assert.equal(waLink(BRAND.whatsapp, FLETE_EMPRESA), `https://wa.me/56958428693?text=${encodeURIComponent(FLETE_EMPRESA)}`);
  assert.equal(decodeURIComponent(waLink(BRAND.whatsapp, FLETE_TRANSPORTISTA).split("text=")[1]), FLETE_TRANSPORTISTA);
  const panel = fs.readFileSync(new URL("../src/components/DocumentReview.tsx", import.meta.url), "utf8");
  assert.match(panel, /Aprobar/);
  assert.match(panel, /Rechazar/);
  assert.match(panel, /Pedir renovación/);
  assert.match(panel, /sin datos/);
});
