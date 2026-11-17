import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../src/app/api/admin/bassam360/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { rutDv } from "../src/lib/format";

const ctx = { params: Promise.resolve({}) };

function pedir(cookie?: string) {
  const headers = new Headers({ host: "127.0.0.1:4317" });
  if (cookie) headers.set("cookie", `${COOKIE_NAME}=${cookie}`);
  return new Request("http://127.0.0.1:4317/api/admin/bassam360", { headers });
}

test("bassam360: admin 200, usuario autenticado 403 y anónimo redirección", async () => {
  const admin = upsertAdmin({
    email: "cierre-admin@bassam360.test",
    password: "Clave-De-Prueba-Admin-1",
    razonSocial: "Admin cierre",
    rut: `76444555-${rutDv("76444555")}`,
    contactName: "Admin",
    whatsapp: "+56 9 44445555",
    city: "Santiago",
  });
  const cliente = registerUser({
    role: "mandante",
    razonSocial: "Cliente cierre",
    rut: `16777888-${rutDv("16777888")}`,
    contactName: "Cliente",
    email: "cierre-cliente@bassam360.test",
    password: "Clave-De-Prueba-Cliente-1",
    whatsapp: "+56 9 77778888",
    city: "Santiago",
  }).user;

  const anon = await GET(pedir(), ctx);
  assert.equal(anon.status, 303);
  assert.match(anon.headers.get("location") || "", /\/ingreso\?next=\/admin\/bassam360$/);

  const ajeno = await GET(pedir(createSession(cliente.id)), ctx);
  assert.equal(ajeno.status, 403);

  const propio = await GET(pedir(createSession(admin.id, { mfa: true })), ctx);
  assert.equal(propio.status, 200);
  const body = (await propio.json()) as { indicadores: Record<string, string> };
  for (const key of ["viajes", "camiones", "clientes", "docs"]) {
    const value = body.indicadores[key];
    assert.equal(value === "--" || /^\d+$/.test(value), true, key);
  }
  assert.equal(JSON.stringify(body).includes("conectado"), false);

  const sinFactor = await GET(pedir(createSession(admin.id)), ctx);
  assert.equal(sinFactor.status, 303);

  const csv = await GET(pedirCsv(createSession(admin.id, { mfa: true })), ctx);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type") || "", /text\/csv/);
  const tabla = await csv.text();
  assert.match(tabla, /^indicador,valor/);
  assert.match(tabla, /"WhatsApp","--"/);
  assert.equal(tabla.includes(admin.email), false);
  assert.equal(tabla.includes("conectado"), false);
  assert.equal(tabla.includes("WA_ACCESS_TOKEN"), false);

  const csvAjeno = await GET(pedirCsv(createSession(cliente.id)), ctx);
  assert.equal(csvAjeno.status, 403);

  const sesion = createSession(admin.id, { mfa: true });
  const aprobacion = await POST(pedirConsulta(sesion, "aprueba el documento"), ctx);
  assert.equal(aprobacion.status, 200);
  const textoAprobacion = ((await aprobacion.json()) as { texto: string }).texto;
  assert.match(textoAprobacion, /No apruebo solo/);
  assert.equal(textoAprobacion.includes(admin.email), false);

  const ciega = await POST(pedirConsulta(sesion, "aprueba el documento", false), ctx);
  assert.equal(ciega.status, 403);

  const sql = await POST(pedirConsulta(sesion, "SELECT email FROM users"), ctx);
  assert.equal(sql.status, 200);
  const textoSql = ((await sql.json()) as { texto: string }).texto;
  assert.match(textoSql, /No ejecuto SQL/);
  assert.equal(textoSql.includes("SELECT"), false);
  assert.equal(textoSql.includes(admin.email), false);
});

function pedirCsv(cookie?: string) {
  const headers = new Headers({ host: "127.0.0.1:4317" });
  if (cookie) headers.set("cookie", `${COOKIE_NAME}=${cookie}`);
  return new Request("http://127.0.0.1:4317/api/admin/bassam360?formato=csv", { headers });
}

function pedirConsulta(cookie: string, consulta: string, mismoOrigen = true) {
  // Como el navegador: las mutaciones con cookie de sesión exigen Origin o Sec-Fetch-Site (CSRF ciego).
  const headers = new Headers({ host: "127.0.0.1:4317", "content-type": "application/json" });
  if (mismoOrigen) headers.set("sec-fetch-site", "same-origin");
  headers.set("cookie", `${COOKIE_NAME}=${cookie}`);
  return new Request("http://127.0.0.1:4317/api/admin/bassam360", { method: "POST", headers, body: JSON.stringify({ consulta }) });
}
