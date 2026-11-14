import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
import { registerUser } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { rutDv } from "../src/lib/format";
import { mailOutboxDir } from "../src/lib/mail";
import { SimplePdf, textWidth, wrapText } from "../src/lib/pdf/simple-pdf";
import { buildRegistrationPdf, registrationDataOf, registrationPdfFor, sendRegistrationCopy } from "../src/lib/registration-pdf";
import { confirmEmailToken, startEmailVerification } from "../src/lib/verification";

let seq = 63_000_000;
function newUser(tag: string) {
  seq += 1;
  return registerUser({
    role: "transportista",
    razonSocial: `Transportes Ñuñoa ${tag}`,
    rut: `${seq}-${rutDv(String(seq))}`,
    contactName: `José Peña ${tag}`,
    email: `${tag}@pdf.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 5555 1234",
    city: "La Serena",
    privacyVersion: "1.2-2026-11-10",
    termsVersion: "1.0-2026-11-10",
  }).user;
}

/** Revisa que la tabla xref apunte exactamente a cada objeto (PDF bien formado). */
function assertValidPdf(buffer: Buffer) {
  const text = buffer.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  const header = /xref\n0 (\d+)\n/.exec(text.slice(startxref));
  const count = Number(header?.[1]);
  const entries = text.slice(startxref).split("\n").slice(3, 2 + count);
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`, `objeto ${index + 1}`);
  });
  for (const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = (match.index ?? 0) + match[0].length;
    assert.equal(text.slice(start + Number(match[1]), start + Number(match[1]) + 10), "\nendstream");
  }
}

test("el generador de PDF arma un archivo válido con tildes, ñ y varias páginas", () => {
  const pdf = new SimplePdf();
  pdf.text(50, 800, "Inscripción de Ñandú (prueba) — ok \\ fin");
  pdf.addPage();
  pdf.text(50, 800, "Segunda página");
  const buffer = pdf.toBuffer({ title: "Prueba" });
  assertValidPdf(buffer);
  const text = buffer.toString("latin1");
  assert.match(text, /\(Inscripci\\363n de \\321and\\372 \\\(prueba\\\) \\226 ok \\\\ fin\) Tj/);
  assert.match(text, /\/Count 2/);
  assert.ok(textWidth("MMMM", 10) > textWidth("iiii", 10));
  assert.deepEqual(wrapText("uno dos tres cuatro", 10, 40), ["uno dos", "tres", "cuatro"]);
});

test("el comprobante de inscripción trae los datos de la cuenta y nada secreto", () => {
  const user = newUser("comprobante");
  const data = registrationDataOf(user.id, new Date("2026-11-11T15:00:00Z"));
  assert.match(data.folio, /^C360-\d{8}-[0-9A-F]{8}$/);
  assert.equal(data.role, "Transportista");
  assert.equal(data.email, "comprobante@pdf.test");
  assert.match(data.privacy, /1\.2-2026-11-10/);
  assert.equal(data.emailStatus, "Pendiente");
  assert.equal(data.identityStatus, "No aplica", "sin flag no se menciona la verificación de identidad");
  const buffer = buildRegistrationPdf(data);
  assertValidPdf(buffer);
  const text = buffer.toString("latin1");
  assert.match(text, /Comprobante de inscripci\\363n/);
  assert.match(text, /comprobante@pdf\.test/);
  assert.match(text, /CARGA360GO SpA/);
  assert.match(text, /78\.553\.352-6/);
  assert.doesNotMatch(text, /BASSAM/i);
  assert.doesNotMatch(text, /password|scrypt|Camino-Largo/i);
  assert.match(registrationPdfFor(user.id).filename, /^carga360go-inscripcion-C360-.*\.pdf$/);
});

test("la copia en PDF se envía al confirmar el correo solo con el flag activo", async () => {
  const outbox = mailOutboxDir();
  const pdfsFor = (email: string) =>
    fs.existsSync(outbox)
      ? fs.readdirSync(outbox).filter((name) => name.endsWith(".txt") && fs.readFileSync(path.join(outbox, name), "utf8").includes(`To: ${email}`) && fs.readFileSync(path.join(outbox, name), "utf8").includes("Adjunto: carga360go-inscripcion-"))
      : [];

  // El PDF de inscripción se controla con REGISTRATION_PDF_ENABLED (independiente de KYC_FEATURE_ENABLED).
  delete process.env.REGISTRATION_PDF_ENABLED;
  const quiet = newUser("sinflag");
  assert.equal(await sendRegistrationCopy(quiet.id), "apagado");
  assert.equal(pdfsFor("sinflag@pdf.test").length, 0);

  process.env.REGISTRATION_PDF_ENABLED = "true";
  // KYC solo para comprobar identityStatus en el comprobante; no enciende el PDF.
  process.env.KYC_FEATURE_ENABLED = "true";
  try {
    const user = newUser("conflag");
    await startEmailVerification(user, { skipRate: true });
    const mail = fs.readdirSync(outbox).map((name) => fs.readFileSync(path.join(outbox, name), "utf8")).find((body) => body.includes("To: conflag@pdf.test"));
    const token = /token=([^\s&]+)/.exec(mail ?? "")?.[1];
    assert.ok(token, "llegó el enlace de verificación");
    assert.equal(confirmEmailToken(decodeURIComponent(token)), true);
    // El envío no bloquea la confirmación: esperar a que termine.
    for (let i = 0; i < 50 && pdfsFor("conflag@pdf.test").length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(pdfsFor("conflag@pdf.test").length, 1);
    const pdfFile = fs.readdirSync(outbox).find((name) => name.endsWith(".pdf") && name.includes("carga360go-inscripcion-"));
    assert.ok(pdfFile);
    assertValidPdf(fs.readFileSync(path.join(outbox, pdfFile)));
    const data = registrationDataOf(user.id);
    assert.match(data.emailStatus, /^Confirmado el/);
    assert.equal(data.identityStatus, "Sin verificar");
    const row = getDb().prepare(`SELECT email_verified_at FROM users WHERE id = ?`).get(user.id) as { email_verified_at: string | null };
    assert.ok(row.email_verified_at);
  } finally {
    delete process.env.REGISTRATION_PDF_ENABLED;
    delete process.env.KYC_FEATURE_ENABLED;
  }
});
