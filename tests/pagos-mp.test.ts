import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { createSession, hashPassword } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { installmentCharge, splitFreight } from "../src/lib/pagos/amounts";
import { addBusinessHours } from "../src/lib/pagos/business-hours";
import { decryptToken, encryptToken } from "../src/lib/pagos/crypto";
import { setMpFetch, type FetchLike } from "../src/lib/pagos/mp-client";
import { closeWindows, renewTokens } from "../src/lib/pagos/service";
import { canTransition, checkoutAllowed, installmentStatusFromMp, nextStatuses, shouldApplyInstallment } from "../src/lib/pagos/state";
import { signManifest, signatureManifest, verifyMpSignature } from "../src/lib/pagos/webhook";
import { handleMpWebhook } from "../src/lib/pagos/webhook-handler";
import { resetRateLimits } from "../src/lib/rate-limit";
import * as cuentaRoute from "../src/app/api/pagos/cuenta/route";
import * as taxRoute from "../src/app/api/pagos/cuenta/tax-ready/route";
import * as startRoute from "../src/app/api/pagos/mercadopago/oauth/start/route";
import * as callbackRoute from "../src/app/api/pagos/mercadopago/oauth/callback/route";
import * as detailRoute from "../src/app/api/pagos/fletes/[id]/route";
import * as listRoute from "../src/app/api/pagos/fletes/route";
import * as checkoutRoute from "../src/app/api/pagos/fletes/[id]/checkout/route";
import * as transitRoute from "../src/app/api/pagos/fletes/[id]/en-transito/route";
import * as podRoute from "../src/app/api/pagos/fletes/[id]/pod/route";
import * as disputeRoute from "../src/app/api/pagos/fletes/[id]/disputas/route";
import * as refundRoute from "../src/app/api/pagos/admin/fletes/[id]/reembolsar/route";
import * as closeJob from "../src/app/api/pagos/jobs/cerrar-ventanas/route";
import * as cancelRoute from "../src/app/api/pagos/fletes/[id]/cancelar/route";
import { termsSections } from "../src/lib/terms";
import { policySections } from "../src/lib/privacy-policy";
import { termsVersion, TERMS_VERSION, TERMS_VERSION_PAYMENTS, privacyVersion, PRIVACY_VERSION_PAYMENTS } from "../src/lib/privacy";

const BASE = "http://127.0.0.1:4317";
const FIX = path.join(import.meta.dirname, "fixtures", "mp-webhooks");
const SECRET = "secreto-de-prueba-webhook-no-real";

function fixture(name: string, values: Record<string, string | number>): Record<string, unknown> {
  let text = fs.readFileSync(path.join(FIX, name), "utf8");
  for (const [key, value] of Object.entries(values)) {
    text = typeof value === "number" ? text.split(`"{{${key}}}"`).join(String(value)) : text.split(`{{${key}}}`).join(value);
  }
  return JSON.parse(text);
}

function enable() {
  process.env.PAYMENTS_FEATURE_ENABLED = "true";
  process.env.PAYMENTS_MP_ENV = "test";
  process.env.MP_CLIENT_ID = "1234567890";
  process.env.MP_CLIENT_SECRET = "cliente-secreto-simulado";
  process.env.MP_OAUTH_REDIRECT_URI = `${BASE}/api/pagos/mercadopago/oauth/callback`;
  process.env.MP_WEBHOOK_SECRET = SECRET;
  process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.PAYMENTS_CRON_SECRET = "cron-secreto-simulado-de-24-caracteres-o-mas";
  delete process.env.PAYMENTS_CL_HOLIDAYS;
  delete process.env.MP_TEST_PAYER_EMAIL;
  delete process.env.MP_OAUTH_TEST_TOKEN;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function req(method: string, url: string, opts: { token?: string; body?: unknown; form?: FormData; headers?: Record<string, string> } = {}) {
  const headers = new Headers(opts.headers);
  // Señales de mismo origen (como el navegador): mutaciones con cookie de sesión las exige assertSameOrigin.
  if (!headers.has("sec-fetch-site")) headers.set("sec-fetch-site", "same-origin");
  if (!headers.has("host")) headers.set("host", "127.0.0.1:4317");
  if (opts.token) headers.set("cookie", `c360_session=${opts.token}`);
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  return new Request(`${BASE}${url}`, { method, headers, body });
}

let seq = 0;
function makeUser(role: "mandante" | "transportista" | "admin") {
  seq += 1;
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO users (id, email, password_hash, role, razon_social, rut, rut_norm, contact_name, whatsapp, city, verification_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verificado', ?)`,
    )
    .run(id, `pagos${seq}-${role}@example.cl`, hashPassword("clave-segura-123"), role, `Empresa ${role} ${seq}`, `${seq}-K`, `pagos-${seq}-${id}`, "Contacto", "56912345678", "Santiago", new Date().toISOString());
  return { id, token: createSession(id, { mfa: role === "admin" }) };
}

function awardedLoad(shipperId: string, carrierId: string, price: number) {
  const loadId = randomUUID();
  const offerId = randomUUID();
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO loads (id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, created_at, updated_at, status, awarded_offer_id)
     VALUES (?, ?, 'Santiago', 'Antofagasta', '2026-11-20', 'rampla_plana', 'Prueba', 10, ?, ?, 'adjudicada', ?)`,
  ).run(loadId, shipperId, stamp, stamp, offerId);
  db.prepare(`INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-11-20', 'aceptada', ?, ?)`).run(
    offerId,
    loadId,
    carrierId,
    price,
    stamp,
    stamp,
  );
  return loadId;
}

/** Simulador de la API de Mercado Pago: ninguna llamada sale a internet. */
function mockMp() {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const payments = new Map<string, Record<string, unknown>>();
  let tokenSeq = 0;
  const state = { mpUserId: "987654321", refundFails: false };
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, ...init });
    const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (url.endsWith("/oauth/token")) {
      tokenSeq += 1;
      return ok(fixture("oauth-token.json", { ACCESS_TOKEN: `APP_USR-acceso-simulado-${tokenSeq}`, REFRESH_TOKEN: `TG-refresh-simulado-${tokenSeq}`, MP_USER_ID: state.mpUserId }));
    }
    if (url.endsWith("/checkout/preferences")) return ok(fixture("preference.json", { PREFERENCE_ID: `pref-${calls.length}` }), 201);
    const refund = /\/v1\/payments\/(\d+)\/refunds$/.exec(url);
    if (refund) return state.refundFails ? ok({ error: "insufficient_funds" }, 400) : ok({ id: 1, status: "approved" }, 201);
    const get = /\/v1\/payments\/(\d+)$/.exec(url);
    if (get) return payments.has(get[1]) ? ok(payments.get(get[1])) : ok({ error: "not_found" }, 404);
    return ok({ error: "no_simulado" }, 404);
  };
  setMpFetch(impl);
  return { calls, payments, state };
}

function signedWebhook(body: Record<string, unknown>, opts: { secret?: string; ts?: number } = {}) {
  const dataId = String((body.data as { id: string }).id);
  const requestId = randomUUID();
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const v1 = signManifest(signatureManifest(dataId, requestId, ts), opts.secret ?? SECRET);
  return new Request(`${BASE}/api/pagos/mercadopago/webhooks?data.id=${dataId}&type=${body.type}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

/* ---------------------------------------------------------------- unidades puras */

test("máquina de estados: transiciones permitidas y prohibidas", () => {
  assert.ok(canTransition("adjudicada", "anticipo_pagado", "webhook"));
  assert.ok(!canTransition("adjudicada", "anticipo_pagado", "mandante"), "el navegador no puede marcar pagado");
  assert.ok(canTransition("anticipo_pagado", "entregada_POD", "transportista"));
  assert.ok(!canTransition("adjudicada", "entregada_POD", "transportista"));
  assert.ok(canTransition("entregada_POD", "saldo_liberado", "job"));
  assert.ok(!canTransition("en_disputa", "saldo_liberado", "job"), "una disputa no se libera sola");
  assert.deepEqual(nextStatuses("saldo_liberado"), []);
  assert.deepEqual(nextStatuses("reembolsada"), []);
  assert.ok(canTransition("en_disputa", "reembolso_fallido", "admin"));
  assert.equal(installmentStatusFromMp("in_process"), "pendiente_mp");
  assert.equal(installmentStatusFromMp("cancelled"), "rejected");
  assert.equal(installmentStatusFromMp("raro"), null);
  assert.ok(!shouldApplyInstallment("approved", "pendiente_mp"), "un evento viejo no retrocede una cuota aprobada");
  assert.ok(shouldApplyInstallment("rejected", "approved"));
  assert.ok(checkoutAllowed("adjudicada", "anticipo", "rejected"), "se puede reintentar tras un rechazo");
  assert.ok(!checkoutAllowed("anticipo_pagado", "saldo", "pendiente"), "el saldo no se paga antes del POD");
  assert.ok(checkoutAllowed("entregada_POD", "saldo", "pendiente"));
});

test("montos: anticipo/saldo exactos y recargo cuando paga el mandante", () => {
  assert.deepEqual(splitFreight(1_190_000, 40), { anticipo: 476_000, saldo: 714_000 });
  const odd = splitFreight(1_000_001, 33);
  assert.equal(odd.anticipo + odd.saldo, 1_000_001);
  const shipper = installmentCharge(476_000, { feePayer: "shipper", feeRate: 0.0319, vatRate: 0.19 });
  assert.equal(shipper.charged, Math.round(476_000 / (1 - 0.0319 * 1.19)));
  assert.equal(shipper.base + shipper.estimatedFee, shipper.charged);
  const trucker = installmentCharge(476_000, { feePayer: "trucker", feeRate: 0.0319, vatRate: 0.19 });
  assert.equal(trucker.charged, 476_000);
});

test("ventana de 48 horas hábiles en zona Chile cruza fin de semana y feriado", () => {
  // Viernes 13-11-2026 15:00 en Chile (UTC-3) = 18:00Z
  const start = new Date("2026-11-13T18:00:00Z");
  assert.equal(addBusinessHours(start, 48).toISOString(), "2026-11-17T18:00:00.000Z"); // martes 15:00
  assert.equal(addBusinessHours(start, 48, ["2026-11-16"]).toISOString(), "2026-11-18T18:00:00.000Z"); // lunes feriado → miércoles
  // Sábado: parte el lunes 00:00 de Chile
  assert.equal(addBusinessHours(new Date("2026-11-14T15:00:00Z"), 24).toISOString(), "2026-11-17T03:00:00.000Z");
});

test("cifrado de tokens: ida y vuelta, alteración detectada y rotación de clave", () => {
  process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const sealed = encryptToken("APP_USR-token-simulado");
  assert.ok(!sealed.includes("APP_USR"));
  assert.equal(decryptToken(sealed), "APP_USR-token-simulado");
  const parts = sealed.split(".");
  parts[3] = Buffer.from("otro-contenido").toString("base64url");
  assert.throws(() => decryptToken(parts.join(".")));
  process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY_PREVIOUS = process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY;
  process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  assert.equal(decryptToken(sealed), "APP_USR-token-simulado");
  delete process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY_PREVIOUS;
});

test("firma x-signature: válida, alterada, vencida, sin secreto y data.id alfanumérico", () => {
  const now = Date.UTC(2026, 10, 11, 13, 0, 0);
  const ts = String(Math.floor(now / 1000));
  const v1 = signManifest(signatureManifest("123456", "req-1", ts), SECRET);
  assert.equal(signatureManifest("123456", "req-1", ts), `id:123456;request-id:req-1;ts:${ts};`);
  const base = { secret: SECRET, requestId: "req-1", dataId: "123456", nowMs: now };
  assert.equal(verifyMpSignature({ ...base, signatureHeader: `ts=${ts},v1=${v1}` }).valid, true);
  assert.equal(verifyMpSignature({ ...base, signatureHeader: `ts=${ts},v1=${v1}`, dataId: "123457" }).reason, "firma_invalida");
  assert.equal(verifyMpSignature({ ...base, signatureHeader: `ts=${ts},v1=${v1}`, nowMs: now + 3600_000 }).reason, "ts_vencido");
  assert.equal(verifyMpSignature({ ...base, secret: "", signatureHeader: `ts=${ts},v1=${v1}` }).reason, "sin_secreto");
  assert.equal(verifyMpSignature({ ...base, signatureHeader: "basura" }).reason, "formato");
  const alpha = signManifest(signatureManifest("ABC123", "req-1", ts), SECRET);
  assert.match(signatureManifest("ABC123", "req-1", ts), /^id:abc123;/);
  assert.equal(verifyMpSignature({ ...base, dataId: "ABC123", signatureHeader: `ts=${ts},v1=${alpha}` }).valid, true);
});

/* ---------------------------------------------------------------- flag apagado */

test("con PAYMENTS_FEATURE_ENABLED apagado: rutas 403, webhook 200 sin tocar la base", async () => {
  delete process.env.PAYMENTS_FEATURE_ENABLED;
  const shipper = makeUser("mandante");
  const res = await checkoutRoute.POST(req("POST", "/api/pagos/fletes/x/checkout", { token: shipper.token, body: { installment: "anticipo" } }), ctx("x"));
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { error: string }).error, "pagos_deshabilitados");
  const hook = await handleMpWebhook(signedWebhook(fixture("payment-updated.json", { PAYMENT_ID: "1", EVENT_ID: "1", MP_USER_ID: "1" })));
  assert.equal(hook.status, 200);
  const tables = getDb().prepare(`SELECT name FROM sqlite_master WHERE name IN ('freight_payments', 'payment_events', 'payments_schema_migrations')`).all();
  assert.deepEqual(tables, [], "la migración de pagos no se aplica con el flag apagado");
  const job = await closeJob.POST(new Request(`${BASE}/api/pagos/jobs/cerrar-ventanas`, { method: "POST" }));
  assert.equal(job.status, 403);
});

/* ---------------------------------------------------------------- flujo completo (simulado) */

test("flujo completo en modo prueba: OAuth, checkout, webhook, POD, ventana y liberación", async () => {
  enable();
  resetRateLimits();
  const mp = mockMp();
  const shipper = makeUser("mandante");
  const trucker = makeUser("transportista");
  const stranger = makeUser("mandante");
  const loadId = awardedLoad(shipper.id, trucker.id, 1_190_000);

  // OAuth: start → 302 a auth.mercadopago.cl con state
  const start = await startRoute.GET(req("GET", "/api/pagos/mercadopago/oauth/start", { token: trucker.token }), ctx(""));
  assert.equal(start.status, 302);
  const auth = new URL(start.headers.get("location")!);
  assert.equal(auth.origin, "https://auth.mercadopago.cl");
  assert.equal(auth.searchParams.get("redirect_uri"), process.env.MP_OAUTH_REDIRECT_URI);
  const state = auth.searchParams.get("state")!;
  assert.ok(state.length >= 40);

  // state inventado: no guarda tokens
  const bad = await callbackRoute.GET(req("GET", `/api/pagos/mercadopago/oauth/callback?code=TG-x&state=inventado`, { token: trucker.token }));
  assert.match(bad.headers.get("location")!, /error=state/);
  // state de otro usuario: tampoco
  const other = await callbackRoute.GET(req("GET", `/api/pagos/mercadopago/oauth/callback?code=TG-x&state=${state}`, { token: makeUser("transportista").token }));
  assert.match(other.headers.get("location")!, /error=sesion|error=state/);
  const good = await callbackRoute.GET(req("GET", `/api/pagos/mercadopago/oauth/callback?code=TG-ok&state=${state}`, { token: trucker.token }));
  assert.match(good.headers.get("location")!, /conectado=1/);
  const exchange = mp.calls.find((call) => call.url.endsWith("/oauth/token"))!;
  assert.match(exchange.body!, /grant_type=authorization_code/);
  assert.match(exchange.body!, /state=/);
  assert.match(exchange.body!, /test_token=false/, "OAuth de marketplace en prueba pide token APP_USR del vendedor, no TEST-");
  const reused = await callbackRoute.GET(req("GET", `/api/pagos/mercadopago/oauth/callback?code=TG-ok&state=${state}`, { token: trucker.token }));
  assert.match(reused.headers.get("location")!, /error=state/, "el state es de un solo uso");

  const stored = getDb().prepare(`SELECT access_token_encrypted, refresh_token_encrypted FROM payment_accounts WHERE user_id = ?`).get(trucker.id) as Record<string, string>;
  assert.ok(!stored.access_token_encrypted.includes("APP_USR"), "tokens cifrados en reposo");
  const cuenta = await cuentaRoute.GET(req("GET", "/api/pagos/cuenta", { token: trucker.token }), ctx(""));
  const cuentaText = await cuenta.text();
  assert.ok(!/APP_USR|TG-refresh/.test(cuentaText), "los tokens no viajan al navegador");

  // Sin declaración tributaria no se puede pagar
  const list = (await (await listRoute.GET(req("GET", "/api/pagos/fletes", { token: shipper.token }), ctx(""))).json()) as { fletes: { id: string; loadId: string }[] };
  const fp = list.fletes.find((item) => item.loadId === loadId)!;
  assert.ok(fp);
  let res = await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp.id));
  assert.equal(res.status, 409);
  assert.equal((await taxRoute.POST(req("POST", "/api/pagos/cuenta/tax-ready", { token: trucker.token, body: { value: true } }), ctx(""))).status, 200);

  // Un tercero no ve el flete
  assert.equal((await detailRoute.GET(req("GET", `/api/pagos/fletes/${fp.id}`, { token: stranger.token }), ctx(fp.id))).status, 403);
  // El transportista no puede crear el checkout
  assert.equal((await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: trucker.token, body: { installment: "anticipo" } }), ctx(fp.id))).status, 403);
  // El saldo no se puede pagar antes del POD
  res = await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "saldo" } }), ctx(fp.id));
  assert.equal(res.status, 409);

  // Checkout del anticipo: init_point (las cuentas de prueba APP_USR no abren sandbox_init_point), token del vendedor, marketplace_fee 0, monto calculado en servidor
  res = await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo", unit_price: 1 } }), ctx(fp.id));
  assert.equal(res.status, 200, await res.clone().text());
  const out = (await res.json()) as { url: string; reused: boolean };
  assert.match(out.url, /^https:\/\/www\.mercadopago\.cl\//);
  const prefCall = mp.calls.find((call) => call.url.endsWith("/checkout/preferences"))!;
  assert.match(prefCall.headers.authorization, /^Bearer APP_USR-acceso-simulado-1$/);
  const pref = JSON.parse(prefCall.body!);
  const expected = installmentCharge(476_000, { feePayer: "shipper", feeRate: 0.0319, vatRate: 0.19 }).charged;
  assert.equal(pref.items[0].unit_price, expected);
  assert.equal(pref.marketplace_fee, 0);
  assert.equal(pref.external_reference, `${fp.id}:anticipo`);
  assert.ok(!("collector_id" in pref));
  assert.ok(!pref.payer, "sin MP_TEST_PAYER_EMAIL no se envía payer");
  if (pref.notification_url) assert.match(pref.notification_url, /source_news=webhooks/);
  const again = (await (await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp.id))).json()) as { reused: boolean };
  assert.equal(again.reused, true, "no duplica preferencias pendientes");

  // Webhook firmado + GET del pago → anticipo_pagado
  // Las cuentas de prueba de MP informan live_mode=true: en modo prueba no debe rechazarse.
  mp.payments.set("1001", { ...fixture("get-payment.json", { PAYMENT_ID: 1001, STATUS: "approved", EXTERNAL_REFERENCE: `${fp.id}:anticipo`, AMOUNT: expected, MP_USER_ID: 987654321 }), live_mode: true });
  // IPN antigua sin firma (?topic=payment&id=…): 200 sin procesar
  const ipn = await handleMpWebhook(new Request(`${BASE}/api/pagos/mercadopago/webhooks?source_news=webhooks&topic=payment&id=1001`, { method: "POST", body: "" }), { awaitProcessing: true });
  assert.equal(ipn.status, 200);
  assert.equal(((await ipn.json()) as { ignored?: string }).ignored, "ipn_sin_firma");
  const event = fixture("payment-updated.json", { PAYMENT_ID: "1001", EVENT_ID: "evt-1", MP_USER_ID: "987654321" });
  let hook = await handleMpWebhook(signedWebhook(event), { awaitProcessing: true });
  assert.equal(hook.status, 200);
  const detail = async () => ((await (await detailRoute.GET(req("GET", `/api/pagos/fletes/${fp.id}`, { token: shipper.token }), ctx(fp.id))).json()) as { flete: { status: string; installments: { kind: string; status: string }[]; disputeWindowEndsAt: string } }).flete;
  assert.equal((await detail()).status, "anticipo_pagado");
  // duplicado: no cambia nada
  hook = await handleMpWebhook(signedWebhook(event), { awaitProcessing: true });
  assert.equal(((await hook.json()) as { duplicate?: boolean }).duplicate, true);
  // firma inválida: 401
  hook = await handleMpWebhook(signedWebhook({ ...event, id: "evt-x" }, { secret: "otro" }), { awaitProcessing: true });
  assert.equal(hook.status, 401);

  // en tránsito y POD (foto + firma)
  assert.equal((await transitRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/en-transito`, { token: trucker.token }), ctx(fp.id))).status, 200);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);
  const form = new FormData();
  form.append("foto_documento", new Blob([png], { type: "image/png" }), "guia.png");
  form.append("firma", new Blob([png], { type: "image/png" }), "firma.png");
  res = await podRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/pod`, { token: trucker.token, form }), ctx(fp.id));
  assert.equal(res.status, 200, await res.clone().text());
  const afterPod = await detail();
  assert.equal(afterPod.status, "entregada_POD");
  assert.ok(new Date(afterPod.disputeWindowEndsAt).getTime() > Date.now() + 47 * 3600_000);

  // saldo aprobado, pero la ventana sigue abierta → no se libera
  const saldoAmount = installmentCharge(714_000, { feePayer: "shipper", feeRate: 0.0319, vatRate: 0.19 }).charged;
  await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "saldo" } }), ctx(fp.id));
  mp.payments.set("1002", fixture("get-payment.json", { PAYMENT_ID: 1002, STATUS: "approved", EXTERNAL_REFERENCE: `${fp.id}:saldo`, AMOUNT: saldoAmount, MP_USER_ID: 987654321 }));
  await handleMpWebhook(signedWebhook(fixture("payment-updated.json", { PAYMENT_ID: "1002", EVENT_ID: "evt-2", MP_USER_ID: "987654321" })), { awaitProcessing: true });
  assert.equal(closeWindows(new Date()), 0);
  assert.equal((await detail()).status, "entregada_POD");
  // cron sin secreto → 401
  assert.equal((await closeJob.POST(new Request(`${BASE}/api/pagos/jobs/cerrar-ventanas`, { method: "POST" }))).status, 401);
  // ventana vencida → saldo_liberado
  assert.equal(closeWindows(new Date(Date.now() + 10 * 24 * 3600_000)), 1);
  assert.equal((await detail()).status, "saldo_liberado");
  setMpFetch(null);
});

test("disputa, reembolso fallido, monto alterado, desvinculación y renovación de tokens", async () => {
  enable();
  resetRateLimits();
  const mp = mockMp();
  mp.state.mpUserId = "555000111";
  const shipper = makeUser("mandante");
  const trucker = makeUser("transportista");
  const admin = makeUser("admin");
  const loadId = awardedLoad(shipper.id, trucker.id, 500_000);
  const start = await startRoute.GET(req("GET", "/api/pagos/mercadopago/oauth/start", { token: trucker.token }), ctx(""));
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  await callbackRoute.GET(req("GET", `/api/pagos/mercadopago/oauth/callback?code=TG-ok&state=${state}`, { token: trucker.token }));
  await taxRoute.POST(req("POST", "/api/pagos/cuenta/tax-ready", { token: trucker.token, body: { value: true } }), ctx(""));
  const list = (await (await listRoute.GET(req("GET", "/api/pagos/fletes", { token: shipper.token }), ctx(""))).json()) as { fletes: { id: string; loadId: string }[] };
  const fp = list.fletes.find((item) => item.loadId === loadId)!;
  await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp.id));
  const charged = installmentCharge(200_000, { feePayer: "shipper", feeRate: 0.0319, vatRate: 0.19 }).charged;

  // Monto distinto al calculado: no se aplica
  mp.payments.set("2001", fixture("get-payment.json", { PAYMENT_ID: 2001, STATUS: "approved", EXTERNAL_REFERENCE: `${fp.id}:anticipo`, AMOUNT: 100, MP_USER_ID: 555000111 }));
  await handleMpWebhook(signedWebhook(fixture("payment-updated.json", { PAYMENT_ID: "2001", EVENT_ID: "e-1", MP_USER_ID: "555000111" })), { awaitProcessing: true });
  const statusOf = () => (getDb().prepare(`SELECT status FROM freight_payments WHERE id = ?`).get(fp.id) as { status: string }).status;
  assert.equal(statusOf(), "adjudicada");

  mp.payments.set("2002", fixture("get-payment.json", { PAYMENT_ID: 2002, STATUS: "approved", EXTERNAL_REFERENCE: `${fp.id}:anticipo`, AMOUNT: charged, MP_USER_ID: 555000111 }));
  await handleMpWebhook(signedWebhook(fixture("payment-updated.json", { PAYMENT_ID: "2002", EVENT_ID: "e-2", MP_USER_ID: "555000111" })), { awaitProcessing: true });
  assert.equal(statusOf(), "anticipo_pagado");

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(32)]);
  const form = new FormData();
  form.append("foto_documento", new Blob([png], { type: "image/png" }), "guia.png");
  form.append("firma_en_foto", "1");
  assert.equal((await podRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/pod`, { token: trucker.token, form }), ctx(fp.id))).status, 200);

  // Reclamo dentro de la ventana
  let res = await disputeRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/disputas`, { token: shipper.token, body: { reason: "danos", comment: "Llegó dañada" } }), ctx(fp.id));
  assert.equal(res.status, 201, await res.clone().text());
  assert.equal(statusOf(), "en_disputa");
  assert.equal(closeWindows(new Date(Date.now() + 30 * 24 * 3600_000)), 0, "con disputa abierta no se libera");

  // Reembolso que MP rechaza por saldo → reembolso_fallido; Carga360go no cubre
  mp.state.refundFails = true;
  res = await refundRoute.POST(req("POST", `/api/pagos/admin/fletes/${fp.id}/reembolsar`, { token: admin.token, body: { installment: "anticipo" } }), ctx(fp.id));
  assert.equal(res.status, 409);
  assert.equal(statusOf(), "reembolso_fallido");
  const refundCall = mp.calls.find((call) => /\/refunds$/.test(call.url))!;
  assert.ok(refundCall.headers["x-idempotency-key"], "reembolso con X-Idempotency-Key");
  // Reintento exitoso → reembolsada
  mp.state.refundFails = false;
  res = await refundRoute.POST(req("POST", `/api/pagos/admin/fletes/${fp.id}/reembolsar`, { token: admin.token, body: { installment: "anticipo" } }), ctx(fp.id));
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(statusOf(), "reembolsada");
  // Un mandante no puede reembolsar
  assert.equal((await refundRoute.POST(req("POST", `/api/pagos/admin/fletes/${fp.id}/reembolsar`, { token: shipper.token, body: {} }), ctx(fp.id))).status, 403);

  // Renovación: un token próximo a vencer obtiene un refresh_token nuevo
  const before = getDb().prepare(`SELECT refresh_token_encrypted FROM payment_accounts WHERE user_id = ?`).get(trucker.id) as { refresh_token_encrypted: string };
  getDb().prepare(`UPDATE payment_accounts SET expires_at = ? WHERE user_id = ?`).run(new Date(Date.now() + 5 * 24 * 3600_000).toISOString(), trucker.id);
  const renewed = await renewTokens();
  assert.equal(renewed.renewed >= 1, true);
  const after = getDb().prepare(`SELECT refresh_token_encrypted, expires_at FROM payment_accounts WHERE user_id = ?`).get(trucker.id) as { refresh_token_encrypted: string; expires_at: string };
  assert.notEqual(decryptToken(after.refresh_token_encrypted), decryptToken(before.refresh_token_encrypted));
  assert.ok(new Date(after.expires_at).getTime() > Date.now() + 170 * 24 * 3600_000);

  // mp-connect de baja → cuenta revocada y sin nuevos checkouts
  const deauth = fixture("mp-connect-deauthorization.json", { EVENT_ID: "e-3", MP_USER_ID: "555000111" });
  await handleMpWebhook(signedWebhook(deauth), { awaitProcessing: true });
  const acc = getDb().prepare(`SELECT status, access_token_encrypted FROM payment_accounts WHERE user_id = ?`).get(trucker.id) as { status: string; access_token_encrypted: string | null };
  assert.equal(acc.status, "revoked");
  assert.equal(acc.access_token_encrypted, null);
  const load2 = awardedLoad(shipper.id, trucker.id, 300_000);
  const list2 = (await (await listRoute.GET(req("GET", "/api/pagos/fletes", { token: shipper.token }), ctx(""))).json()) as { fletes: { id: string; loadId: string }[] };
  const fp2 = list2.fletes.find((item) => item.loadId === load2)!;
  res = await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp2.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp2.id));
  assert.equal(res.status, 409);
  setMpFetch(null);
});

test("al reconectar Mercado Pago no reutiliza una preferencia anterior", async () => {
  enable();
  resetRateLimits();
  const mp = mockMp();
  const shipper = makeUser("mandante");
  const trucker = makeUser("transportista");
  const loadId = awardedLoad(shipper.id, trucker.id, 1_190_000);

  const start = await startRoute.GET(req("GET", "/api/pagos/mercadopago/oauth/start", { token: trucker.token }), ctx(""));
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  assert.equal((await callbackRoute.GET(req("GET", `/api/pagos/mercadopago/oauth/callback?code=TG-ok&state=${state}`, { token: trucker.token }))).status, 302);
  assert.equal((await taxRoute.POST(req("POST", "/api/pagos/cuenta/tax-ready", { token: trucker.token, body: { value: true } }), ctx(""))).status, 200);

  const list = (await (await listRoute.GET(req("GET", "/api/pagos/fletes", { token: shipper.token }), ctx(""))).json()) as { fletes: { id: string }[] };
  const fp = list.fletes[0]!;
  const first = await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp.id));
  assert.equal(first.status, 200, await first.clone().text());
  const reused = (await (await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp.id))).json()) as { reused: boolean };
  assert.equal(reused.reused, true);

  const start2 = await startRoute.GET(req("GET", "/api/pagos/mercadopago/oauth/start", { token: trucker.token }), ctx(""));
  const state2 = new URL(start2.headers.get("location")!).searchParams.get("state")!;
  assert.match((await callbackRoute.GET(req("GET", `/api/pagos/mercadopago/oauth/callback?code=TG-ok&state=${state2}`, { token: trucker.token }))).headers.get("location")!, /conectado=1/);

  const inst = getDb().prepare(`SELECT preference_id, init_point, preference_created_at, status FROM freight_payment_installments WHERE freight_payment_id = ? AND kind = 'anticipo'`).get(fp.id) as { preference_id: string | null; init_point: string | null; preference_created_at: string | null; status: string };
  assert.equal(inst.preference_id, null, "OAuth nuevo anula la preferencia emitida con el token anterior");
  assert.equal(inst.init_point, null);
  assert.equal(inst.preference_created_at, null);
  assert.equal(inst.status, "preferencia_creada");

  const prefsBefore = mp.calls.filter((call) => call.url.endsWith("/checkout/preferences")).length;
  const again = await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp.id));
  assert.equal(again.status, 200, await again.clone().text());
  const out = (await again.json()) as { reused: boolean; url: string };
  assert.equal(out.reused, false, "tras reconectar crea una preferencia nueva");
  assert.match(out.url, /^https:\/\/www\.mercadopago\.cl\//);
  assert.equal(mp.calls.filter((call) => call.url.endsWith("/checkout/preferences")).length, prefsBefore + 1);
  setMpFetch(null);
});

async function connectTrucker(token: string) {
  const start = await startRoute.GET(req("GET", "/api/pagos/mercadopago/oauth/start", { token }), ctx(""));
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  await callbackRoute.GET(req("GET", `/api/pagos/mercadopago/oauth/callback?code=TG-ok&state=${state}`, { token }));
  await taxRoute.POST(req("POST", "/api/pagos/cuenta/tax-ready", { token, body: { value: true } }), ctx(""));
}

test("mandante cancela antes del anticipo (con confirmación) y el pago no se vuelve a crear", async () => {
  enable();
  resetRateLimits();
  mockMp();
  const shipper = makeUser("mandante");
  const trucker = makeUser("transportista");
  const other = makeUser("mandante");
  const loadId = awardedLoad(shipper.id, trucker.id, 400_000);
  await connectTrucker(trucker.token);
  const list = async () => ((await (await listRoute.GET(req("GET", "/api/pagos/fletes", { token: shipper.token }), ctx(""))).json()) as { fletes: { id: string; loadId: string; status: string }[] }).fletes.filter((f) => f.loadId === loadId);
  const fp = (await list())[0]!;
  await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp.id));

  assert.equal((await cancelRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/cancelar`, { token: shipper.token, body: {} }), ctx(fp.id))).status, 400, "sin confirmación");
  assert.equal((await cancelRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/cancelar`, { token: other.token, body: { confirm: true } }), ctx(fp.id))).status, 403);
  assert.equal((await cancelRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/cancelar`, { token: trucker.token, body: { confirm: true } }), ctx(fp.id))).status, 403);
  const ok = await cancelRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/cancelar`, { token: shipper.token, body: { confirm: true } }), ctx(fp.id));
  assert.equal(ok.status, 200, await ok.clone().text());
  const rows = await list();
  assert.equal(rows.length, 1, "no se crea otro pago para la misma adjudicación");
  assert.equal(rows[0]!.status, "cancelada");
  const inst = getDb().prepare(`SELECT init_point FROM freight_payment_installments WHERE freight_payment_id = ? AND kind = 'anticipo'`).get(fp.id) as { init_point: string | null };
  assert.equal(inst.init_point, null);
  assert.equal((await checkoutRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/checkout`, { token: shipper.token, body: { installment: "anticipo" } }), ctx(fp.id))).status, 409);

  // Con el anticipo pendiente en Mercado Pago ya no se puede cancelar
  const load2 = awardedLoad(shipper.id, trucker.id, 200_000);
  const fp2 = ((await (await listRoute.GET(req("GET", "/api/pagos/fletes", { token: shipper.token }), ctx(""))).json()) as { fletes: { id: string; loadId: string }[] }).fletes.find((f) => f.loadId === load2)!;
  getDb().prepare(`UPDATE freight_payment_installments SET status = 'pendiente_mp' WHERE freight_payment_id = ? AND kind = 'anticipo'`).run(fp2.id);
  assert.equal((await cancelRoute.POST(req("POST", `/api/pagos/fletes/${fp2.id}/cancelar`, { token: shipper.token, body: { confirm: true } }), ctx(fp2.id))).status, 409);
  setMpFetch(null);
});

test("el transportista también puede abrir un reclamo dentro de la ventana", async () => {
  enable();
  resetRateLimits();
  const mp = mockMp();
  mp.state.mpUserId = "777000222";
  const shipper = makeUser("mandante");
  const trucker = makeUser("transportista");
  const loadId = awardedLoad(shipper.id, trucker.id, 100_000);
  await connectTrucker(trucker.token);
  const fp = ((await (await listRoute.GET(req("GET", "/api/pagos/fletes", { token: trucker.token }), ctx(""))).json()) as { fletes: { id: string; loadId: string }[] }).fletes.find((f) => f.loadId === loadId)!;
  getDb().prepare(`UPDATE freight_payments SET status = 'entregada_POD', dispute_window_ends_at = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), fp.id);
  let res = await disputeRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/disputas`, { token: trucker.token, body: { reason: "cobro_incorrecto" } }), ctx(fp.id));
  assert.equal(res.status, 409, "ventana cerrada");
  getDb().prepare(`UPDATE freight_payments SET dispute_window_ends_at = ? WHERE id = ?`).run(new Date(Date.now() + 3600_000).toISOString(), fp.id);
  res = await disputeRoute.POST(req("POST", `/api/pagos/fletes/${fp.id}/disputas`, { token: trucker.token, body: { reason: "cobro_incorrecto", comment: "No pagan el saldo" } }), ctx(fp.id));
  assert.equal(res.status, 201, await res.clone().text());
  assert.equal((getDb().prepare(`SELECT status FROM freight_payments WHERE id = ?`).get(fp.id) as { status: string }).status, "en_disputa");
  setMpFetch(null);
});

test("textos legales con el flag de pagos: nueva versión y sin la frase de que no hay sistema de pago", () => {
  enable();
  assert.equal(termsVersion(), TERMS_VERSION_PAYMENTS);
  assert.equal(privacyVersion(), PRIVACY_VERSION_PAYMENTS);
  const terms = JSON.stringify(termsSections());
  assert.ok(!terms.includes("no tiene un sistema de pago"));
  assert.ok(!terms.includes("no cobra ni administra el pago del flete"));
  assert.ok(terms.includes("politica-de-pagos") && terms.includes("Mercado Pago"));
  const privacy = JSON.stringify(policySections());
  assert.ok(!privacy.includes("hoy la plataforma no tiene un sistema de pago"));
  assert.ok(privacy.includes("Mercado Pago"));
  assert.ok(!/bassam/i.test(terms + privacy));
  process.env.PAYMENTS_FEATURE_ENABLED = "false";
  assert.equal(termsVersion(), TERMS_VERSION, "con el flag apagado (producción) no cambia");
  assert.ok(JSON.stringify(termsSections()).includes("no tiene un sistema de pago"));
  enable();
});
