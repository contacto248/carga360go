import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { GET as getCarga } from "../src/app/api/cargas/[id]/route";
import { GET as getViaje } from "../src/app/api/cargas/[id]/viaje/route";
import { loadForViewer, loadVisibility } from "../src/lib/access";
import { createLoad } from "../src/lib/listings";
import { load as getLoadMobile } from "../src/lib/mobile";
import { acceptOffer, submitOffer } from "../src/lib/offers";
import { advanceTrip, tripView } from "../src/lib/viaje";
import { addDays, makeAdmin, person } from "./helpers-agente";

const BASE = "http://127.0.0.1:4317";
const SECRET = "nota interna: llamar a María al +56 9 1111 2222";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function getReq(url: string, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(url, { method: "GET", headers });
}

async function awardFixture() {
  const owner = person("mandante", "det-dueno");
  const carrier = person("transportista", "det-chofer");
  const other = person("transportista", "det-ajeno");
  const otherOwner = person("mandante", "det-otra");
  const adminP = makeAdmin(person("mandante", "det-admin").user);
  const load = createLoad(owner.user, {
    origin: "Copiapó",
    destination: "Osorno",
    pickupDate: addDays(5),
    equipment: "rampla_plana",
    description: "Bobinas de acero de prueba",
    weightT: 18,
    specs: { largo: "12" },
    notes: SECRET,
  });
  return { owner, carrier, other, otherOwner, adminP, load };
}

test("carga abierta: el listado público (sin contactos ni notas) es visible sin sesión", async () => {
  const { owner, load } = await awardFixture();
  const visible = loadForViewer(load.id, null);
  assert.equal(visible?.visibility, "public");
  assert.equal(visible?.load.origin, "Copiapó");
  assert.equal(visible?.load.whatsapp, "");
  assert.equal(visible?.load.ownerName, "");
  assert.equal(visible?.load.notes, null);
  assert.equal(visible?.load.contactHidden, true);
  assert.equal(JSON.stringify(visible?.load).includes(SECRET), false);

  const own = loadForViewer(load.id, owner.user);
  assert.equal(own?.visibility, "party");
  assert.equal(own?.load.notes, SECRET);

  const response = await getCarga(getReq(`${BASE}/api/cargas/${load.id}`), ctx(load.id));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { load: { origin: string; whatsapp: string; notes: string | null } };
  assert.equal(body.load.origin, "Copiapó");
  assert.equal(body.load.whatsapp, "");
  assert.equal(body.load.notes, null);

  const mobile = await getLoadMobile(getReq(`${BASE}/api/loads/${load.id}`), load.id);
  assert.equal(mobile.status, 200);
  const mobileBody = (await mobile.json()) as { origin: string; whatsapp: string; notes?: string };
  assert.equal(mobileBody.origin, "Copiapó");
  assert.equal(mobileBody.whatsapp, "");
  assert.equal(mobileBody.notes, undefined);
});

test("carga adjudicada: detalle y viaje solo para dueña, transportista adjudicado o administrador", async () => {
  const { owner, carrier, other, otherOwner, adminP, load } = await awardFixture();
  const offer = await submitOffer(carrier.user, load.id, { priceClp: 950000, pickupDate: addDays(5) }, { notify: false });
  await acceptOffer(owner.user, offer.offer.id, { notify: false });
  advanceTrip(carrier.user, load.id, "en_camino", "Salió del patio");

  assert.equal(loadVisibility(createLoad(owner.user, {
    origin: "Arica",
    destination: "Iquique",
    pickupDate: addDays(8),
    equipment: "sider",
    description: "Otra",
    weightT: 4,
    specs: {},
  }), null), "public"); // sanity: una abierta sigue pública

  assert.equal(loadForViewer(load.id, null), null);
  assert.equal(loadForViewer(load.id, other.user), null);
  assert.equal(loadForViewer(load.id, otherOwner.user), null);
  assert.equal(tripView(load.id, null), null);
  assert.equal(tripView(load.id, other.user), null);

  const missing = "no-existe-00000000-0000-4000-8000-000000000000";
  const denied = [undefined, other.token, otherOwner.token, "token-invalido-0123456789abcdef"];
  for (const token of denied) {
    const web = await getCarga(getReq(`${BASE}/api/cargas/${load.id}`, token), ctx(load.id));
    assert.equal(web.status, 404, `web token=${token}`);
    const webBody = (await web.json()) as { error?: string; load?: unknown };
    assert.match(String(webBody.error), /no encontrada/);
    assert.equal("load" in webBody, false);
    assert.equal(JSON.stringify(webBody).includes("Copiapó"), false);
    assert.equal(JSON.stringify(webBody).includes(SECRET), false);
    assert.equal(JSON.stringify(webBody).includes("Salió del patio"), false);

    const mobile = await getLoadMobile(getReq(`${BASE}/api/loads/${load.id}`, token), load.id);
    assert.equal(mobile.status, 404, `mobile token=${token}`);
    const mobileBody = (await mobile.json()) as { error?: string };
    assert.match(String(mobileBody.error), /no encontrada/);
    assert.equal(JSON.stringify(mobileBody).includes("Copiapó"), false);

    const viaje = await getViaje(getReq(`${BASE}/api/cargas/${load.id}/viaje`, token), ctx(load.id));
    assert.equal(viaje.status, 200);
    const viajeBody = (await viaje.json()) as { viaje: unknown };
    assert.equal(viajeBody.viaje, null);
  }

  const gone = await getCarga(getReq(`${BASE}/api/cargas/${missing}`, owner.token), ctx(missing));
  assert.equal(gone.status, 404);
  assert.deepEqual(await gone.json(), { error: "Carga no encontrada." });

  for (const allowed of [owner, carrier, adminP]) {
    const visible = loadForViewer(load.id, allowed.user);
    assert.equal(visible?.visibility, "party", allowed.user.role);
    assert.equal(visible?.load.origin, "Copiapó");
    if (allowed.user.id === owner.user.id) assert.equal(visible?.load.notes, SECRET);
    else if (allowed.user.role !== "admin") assert.equal(visible?.load.notes, null);

    const web = await getCarga(getReq(`${BASE}/api/cargas/${load.id}`, allowed.token), ctx(load.id));
    assert.equal(web.status, 200, `web ${allowed.user.role}`);
    const webBody = (await web.json()) as { load: { id: string; origin: string } };
    assert.equal(webBody.load.id, load.id);
    assert.equal(webBody.load.origin, "Copiapó");

    const mobile = await getLoadMobile(getReq(`${BASE}/api/loads/${load.id}`, allowed.token), load.id);
    assert.equal(mobile.status, 200, `mobile ${allowed.user.role}`);
    const mobileBody = (await mobile.json()) as { id: string; origin: string };
    assert.equal(mobileBody.id, load.id);

    const viaje = await getViaje(getReq(`${BASE}/api/cargas/${load.id}/viaje`, allowed.token), ctx(load.id));
    assert.equal(viaje.status, 200);
    const viajeBody = (await viaje.json()) as { viaje: { events: { note: string | null }[] } };
    assert.ok(viajeBody.viaje);
    assert.ok(viajeBody.viaje.events.some((event) => event.note === "Salió del patio"));
  }
});
