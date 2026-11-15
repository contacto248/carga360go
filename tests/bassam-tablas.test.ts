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
  panelAcreditacion,
  readRutAndDate,
  recordAgentComment,
  reviewDocument,
  runExpiryAlerts,
  storeAccreditationUpload,
  uploadAccountDocument,
  vistaCuenta,
} from "../src/lib/bassam/acreditacion";
import { SIN_DATOS, responderAgente } from "../src/lib/bassam/agente-respuesta";
import { DOCUMENTOS_POR_CLIENTE } from "../src/lib/bassam/tipos-cliente";
import { MIGRATION_17_SQL, MIGRATION_18_SQL } from "../src/lib/bassam/schema";
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
  const vacio = panelAcreditacion();
  assert.equal(vacio.transportistas.conteo, "0 registrados");
  assert.equal(vacio.mandantes.conteo, "0 registrados");
  assert.equal(vacio.timeline, "sin datos");
  assert.equal(vacio.kyc, "Sin datos");
  assert.equal(responderAgente("hay documentos", false), SIN_DATOS);
  assert.match(SIN_DATOS, /^Sin datos\. 1\. Datos\. 2\. Subir documentos\. 3\. Estado\. https:\/\/www\.carga360go\.cl\/mi-cuenta/);
  const guia = responderAgente("quiero acreditarme", false);
  assert.equal(guia, SIN_DATOS);
  assert.equal(responderAgente("dónde adjuntar", false), SIN_DATOS);
  assert.equal(responderAgente("dónde subir", true), SIN_DATOS);
  assert.equal(responderAgente("Soy transportista", false), SIN_DATOS);
  assert.equal(responderAgente("Soy mandante", false), SIN_DATOS);
  assert.match(guia, /Transportista: licencia, padrón, SOAP, seguro obligatorio, seguro de carga/);
  assert.deepEqual(
    DOCUMENTOS_POR_CLIENTE.transportista.map((item) => item.label),
    ["Licencia", "Padrón", "SOAP", "Seguro obligatorio", "Seguro de carga"],
  );
  assert.match(guia, /Mandante: RUT empresa, e-RUT, escritura, certificado de cuenta/);
  assert.doesNotMatch(guia, /token de WhatsApp|WA_ACCESS_TOKEN/);
  assert.doesNotMatch(JSON.stringify(vacio), /SOC2|facial|saldo|ISO 9001|%/i);
  const cols = getDb().prepare(`PRAGMA table_info(documentos_acreditacion)`).all() as { name: string }[];
  assert.ok(cols.some((col) => col.name === "tipo_cliente"));
  assert.doesNotMatch(MIGRATION_18_SQL, /VALUES\s*\(/i);
  assert.doesNotMatch(MIGRATION_18_SQL, /Juan Pérez|12\.345\.678-9/);
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
    tipoCliente: "transportista",
    tipo: "licencia",
    filename: "cedula.txt",
    mime: "text/plain",
    bytes: Buffer.from("Titular 15.432.109-K. Vencimiento 15-12-2026."),
  }, { today: "2026-11-15" });
  assert.equal(saved.estadoAdmin, "pendiente_ok");
  assert.match(saved.comentarioIa, /^Revisión IA: RUT no coincide\. Por vencer \(2026-12-15\)\.$/);
  const full = path.join(process.env.UPLOAD_DIR!, saved.archivo);
  assert.equal(fs.statSync(full).mode & 0o777, 0o600);
  assert.equal(full.includes(`${path.sep}public${path.sep}`), false);
  const row = getDb().prepare(`SELECT estado_admin, vencimiento FROM documentos_acreditacion WHERE id = ?`).get(saved.id) as { estado_admin: string; vencimiento: string };
  assert.equal(row.estado_admin, "pendiente_ok");
  assert.equal(row.vencimiento, "2026-12-15");
  const antes = row.estado_admin;
  assert.match(responderAgente("aprueba el documento", true), /No apruebo solo\. El admin confirma/);
  assert.equal((getDb().prepare(`SELECT estado_admin AS estado FROM documentos_acreditacion WHERE id = ?`).get(saved.id) as { estado: string }).estado, antes);
  const detalle = responderAgente("que hay", true);
  assert.equal(responderAgente("no sé dónde adjuntar", true), SIN_DATOS);
  assert.match(detalle, /15\.432\.109-K/);
  assert.match(detalle, /15-12-2026/);
  assert.doesNotMatch(responderAgente("que hay", false), /15\.432\.109-K/);
  const panel = panelAcreditacion();
  const fila = panel.transportistas.filas.find((item) => item.id === saved.id);
  assert.equal(fila?.tipo, "licencia");
  assert.equal(fila?.rut, "15.432.109-K");
  assert.equal(fila?.vencimiento, "15-12-2026");
  assert.equal(fila?.estado, "pendiente");
  assert.match(fila?.comentarioIa ?? "", /^Revisión IA:/);
  assert.notEqual(panel.timeline, "sin datos");
  if (panel.timeline !== "sin datos") assert.ok(panel.timeline.some((event) => event.comentario === saved.comentarioIa));
  assert.equal(readRutAndDate("sin numeros").rut, null);
});

test("sin GOOGLE_VISION_KEY una imagen queda ILEGIBLE y no llama a Google", async () => {
  delete process.env.GOOGLE_VISION_KEY;
  const id = carrier("vision");
  let called = false;
  const saved = await storeAccreditationUpload(
    { transportistaId: id, tipoCliente: "transportista", tipo: "padron", filename: "padron.jpg", mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    { fetchImpl: async () => { called = true; return new Response("no"); } },
  );
  assert.equal(called, false);
  assert.equal(saved.estadoIa, "ILEGIBLE");
  assert.equal(saved.estadoAdmin, "pendiente_ok");
  assert.equal(saved.comentarioIa, "Revisión IA: ILEGIBLE.");
  const ilegible = panelAcreditacion().transportistas.filas.find((item) => item.id === saved.id);
  assert.equal(ilegible?.rut, "sin datos");
  assert.equal(ilegible?.vencimiento, "sin datos");
  process.env.GOOGLE_VISION_KEY = "clave-de-prueba";
  let seenKey = false;
  const read = await storeAccreditationUpload(
    { transportistaId: id, tipoCliente: "transportista", tipo: "padron", filename: "padron2.jpg", mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
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
  assert.match(read.comentarioIa, /^Revisión IA: RUT no coincide\. Vigencia sin datos\.$/);
  assert.equal(read.comentarioIa.includes("clave-de-prueba"), false);
  await assert.rejects(() => storeAccreditationUpload({ transportistaId: randomUUID(), tipoCliente: "transportista", tipo: "licencia", filename: "x.txt", mime: "text/plain", bytes: Buffer.from("hola") }), /no encontrado/);
});

test("la subida en mi cuenta compara el RUT y no aprueba", async () => {
  const user = {
    id: randomUUID(),
    email: "cuenta@tablas.test",
    role: "transportista" as const,
    razonSocial: "Transportes del Norte",
    rut: "15.432.109-K",
    contactName: "Ana",
    whatsapp: "+56933334444",
    city: "Antofagasta",
    verificationStatus: "pendiente" as const,
    verificationNote: null,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    verifiedAt: null,
    createdAt: new Date().toISOString(),
    freeUntil: null,
  };
  const saved = await uploadAccountDocument(
    user,
    { tipo: "licencia", filename: "licencia.txt", mime: "text/plain", bytes: Buffer.from("RUT 15.432.109-K hasta 2027-12-01") },
    { today: "2026-11-15" },
  );
  assert.equal(saved.estadoAdmin, "pendiente_ok");
  assert.equal(saved.estadoIa, "vigente");
  assert.equal(saved.comentarioIa, "Revisión IA: RUT coincide. Vigente hasta 2027-12-01.");
  const expired = await uploadAccountDocument(
    user,
    { tipo: "soap", filename: "soap.txt", mime: "text/plain", bytes: Buffer.from("vence 2026-01-02") },
    { today: "2026-11-15" },
  );
  assert.equal(expired.estadoAdmin, "pendiente_ok");
  assert.equal(expired.estadoIa, "vencido");
  assert.equal(expired.comentarioIa, "Revisión IA: RUT sin datos. Vencido (2026-01-02).");
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM transportistas WHERE user_id = ?`).get(user.id) as { n: number }).n, 1);
  const before = (getDb().prepare(`SELECT COUNT(*) AS n FROM documentos_acreditacion`).get() as { n: number }).n;
  await assert.rejects(() => uploadAccountDocument(user, { tipo: "cedula", filename: "vacio.txt", mime: "text/plain", bytes: Buffer.alloc(0) }), /Adjunta/);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM documentos_acreditacion`).get() as { n: number }).n, before);
  assert.doesNotMatch(MIGRATION_17_SQL, /INSERT\s+INTO/i);
  assert.equal(String(process.env.DATABASE_PATH).includes("/var/lib/carga360go"), false);
  const carriers = (getDb().prepare(`SELECT COUNT(*) AS n FROM transportistas`).get() as { n: number }).n;
  const empresa = { ...user, id: randomUUID(), role: "mandante" as const, email: "empresa@tablas.test", razonSocial: "Empresa Norte" };
  await assert.rejects(
    () => uploadAccountDocument(empresa, { tipo: "licencia", filename: "licencia.txt", mime: "text/plain", bytes: Buffer.from("RUT 15.432.109-K") }, { today: "2026-11-15" }),
    /no corresponde/,
  );
  const companyDoc = await uploadAccountDocument(
    empresa,
    { tipo: "rut_empresa", filename: "rut.txt", mime: "text/plain", bytes: Buffer.from("RUT 15.432.109-K hasta 2027-12-01") },
    { today: "2026-11-15" },
  );
  assert.equal(companyDoc.estadoAdmin, "pendiente_ok");
  const cuenta = vistaCuenta(user.id);
  assert.equal(cuenta.estado, "En revisión");
  assert.equal(cuenta.transportistas.length, 2);
  assert.equal(cuenta.mandantes.length, 0);
  assert.notEqual(cuenta.timeline, "sin datos");
  assert.equal(vistaCuenta(randomUUID()).estado, "Sin datos");
  assert.equal(companyDoc.comentarioIa, "Revisión IA Empresa: RUT coincide. Vigente hasta 2027-12-01.");
  const stored = getDb().prepare(`SELECT tipo_cliente, transportista_id FROM documentos_acreditacion WHERE id = ?`).get(companyDoc.id) as { tipo_cliente: string; transportista_id: string | null };
  assert.equal(stored.tipo_cliente, "mandante");
  assert.equal(stored.transportista_id, null);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM transportistas`).get() as { n: number }).n, carriers);
  assert.equal(listPendingDocuments("mandante").some((doc) => doc.id === companyDoc.id), true);
  assert.equal(listPendingDocuments("transportista").some((doc) => doc.id === companyDoc.id), false);
  const page = fs.readFileSync(new URL("../src/app/mi-cuenta/page.tsx", import.meta.url), "utf8");
  assert.match(page, /MiCuentaUpload/);
  assert.match(page, /rolPedido/);
  assert.match(page, /Estado: \{vista\.estado\}/);
  const route = fs.readFileSync(new URL("../src/app/api/mi-cuenta/documento/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /whatsapp|notifyDocumentUploaded|estado_admin = 'aprobado'/);
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
  const admin = fs.readFileSync(new URL("../src/app/admin/bassam/page.tsx", import.meta.url), "utf8");
  assert.match(panel, /Transportistas/);
  assert.match(panel, /Mandantes/);
  assert.match(panel, /Línea de tiempo/);
  assert.match(panel, /Mandantes pagadores/);
  assert.match(panel, /Sin datos/);
  assert.match(panel, /0 registrados/);
  assert.doesNotMatch(panel + admin, /SOC2|facial|saldo|ISO 9001/);
  const agente = fs.readFileSync(new URL("../src/components/AgenteAcreditacion.tsx", import.meta.url), "utf8");
  const copia = fs.readFileSync(new URL("../src/lib/bassam/agente-copia.ts", import.meta.url), "utf8");
  const respuesta = fs.readFileSync(new URL("../src/lib/bassam/agente-respuesta.ts", import.meta.url), "utf8");
  assert.match(agente, /\/api\/bassam\/agente/);
  assert.match(agente, /Agente BASSAM 360/);
  const header = fs.readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
  const footer = fs.readFileSync(new URL("../src/components/Footer.tsx", import.meta.url), "utf8");
  const cuenta = fs.readFileSync(new URL("../src/app/mi-cuenta/page.tsx", import.meta.url), "utf8");
  assert.match(header, /Publicar carga/);
  assert.match(header, /Camiones/);
  assert.match(header, /Mi cuenta/);
  assert.match(header, /Agente BASSAM 360/);
  assert.doesNotMatch(header, /\/admin\/bassam|Publicar camión|Buscar camión|Regiones/);
  assert.doesNotMatch(footer, /HelpLauncher|VoiceAgentLauncher|FleteButton|ChatWidget|VoiceAgent/);
  assert.equal((footer.match(/<AgenteAcreditacion \/>/g) || []).length, 1);
  const panelCuenta = fs.readFileSync(new URL("../src/components/AccreditationPanel.tsx", import.meta.url), "utf8");
  assert.match(panelCuenta, /documentos: \{ href: "\/mi-cuenta"/);
  assert.doesNotMatch(panelCuenta, /cuenta-en-revision#documentos/);
  assert.match(cuenta, /contactName/);
  assert.match(cuenta, /Estado: \{vista\.estado\}/);
  assert.match(cuenta, /Transportista/);
  assert.match(cuenta, /Mandante/);
  assert.match(cuenta, /Línea de tiempo/);
  assert.doesNotMatch(cuenta, /Hola Bastián/);
  assert.equal(fs.existsSync(new URL("../src/app/acreditacion/page.tsx", import.meta.url)), false);
  assert.equal(fs.existsSync(new URL("../src/app/acreditar/page.tsx", import.meta.url)), false);
  assert.equal(fs.existsSync(new URL("../src/app/upload-old/page.tsx", import.meta.url)), false);
  assert.match(fs.readFileSync(new URL("../src/app/admin/bassam/page.tsx", import.meta.url), "utf8"), /user\.role !== "admin"/);
  assert.match(agente, /Subir documentos en \/mi-cuenta/);
  assert.match(agente, /Soy transportista/);
  assert.match(agente, /Soy mandante/);
  assert.match(copia, /https:\/\/www\.carga360go\.cl\/mi-cuenta/);
  assert.equal(fs.existsSync(new URL("../src/app/api/agente/chat/route.ts", import.meta.url)), false);
  assert.doesNotMatch(respuesta, /INSERT\s+INTO|whatsapp\/send/i);
  assert.match(panel, /Aprobar/);
  assert.match(panel, /Rechazar/);
  assert.match(panel, /Pedir renovación/);
});
