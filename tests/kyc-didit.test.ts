import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
// Valores ficticios de prueba (no son credenciales reales).
process.env.DIDIT_API_KEY = "test-api-key";
process.env.DIDIT_WEBHOOK_SECRET = "test-webhook-secret";
process.env.DIDIT_WORKFLOW_ID = "11111111-2222-3333-4444-555555555555";

import { acceptPrivacyFor, accreditationOf, approveCarrier, setRequirement } from "../src/lib/accreditation";
import { registerUser } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { rutDv } from "../src/lib/format";
import { canonicalJson, setDiditFetch, signLikeDidit, verifyDiditSignature } from "../src/lib/kyc/didit";
import { KYC_CONSENT_VERSION } from "../src/lib/kyc/consent";
import { adminSetKyc, handleDiditWebhook, kycOf, mapDiditStatus, startIdentityVerification, syncFromProvider } from "../src/lib/kyc/service";
import { POST as webhookPost } from "../src/app/api/webhooks/didit/route";
import type { PublicUser } from "../src/lib/types";

const SECRET = "test-webhook-secret";
let seq = 52_000_000;

function on() {
  process.env.KYC_FEATURE_ENABLED = "true";
}
function off() {
  delete process.env.KYC_FEATURE_ENABLED;
}

function newUser(role: "mandante" | "transportista", tag: string, rutBody?: number): PublicUser {
  seq += 1;
  const body = rutBody ?? seq;
  const user = registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: `${body}-${rutDv(String(body))}`,
    contactName: `Contacto ${tag}`,
    email: `${tag}@kyc.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 5555 1234",
    city: "La Serena",
  }).user;
  const stamp = new Date().toISOString();
  getDb().prepare(`UPDATE users SET email_verified_at = ? WHERE id = ?`).run(stamp, user.id);
  return { ...user, emailVerifiedAt: stamp };
}

type Call = { url: string; init?: RequestInit };
function mockDidit(sessionId: string, extra: { decision?: unknown } = {}) {
  const calls: Call[] = [];
  setDiditFetch((async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/decision/")) return new Response(JSON.stringify(extra.decision ?? {}), { status: 200 });
    return new Response(
      JSON.stringify({ session_id: sessionId, url: `https://verify.didit.me/es/session/tok-${sessionId}`, status: "Not Started", session_token: "secreto" }),
      { status: 201 },
    );
  }) as typeof fetch);
  return calls;
}

function webhookRequest(body: unknown, opts: { secret?: string; ts?: number; tamper?: boolean; headers?: Record<string, string> } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const signed = signLikeDidit(body, opts.secret ?? SECRET, ts);
  const raw = opts.tamper ? signed.raw.replace("Approved", "Declined") : signed.raw;
  return new Request("http://127.0.0.1:4317/api/webhooks/didit", {
    method: "POST",
    headers: { ...signed.headers, ...(opts.headers ?? {}) },
    body: raw,
  });
}

let eventSeq = 0;
function event(sessionId: string, status: string, createdAt: number, decision?: unknown) {
  eventSeq += 1;
  return {
    event_id: `evt-${eventSeq}-${sessionId}`,
    webhook_type: "status.updated",
    session_id: sessionId,
    status,
    environment: "sandbox",
    created_at: createdAt,
    timestamp: Math.floor(Date.now() / 1000),
    ...(decision ? { decision } : {}),
  };
}

function approvedDecision(sessionId: string, run: string) {
  return {
    session_id: sessionId,
    status: "Approved",
    id_verifications: [
      { node_id: "id_1", status: "Approved", document_type: "Identity Card", personal_number: run, document_number: "A123456789", full_name: "José Pérez Núñez", issuing_state: "CHL", warnings: [] },
    ],
    liveness_checks: [{ status: "Approved", score: 95.4, warnings: [] }],
    face_matches: [{ status: "Approved", score: 96.1, warnings: [{ risk: "LOW_LIGHT", short_description: "Poca luz" }] }],
  };
}

test("con el flag apagado no cambia nada: ni acreditación, ni rutas, ni base", async () => {
  off();
  const user = newUser("mandante", "apagado");
  assert.deepEqual(
    accreditationOf(user.id).items.map((item) => item.key),
    ["privacidad", "correo", "calidad", "seguridad", "medioambiente", "aprobacion"],
  );
  await assert.rejects(() => startIdentityVerification(user, { consent: true }), (error: unknown) => error instanceof AppError && error.status === 404);
  const response = await webhookPost(webhookRequest(event("x", "Approved", 1)));
  assert.equal(response.status, 404);
  const table = getDb().prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'kyc_%'`).all();
  assert.equal(table.length, 0, "sin flag no se crean tablas KYC");
});

test("firma del webhook: V2, cruda, -Previous, alterada, vencida y sin secreto", () => {
  const body = { b: 1, a: { z: "José Ñandú", y: [1, 2.5, { c: null }] }, decision: {} };
  const now = 1_774_970_000;
  const signed = signLikeDidit(body, SECRET, now);
  assert.equal(signed.raw, '{"a":{"y":[1,2.5,{"c":null}],"z":"José Ñandú"},"b":1,"decision":{}}');
  assert.deepEqual(verifyDiditSignature(signed.raw, new Headers(signed.headers), { secret: SECRET, nowS: now }), { ok: true, method: "v2" });
  // El cuerpo re-serializado con otro orden de llaves sigue verificando con V2.
  const reordered = JSON.stringify({ decision: {}, b: 1, a: { z: "José Ñandú", y: [1, 2.5, { c: null }] } });
  assert.equal(verifyDiditSignature(reordered, new Headers(signed.headers), { secret: SECRET, nowS: now }).ok, true);
  // Solo X-Signature (bytes exactos).
  const rawOnly = new Headers({ "x-timestamp": String(now), "x-signature": signed.headers["x-signature"] });
  assert.deepEqual(verifyDiditSignature(signed.raw, rawOnly, { secret: SECRET, nowS: now }), { ok: true, method: "raw" });
  // Rotación: el secreto nuevo firma la cabecera normal; el viejo, la -Previous.
  const old = signLikeDidit(body, "secreto-anterior", now);
  const rotating = new Headers({ "x-timestamp": String(now), "x-signature-v2": "0".repeat(64), "x-signature-v2-previous": old.headers["x-signature-v2"] });
  assert.equal(verifyDiditSignature(signed.raw, rotating, { secret: "secreto-anterior", nowS: now }).ok, true);
  assert.deepEqual(verifyDiditSignature(signed.raw.replace("\"b\":1", "\"b\":2"), new Headers(signed.headers), { secret: SECRET, nowS: now }), { ok: false, reason: "firma_invalida" });
  assert.deepEqual(verifyDiditSignature(signed.raw, new Headers(signed.headers), { secret: SECRET, nowS: now + 301 }), { ok: false, reason: "timestamp_vencido" });
  assert.deepEqual(verifyDiditSignature(signed.raw, new Headers(signed.headers), { secret: "", nowS: now }), { ok: false, reason: "secreto_no_configurado" });
  assert.deepEqual(verifyDiditSignature(signed.raw, new Headers({ "x-signature-v2": "ab" }), { secret: SECRET, nowS: now }), { ok: false, reason: "sin_timestamp" });
  // La cabecera obsoleta X-Signature-Simple no basta.
  const simpleOnly = new Headers({ "x-timestamp": String(now), "x-signature-simple": signed.headers["x-signature"] });
  assert.equal(verifyDiditSignature(signed.raw, simpleOnly, { secret: SECRET, nowS: now }).ok, false);
  assert.equal(canonicalJson({ b: [{ d: 1, c: 2 }], a: "x" }), '{"a":"x","b":[{"c":2,"d":1}]}');
});

test("mapa de estados de Didit", () => {
  assert.equal(mapDiditStatus("Approved"), "aprobado");
  assert.equal(mapDiditStatus("Declined"), "rechazado");
  assert.equal(mapDiditStatus("In Review"), "en_revision");
  assert.equal(mapDiditStatus("Kyc Expired"), "expirado");
  assert.equal(mapDiditStatus("Abandoned"), "expirado");
  assert.equal(mapDiditStatus("Resubmitted"), "en_curso");
  assert.equal(mapDiditStatus("In Progress"), "en_curso");
});

test("iniciar la verificación exige consentimiento y correo, y crea la sesión con los datos correctos", async () => {
  on();
  try {
    const user = newUser("mandante", "inicia");
    const calls = mockDidit("sess-inicia-1");
    await assert.rejects(() => startIdentityVerification(user, { consent: false }), (e: unknown) => e instanceof AppError && e.code === "kyc_consentimiento");
    await assert.rejects(() => startIdentityVerification(user, { consent: true, consentVersion: "vieja" }), (e: unknown) => e instanceof AppError && e.code === "kyc_consentimiento_version");
    await assert.rejects(() => startIdentityVerification({ ...user, emailVerifiedAt: null }, { consent: true }), (e: unknown) => e instanceof AppError && e.code === "kyc_correo");
    assert.equal(calls.length, 0, "sin consentimiento no se llama al proveedor");

    const result = await startIdentityVerification(user, { consent: true, consentVersion: KYC_CONSENT_VERSION });
    assert.equal(result.url, "https://verify.didit.me/es/session/tok-sess-inicia-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://verification.didit.me/v3/session/");
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], "test-api-key");
    const sent = JSON.parse(String(calls[0].init?.body));
    assert.equal(sent.workflow_id, "11111111-2222-3333-4444-555555555555");
    assert.equal(sent.vendor_data, user.id);
    assert.equal(sent.callback, "http://127.0.0.1:4317/verificar-identidad/resultado");
    assert.equal(sent.language, "es");
    assert.deepEqual(sent.expected_details, { id_country: "CHL", expected_document_types: ["ID"] });
    assert.equal(sent.biometric_consent.text_version, KYC_CONSENT_VERSION);
    assert.equal(sent.contact_details.phone, "+56955551234");
    assert.doesNotMatch(String(calls[0].init?.body), /test-api-key/, "la API key no va en el cuerpo");

    const kyc = kycOf(user.id);
    assert.equal(kyc.status, "en_curso");
    assert.equal(kyc.attempts, 1);
    assert.equal(kyc.consentVersion, KYC_CONSENT_VERSION);
    // Didit devuelve la misma sesión sin terminar: no cuenta como otro intento.
    await startIdentityVerification(user, { consent: true });
    assert.equal(kycOf(user.id).attempts, 1);
    const stored = getDb().prepare(`SELECT * FROM kyc_verifications WHERE user_id = ?`).get(user.id) as Record<string, unknown>;
    assert.equal(Object.values(stored).some((value) => String(value).includes("tok-")), false, "la URL/token del flujo no se guarda");
  } finally {
    setDiditFetch(null);
    off();
  }
});

test("webhook firmado: aprobado, duplicado, desordenado, rechazado y en revisión", async () => {
  on();
  try {
    const runBody = 15_300_400;
    const user = newUser("transportista", "webhook", runBody);
    mockDidit("sess-wh-1");
    await startIdentityVerification(user, { consent: true });

    // Firma inválida → 401 y nada cambia.
    const bad = await webhookPost(webhookRequest(event("sess-wh-1", "Approved", 100), { tamper: true }));
    assert.equal(bad.status, 401);
    const stale = await webhookPost(webhookRequest(event("sess-wh-1", "Approved", 100), { ts: Math.floor(Date.now() / 1000) - 900 }));
    assert.equal(stale.status, 401);
    assert.equal(kycOf(user.id).status, "en_curso");

    const run = `${runBody}-${rutDv(String(runBody))}`;
    const approved = event("sess-wh-1", "Approved", 200, approvedDecision("sess-wh-1", run));
    const ok = await webhookPost(webhookRequest(approved));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, outcome: "aplicado" });
    let kyc = kycOf(user.id);
    assert.equal(kyc.status, "aprobado");
    assert.equal(kyc.documentRun, `${runBody}${rutDv(String(runBody))}`);
    assert.equal(kyc.runMatchesAccount, true);
    assert.equal(kyc.documentName, "José Pérez Núñez");
    assert.deepEqual(kyc.warnings, ["LOW_LIGHT"]);
    assert.equal(kyc.decidedBy, "didit");

    // Reintento del mismo evento → idempotente.
    const again = await webhookPost(webhookRequest(approved));
    assert.deepEqual(await again.json(), { ok: true, outcome: "duplicado" });
    // Un "In Progress" más antiguo que llega tarde no pisa el aprobado.
    const late = await webhookPost(webhookRequest(event("sess-wh-1", "In Progress", 150)));
    assert.deepEqual(await late.json(), { ok: true, outcome: "sin_cambio" });
    assert.equal(kycOf(user.id).status, "aprobado");

    // La cuenta aprobada vuelve a revisión si la identidad se rechaza después (corrección manual en Didit).
    getDb().prepare(`UPDATE users SET verification_status = 'verificado' WHERE id = ?`).run(user.id);
    const declined = await webhookPost(webhookRequest({ ...event("sess-wh-1", "Declined", 300, { status: "Declined", id_verifications: [{ status: "Declined", warnings: [{ risk: "DOCUMENT_EXPIRED" }] }] }), webhook_type: "data.updated" }));
    assert.deepEqual(await declined.json(), { ok: true, outcome: "aplicado" });
    kyc = kycOf(user.id);
    assert.equal(kyc.status, "rechazado");
    assert.deepEqual(kyc.warnings, ["DOCUMENT_EXPIRED"]);
    const account = getDb().prepare(`SELECT verification_status FROM users WHERE id = ?`).get(user.id) as { verification_status: string };
    assert.equal(account.verification_status, "pendiente");

    const review = await webhookPost(webhookRequest(event("sess-wh-1", "In Review", 400, { status: "In Review" })));
    assert.deepEqual(await review.json(), { ok: true, outcome: "aplicado" });
    assert.equal(kycOf(user.id).status, "en_revision");

    // Sesión desconocida, otro tipo de evento y entregas de prueba se aceptan (200) sin efecto.
    assert.deepEqual(await (await webhookPost(webhookRequest(event("sess-ajena", "Approved", 500)))).json(), { ok: true, outcome: "sesion_desconocida" });
    assert.deepEqual(await (await webhookPost(webhookRequest({ ...event("sess-wh-1", "ACTIVE", 600), webhook_type: "user.status.updated" }))).json(), { ok: true, outcome: "ignorado_tipo" });
    assert.deepEqual(
      await (await webhookPost(webhookRequest(event("sess-wh-1", "Approved", 700), { headers: { "x-didit-test-webhook": "true" } }))).json(),
      { ok: true, outcome: "ignorado_prueba" },
    );
    assert.equal(kycOf(user.id).status, "en_revision");
    // Sin event_id no se procesa.
    assert.equal(handleDiditWebhook({ webhook_type: "status.updated", session_id: "sess-wh-1", status: "Approved" }), "datos_invalidos");
  } finally {
    setDiditFetch(null);
    off();
  }
});

test("RUN de la cédula distinto al RUT de la cuenta queda marcado para el administrador", async () => {
  on();
  try {
    const user = newUser("mandante", "empresa");
    mockDidit("sess-empresa");
    await startIdentityVerification(user, { consent: true });
    const other = 12_345_678;
    handleDiditWebhook(event("sess-empresa", "Approved", 10, approvedDecision("sess-empresa", `${other}${rutDv(String(other))}`)));
    const kyc = kycOf(user.id);
    assert.equal(kyc.status, "aprobado");
    assert.equal(kyc.runMatchesAccount, false);
  } finally {
    setDiditFetch(null);
    off();
  }
});

test("con el flag, la acreditación de mandantes y transportistas exige teléfono e identidad", async () => {
  on();
  try {
    const user = newUser("mandante", "gate");
    const acc = accreditationOf(user.id);
    assert.deepEqual(
      acc.items.map((item) => item.key),
      ["privacidad", "correo", "telefono", "identidad", "calidad", "seguridad", "medioambiente", "aprobacion"],
    );
    acceptPrivacyFor(user.id);
    for (const key of ["calidad", "seguridad", "medioambiente"]) setRequirement(user.id, key, "cumple");
    assert.throws(() => approveCarrier("admin", user.id), /identidad verificada/);
    getDb().prepare(`UPDATE users SET phone_verified_at = ? WHERE id = ?`).run(new Date().toISOString(), user.id);
    assert.throws(() => approveCarrier("admin", user.id), /identidad verificada/);

    mockDidit("sess-gate");
    await startIdentityVerification(user, { consent: true });
    handleDiditWebhook(event("sess-gate", "Approved", 10, approvedDecision("sess-gate", "")));
    approveCarrier("admin", user.id);
    assert.equal(accreditationOf(user.id).accredited, true);

    const carrier = newUser("transportista", "gate-t");
    assert.deepEqual(
      accreditationOf(carrier.id).items.map((item) => item.key),
      ["privacidad", "correo", "telefono", "identidad", "documentos", "calidad", "seguridad", "medioambiente", "aprobacion"],
    );
  } finally {
    setDiditFetch(null);
    off();
  }
});

test("máximo de intentos, decisión manual del administrador y consulta al volver del flujo", async () => {
  on();
  try {
    const user = newUser("transportista", "intentos");
    const admin = { ...user, id: "admin-kyc", email: "admin@kyc.test", role: "admin" } as PublicUser;
    for (let i = 1; i <= 3; i += 1) {
      mockDidit(`sess-int-${i}`);
      await startIdentityVerification(user, { consent: true });
      handleDiditWebhook(event(`sess-int-${i}`, "Declined", i * 10, { status: "Declined" }));
    }
    assert.equal(kycOf(user.id).attempts, 3);
    await assert.rejects(() => startIdentityVerification(user, { consent: true }), (e: unknown) => e instanceof AppError && e.code === "kyc_intentos");

    assert.throws(() => adminSetKyc(admin, user.id, "rechazado", null), /motivo/);
    adminSetKyc(admin, user.id, "reiniciar", "Foto borrosa, nuevo intento");
    assert.equal(kycOf(user.id).attempts, 0);

    // Al volver del flujo se consulta la decisión al proveedor (no se cree el ?status= de la URL).
    mockDidit("sess-int-4", { decision: approvedDecision("sess-int-4", "") });
    await startIdentityVerification(user, { consent: true });
    const synced = await syncFromProvider(user, "sess-int-4");
    assert.equal(synced.status, "aprobado");
    // Una sesión ajena no se consulta.
    const stranger = newUser("mandante", "ajeno");
    assert.equal((await syncFromProvider(stranger, "sess-int-4")).status, "no_iniciado");

    // La decisión manual manda sobre eventos posteriores del proveedor.
    adminSetKyc(admin, user.id, "rechazado", "Cédula de otra persona");
    handleDiditWebhook(event("sess-int-4", "Approved", 99_999, approvedDecision("sess-int-4", "")));
    assert.equal(kycOf(user.id).status, "rechazado");
    adminSetKyc(admin, user.id, "aprobado", "Revisado con el titular");
    assert.equal(kycOf(user.id).status, "aprobado");
    assert.throws(() => adminSetKyc(admin, user.id, "cualquiera", null), /no válido/);
  } finally {
    setDiditFetch(null);
    off();
  }
});
