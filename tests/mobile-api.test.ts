import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
import { approveCarrier, setRequirement } from "../src/lib/accreditation";
import { markContactVerified } from "../src/lib/carrier";
import { getDb } from "../src/lib/db";
import { listDocuments, setDocumentVerification } from "../src/lib/documents";
import { rutDv, todayChile } from "../src/lib/format";
import * as api from "../src/lib/mobile";
import { resetRateLimits } from "../src/lib/rate-limit";
import { bearerToken, sessionTokenFrom, userFromHeaders } from "../src/lib/request-auth";

const BASE = "http://127.0.0.1:4317";
let seq = 20_000_000;

function rut(): string {
  seq += 1;
  return `${seq}-${rutDv(String(seq))}`;
}

function req(method: string, url: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${BASE}${url}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function signup(kind: string, email: string) {
  const response = await api.register(
    req("POST", "/api/auth/register", {
      body: {
        kind,
        razonSocial: `Empresa ${email}`,
        rut: rut(),
        contactName: "Contacto Prueba",
        email,
        password: "clave-segura-123",
        whatsapp: "+56 9 1234 5678",
        city: "Santiago",
        acceptPrivacy: true,
        acceptTerms: true,
      },
      headers: { "x-real-ip": `10.0.0.${seq % 250}` },
    }),
  );
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as {
    token: string;
    expiresAt: string;
    profile: { id: string; kind: string; role: string };
    gate: { state: string; locked: boolean; checklist: { docs: { type: string }[] } | null };
  };
}

function inDays(days: number): string {
  const date = new Date(`${todayChile()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("Bearer: extrae el token y lo prefiere sobre la cookie", () => {
  const headers = new Headers({ authorization: "Bearer abcdefghijklmnopqrstuvwxyz012345", cookie: "c360_session=otro" });
  assert.equal(bearerToken(headers), "abcdefghijklmnopqrstuvwxyz012345");
  assert.equal(sessionTokenFrom(headers).source, "bearer");
  assert.equal(sessionTokenFrom(new Headers({ cookie: "c360_session=abc" })).token, "abc");
  // Encabezado Authorization inválido: no cae a la cookie.
  assert.equal(sessionTokenFrom(new Headers({ authorization: "Basic xxx", cookie: "c360_session=abc" })).token, null);
});

test("registro, ingreso, /api/me, expiración y cierre de sesión con token", async () => {
  resetRateLimits();
  const reg = await signup("generador", "mandante-movil@test.cl");
  assert.equal(reg.profile.kind, "generador");
  assert.equal(reg.profile.role, "mandante");
  assert.equal(reg.gate.state, "aprobado");
  const ttl = Date.parse(reg.expiresAt) - Date.now();
  assert.ok(ttl > 13 * 86_400_000 && ttl <= 14 * 86_400_000 + 1000);

  const login = await api.login(req("POST", "/api/auth/login", { body: { email: "MANDANTE-movil@test.cl", password: "clave-segura-123" } }));
  assert.equal(login.status, 200);
  const session = (await login.json()) as { token: string };
  assert.notEqual(session.token, reg.token);

  const me = await api.me(req("GET", "/api/me", { token: session.token }));
  assert.equal(me.status, 200);
  const profile = (await me.json()) as { email: string; kind: string; gate: { canPublishLoads: boolean; accredited: boolean; privacyRequired: boolean } };
  assert.equal(profile.email, "mandante-movil@test.cl");
  // Cuenta nueva: aún no está 100% acreditada, no publica.
  assert.equal(profile.gate.accredited, false);
  assert.equal(profile.gate.privacyRequired, false);
  assert.equal(profile.gate.canPublishLoads, false);

  assert.equal((await api.me(req("GET", "/api/me"))).status, 401);
  assert.equal((await api.me(req("GET", "/api/me", { token: "x".repeat(43) }))).status, 401);

  const bad = await api.login(req("POST", "/api/auth/login", { body: { email: "mandante-movil@test.cl", password: "mala-clave-000" } }));
  assert.equal(bad.status, 401);
  assert.match(((await bad.json()) as { error: string }).error, /incorrectos/);

  // Token vencido: deja de servir.
  getDb().prepare(`UPDATE sessions SET expires_at = ? WHERE token_hash = (SELECT token_hash FROM sessions ORDER BY created_at LIMIT 1)`).run("2000-01-01T00:00:00.000Z");
  assert.equal(userFromHeaders(new Headers({ authorization: `Bearer ${reg.token}` })), null);

  const out = await api.logout(req("POST", "/api/auth/logout", { token: session.token, body: {} }));
  assert.equal(out.status, 200);
  assert.equal((await api.me(req("GET", "/api/me", { token: session.token }))).status, 401);
});

test("validaciones del registro", async () => {
  resetRateLimits();
  const ambos = await api.register(req("POST", "/api/auth/register", { body: { kind: "ambos", email: "a@test.cl" } }));
  assert.equal(ambos.status, 400);
  await signup("transportista", "dup@test.cl");
  const dup = await api.register(
    req("POST", "/api/auth/register", {
      body: { kind: "transportista", razonSocial: "Otra", rut: rut(), contactName: "Otro", email: "dup@test.cl", password: "clave-segura-123", whatsapp: "+56912345678", city: "Santiago", acceptPrivacy: true, acceptTerms: true },
    }),
  );
  assert.equal(dup.status, 409);
  const json = await api.login(new Request(`${BASE}/api/auth/login`, { method: "POST", body: "{no json" }));
  assert.equal(json.status, 400);
});

test("límite de intentos de ingreso por IP", async () => {
  resetRateLimits();
  const statuses: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const response = await api.login(
      req("POST", "/api/auth/login", { body: { email: "nadie@test.cl", password: "x".repeat(10) }, headers: { "x-real-ip": "203.0.113.9" } }),
    );
    statuses.push(response.status);
  }
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[10], 429);
  const other = await api.login(req("POST", "/api/auth/login", { body: { email: "nadie@test.cl", password: "x" }, headers: { "x-real-ip": "203.0.113.10" } }));
  assert.equal(other.status, 401);
  resetRateLimits();
});

test("bloqueo de transportistas aplicado con token, contacto oculto para anónimos y aprobación", async () => {
  resetRateLimits();
  const owner = await signup("generador", "dueno-carga@test.cl");
  const loadBody = {
    origin: "Santiago",
    destination: "Punta Arenas",
    pickupDate: inDays(3),
    equipment: "rampla_plana",
    description: "Pallets de materiales de construcción",
    weight: "20",
    specs: {},
    budget: 1500000,
  };
  // Sin correo confirmado no se puede publicar.
  const unverified = await api.createLoadMobile(req("POST", "/api/loads", { token: owner.token, body: loadBody }));
  assert.equal(unverified.status, 403);
  assert.equal(((await unverified.json()) as { code: string }).code, "correo_sin_verificar");
  getDb().prepare(`UPDATE users SET email_verified_at = ? WHERE email = ?`).run(new Date().toISOString(), "dueno-carga@test.cl");
  // Correo confirmado pero sin acreditación 100%: tampoco publica.
  const notAccredited = await api.createLoadMobile(req("POST", "/api/loads", { token: owner.token, body: loadBody }));
  assert.equal(notAccredited.status, 403);
  assert.equal(((await notAccredited.json()) as { code: string }).code, "sin_acreditacion");
  for (const key of ["calidad", "seguridad", "medioambiente"]) setRequirement(owner.profile.id, key, "cumple");
  approveCarrier("admin", owner.profile.id);
  const created = await api.createLoadMobile(
    req("POST", "/api/loads", {
      token: owner.token,
      body: {
        origin: "Santiago",
        destination: "Punta Arenas",
        pickupDate: inDays(3),
        equipment: "rampla_plana",
        description: "Pallets de materiales de construcción",
        weight: "20",
        specs: {},
        budget: 1500000,
      },
    }),
  );
  assert.equal(created.status, 201, await created.clone().text());
  const loadCreated = (await created.json()) as { id: string; weightT: number; budgetClp: number; whatsapp: string };
  assert.equal(loadCreated.weightT, 20);
  assert.equal(loadCreated.budgetClp, 1500000);

  // Anónimo: ve la lista pero sin contacto.
  const anon = (await (await api.loads(req("GET", "/api/loads"))).json()) as { id: string; whatsapp: string; contactHidden: boolean }[];
  const anonItem = anon.find((item) => item.id === loadCreated.id);
  assert.ok(anonItem);
  assert.equal(anonItem.whatsapp, "");
  assert.equal(anonItem.contactHidden, true);

  // Transportista pendiente: 403 en la bolsa y al publicar.
  const carrier = await signup("transportista", "chofer-movil@test.cl");
  assert.equal(carrier.gate.state, "pendiente");
  assert.equal(carrier.gate.locked, true);
  assert.deepEqual(carrier.gate.checklist?.docs.map((doc) => doc.type), ["cedula", "licencia", "padron", "revision", "soap", "permiso"]);
  for (const call of [
    api.loads(req("GET", "/api/loads", { token: carrier.token })),
    api.trucks(req("GET", "/api/trucks", { token: carrier.token })),
    api.load(req("GET", `/api/loads/${loadCreated.id}`, { token: carrier.token }), loadCreated.id),
    api.createTruckMobile(req("POST", "/api/trucks", { token: carrier.token, body: {} })),
  ]) {
    const response = await call;
    assert.equal(response.status, 403);
    assert.match(((await response.json()) as { error: string }).error, /revisión/);
  }

  // Puede subir documentos aunque esté pendiente (JSON base64 y multipart).
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");
  const personal = await api.uploadDocument(
    req("POST", "/api/documents", { token: carrier.token, body: { type: "cedula", expiry: "2099-01-01", contentType: "image/png", fileName: "cedula.png", dataBase64: png } }),
  );
  assert.equal(personal.status, 201, await personal.clone().text());
  const personalDoc = (await personal.json()) as { id: string; holderName: string; verificationStatus: string };
  assert.equal(personalDoc.holderName, "Contacto Prueba");
  assert.equal(personalDoc.verificationStatus, "pendiente");

  const form = new FormData();
  form.set("type", "padron");
  form.set("expiry", "2099-01-01");
  form.set("holderName", "ABCD12");
  form.set("file", new File([Buffer.from("%PDF-1.4 prueba")], "padron.pdf", { type: "application/pdf" }));
  const multipart = await api.uploadDocument(
    new Request(`${BASE}/api/documents`, { method: "POST", headers: { authorization: `Bearer ${carrier.token}` }, body: form }),
  );
  assert.equal(multipart.status, 201, await multipart.clone().text());

  const noFile = await api.uploadDocument(req("POST", "/api/documents", { token: carrier.token, body: { type: "soap", expiry: "2099-01-01" } }));
  assert.equal(noFile.status, 400);
  const badType = await api.uploadDocument(
    req("POST", "/api/documents", { token: carrier.token, body: { type: "cedula", expiry: "2099-01-01", contentType: "text/plain", dataBase64: png } }),
  );
  assert.equal(badType.status, 400);

  const list = (await (await api.documents(req("GET", "/api/documents", { token: carrier.token }))).json()) as { id: string }[];
  assert.equal(list.length, 2);
  const file = await api.documentFile(req("GET", `/api/documents/${personalDoc.id}`, { token: carrier.token }), personalDoc.id);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");
  // Otro usuario no puede descargarlo ni borrarlo.
  assert.equal((await api.documentFile(req("GET", "/x", { token: owner.token }), personalDoc.id)).status, 403);
  assert.equal((await api.deleteDocument(req("DELETE", "/x", { token: owner.token }), personalDoc.id)).status, 403);

  // Completar acreditación y aprobar: ve la bolsa, pero el contacto sigue oculto hasta adjudicar.
  markContactVerified(carrier.profile.id, "email", true);
  markContactVerified(carrier.profile.id, "phone", true);
  for (const type of ["licencia", "revision", "soap", "permiso"]) {
    const extra = type === "licencia" ? { detail: "A5" } : { holderName: "ABCD12" };
    const response = await api.uploadDocument(
      req("POST", "/api/documents", { token: carrier.token, body: { type, expiry: "2099-01-01", contentType: "image/png", dataBase64: png, ...extra } }),
    );
    assert.equal(response.status, 201, await response.clone().text());
  }
  for (const doc of listDocuments(carrier.profile.id)) setDocumentVerification(doc.id, "verificado", null);
  for (const key of ["calidad", "seguridad", "medioambiente"]) setRequirement(carrier.profile.id, key, "cumple");
  approveCarrier("admin", carrier.profile.id);

  const meAfter = (await (await api.me(req("GET", "/api/me", { token: carrier.token }))).json()) as { gate: { state: string; canPublishTrucks: boolean } };
  assert.equal(meAfter.gate.state, "aprobado");
  assert.equal(meAfter.gate.canPublishTrucks, true);
  const seen = (await (await api.loads(req("GET", "/api/loads?origin=Santiago", { token: carrier.token }))).json()) as { id: string; whatsapp: string }[];
  const seenItem = seen.find((item) => item.id === loadCreated.id) as { whatsapp: string; contactHidden?: boolean; ownerName?: string } | undefined;
  assert.ok(seenItem);
  assert.equal(seenItem.whatsapp, "");
  assert.equal(seenItem.contactHidden, true);
  assert.equal(seenItem.ownerName, "");
  // El dueño ve su propia publicación completa.
  const ownView = (await (await api.load(req("GET", `/api/loads/${loadCreated.id}`, { token: owner.token }), loadCreated.id)).json()) as { whatsapp: string };
  assert.equal(ownView.whatsapp, "56912345678");

  const truckRes = await api.createTruckMobile(
    req("POST", "/api/trucks", {
      token: carrier.token,
      body: { origin: "Concepción", destination: "Santiago", availableFrom: inDays(1), availableTo: inDays(5), equipment: "rampla_plana", tonnage: 28, specs: {} },
    }),
  );
  assert.equal(truckRes.status, 201, await truckRes.clone().text());
  const truckId = ((await truckRes.json()) as { id: string }).id;
  assert.equal((await api.truck(req("GET", `/api/trucks/${truckId}`), truckId)).status, 200);
  // Un transportista no publica cargas; solo el dueño borra.
  assert.equal((await api.createLoadMobile(req("POST", "/api/loads", { token: carrier.token, body: {} }))).status, 403);
  assert.equal((await api.deleteLoadMobile(req("DELETE", "/x", { token: carrier.token }), loadCreated.id)).status, 403);
  assert.equal((await api.deleteLoadMobile(req("DELETE", "/x", { token: owner.token }), loadCreated.id)).status, 204);
  assert.equal((await api.load(req("GET", "/x"), loadCreated.id)).status, 404);

  // Eliminar cuenta: borra la cuenta, sus sesiones y documentos.
  assert.equal((await api.deleteMe(req("DELETE", "/api/me", { token: carrier.token }))).status, 204);
  assert.equal((await api.me(req("GET", "/api/me", { token: carrier.token }))).status, 401);
  assert.equal(listDocuments(carrier.profile.id).length, 0);
  const left = getDb().prepare(`SELECT COUNT(*) AS n FROM trucks WHERE owner_id = ?`).get(carrier.profile.id) as { n: number };
  assert.equal(left.n, 0);
});

test("salud, catálogo e importación no soportada", async () => {
  const previousSha = process.env.GIT_SHA;
  delete process.env.GIT_SHA;
  try {
    const off = (await (await api.health(req("GET", "/api/health"))).json()) as Record<string, unknown>;
    assert.deepEqual(off, { ok: true, database: true, documents: "private", auth: "bearer", commit: "unknown" });
    assert.deepEqual(Object.keys(off).sort(), ["auth", "commit", "database", "documents", "ok"]);
    process.env.GIT_SHA = "ABCDEF1234567890abcd";
    assert.equal(((await (await api.health(req("GET", "/api/health"))).json()) as { commit: string }).commit, "abcdef1");
    process.env.GIT_SHA = "  abcdef0  ";
    assert.equal(((await (await api.health(req("GET", "/api/health"))).json()) as { commit: string }).commit, "abcdef0");
    process.env.GIT_SHA = "no-es-sha";
    assert.equal(((await (await api.health(req("GET", "/api/health"))).json()) as { commit: string }).commit, "unknown");
    process.env.GIT_SHA = "abc123";
    assert.equal(((await (await api.health(req("GET", "/api/health"))).json()) as { commit: string }).commit, "unknown");
  } finally {
    if (previousSha === undefined) delete process.env.GIT_SHA;
    else process.env.GIT_SHA = previousSha;
  }
  const catalog = (await (await api.catalog(req("GET", "/api/catalog"))).json()) as {
    company: { name: string; rut: string; privacyUrl: string };
    regions: unknown[];
    requiredCarrierDocs: string[];
  };
  assert.equal(catalog.company.name, "CARGA360GO SpA");
  assert.equal(catalog.company.rut, "78.553.352-6");
  assert.equal(catalog.company.privacyUrl, "https://www.carga360go.cl/privacidad");
  assert.equal(catalog.regions.length, 16);
  assert.equal(catalog.requiredCarrierDocs.length, 6);
  assert.equal((await api.notSupported(req("POST", "/api/import", { body: {} }))).status, 501);
});

test("origen: escrituras móviles usan assertSameOrigin; Bearer sin cookie sigue", async () => {
  resetRateLimits();
  const sessionCookie = "c360_session=token-de-sesion-ciego-0001";
  const blind = (method: string, url: string) =>
    new Request(`${BASE}${url}`, {
      method,
      headers: { cookie: sessionCookie, host: "127.0.0.1:4317", "content-type": "application/json" },
      body: method === "GET" || method === "DELETE" ? undefined : "{}",
    });

  const writes = [
    api.register(blind("POST", "/api/auth/register")),
    api.login(blind("POST", "/api/auth/login")),
    api.logout(blind("POST", "/api/auth/logout")),
    api.createLoadMobile(blind("POST", "/api/loads")),
    api.deleteLoadMobile(blind("DELETE", "/api/loads/x"), "x"),
    api.createTruckMobile(blind("POST", "/api/trucks")),
    api.deleteTruckMobile(blind("DELETE", "/api/trucks/x"), "x"),
    api.uploadDocument(blind("POST", "/api/documents")),
    api.deleteDocument(blind("DELETE", "/api/documents/x"), "x"),
    api.deleteMe(blind("DELETE", "/api/me")),
    api.notSupported(blind("POST", "/api/import")),
  ];
  for (const pending of writes) {
    const response = await pending;
    assert.equal(response.status, 403, await response.clone().text());
    assert.match(((await response.json()) as { error: string }).error, /Origen/);
  }

  // GET no es escritura: cookie sin señales de origen sigue permitido.
  assert.equal((await api.loads(blind("GET", "/api/loads"))).status, 200);
  assert.equal((await api.me(blind("GET", "/api/me"))).status, 401);

  const cross = new Request(`${BASE}/api/loads`, {
    method: "POST",
    headers: { cookie: sessionCookie, "sec-fetch-site": "cross-site", host: "127.0.0.1:4317", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal((await api.createLoadMobile(cross)).status, 403);

  // App nativa: login sin Bearer, sin cookie y sin Origin no es CSRF.
  const nativeLogin = await api.login(
    req("POST", "/api/auth/login", { body: { email: "nadie-origen@test.cl", password: "clave-segura-123" }, headers: { "x-real-ip": "10.8.8.8" } }),
  );
  assert.equal(nativeLogin.status, 401);

  const owner = await signup("generador", "origen-app@test.cl");
  // Bearer + cookie no se exime.
  const both = new Request(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${owner.token}`,
      cookie: sessionCookie,
      host: "127.0.0.1:4317",
      "content-type": "application/json",
    },
    body: "{}",
  });
  const bothRes = await api.logout(both);
  assert.equal(bothRes.status, 403, await bothRes.clone().text());
  assert.match(((await bothRes.json()) as { error: string }).error, /Origen/);

  // Bearer + cookie con mismo origen: pasa el control y opera la sesión Bearer.
  const same = new Request(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${owner.token}`,
      cookie: sessionCookie,
      "sec-fetch-site": "same-origin",
      origin: "http://127.0.0.1:4317",
      host: "127.0.0.1:4317",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal((await api.logout(same)).status, 200);

  const again = await signup("generador", "origen-expo@test.cl");
  // Expo web: Bearer, otro origen, sin cookie. No debe romperse.
  const expo = new Request(`${BASE}/api/me`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${again.token}`,
      origin: "https://expo.dev",
      "sec-fetch-site": "cross-site",
      host: "www.carga360go.cl",
    },
  });
  assert.equal((await api.deleteMe(expo)).status, 204);
});
