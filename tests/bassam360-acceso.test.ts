import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/api/admin/bassam360/route";
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
});
