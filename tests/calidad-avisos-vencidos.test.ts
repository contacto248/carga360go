import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { getDb } from "../src/lib/db";
import { todayChile } from "../src/lib/format";
import { isLoadListedPublicly, listLoads, listOwn, createLoad, getLoad } from "../src/lib/listings";
import { loadForViewer } from "../src/lib/access";
import { loads as listLoadsMobile } from "../src/lib/mobile";
import { activeListings, recentListings } from "../src/lib/stats";
import { addDays, person } from "./helpers-agente";

const BASE = "http://127.0.0.1:4317";

function req(url: string) {
  return new Request(url, { method: "GET", headers: { "content-type": "application/json" } });
}

test("T-009: un aviso con el plazo de ofertas vencido no aparece como disponible en los listados públicos", async () => {
  const owner = person("mandante", "t009-plazo");
  const load = createLoad(owner.user, {
    origin: "Vallenar",
    destination: "Temuco",
    pickupDate: addDays(4),
    equipment: "rampla_plana",
    description: "Aviso de prueba con plazo de ofertas vencido",
    weightT: 10,
    specs: {},
  });
  assert.equal(listLoads({}).some((item) => item.id === load.id), true);

  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  getDb().prepare(`UPDATE loads SET offers_until = ? WHERE id = ?`).run(past, load.id);
  const expired = getLoad(load.id)!;
  assert.equal(expired.status, "abierta");
  assert.equal(isLoadListedPublicly(expired), false);
  assert.equal(listLoads({}).some((item) => item.id === load.id), false);
  assert.equal(activeListings().loads.some((item) => item.id === load.id), false);
  assert.equal(recentListings(20).some((item) => item.id === load.id), false);
  assert.equal(listOwn(owner.user.id).loads.some((item) => item.id === load.id), true, "el dueño sigue viendo su aviso");

  const visible = loadForViewer(load.id, null);
  assert.equal(visible?.visibility, "public", "el detalle por enlace sigue existiendo, sin presentarse en el listado");
  assert.ok(visible?.load);

  const mobile = await listLoadsMobile(req(`${BASE}/api/loads`));
  assert.equal(mobile.status, 200);
  const body = (await mobile.json()) as { id: string }[];
  assert.equal(body.some((item) => item.id === load.id), false);
});

test("T-009: un aviso con fecha de retiro ya pasada no aparece en el listado público ni en la portada", () => {
  const owner = person("mandante", "t009-retiro");
  const load = createLoad(owner.user, {
    origin: "Copiapó",
    destination: "La Serena",
    pickupDate: addDays(3),
    equipment: "sider",
    description: "Aviso de prueba con retiro vencido",
    weightT: 16,
    specs: { pallets: 20 },
  });
  const yesterday = (() => {
    const [y, m, d] = todayChile().split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  })();
  getDb().prepare(`UPDATE loads SET pickup_date = ? WHERE id = ?`).run(yesterday, load.id);
  const expired = getLoad(load.id)!;
  assert.equal(expired.status, "abierta");
  assert.equal(expired.pickupDate < todayChile(), true);
  assert.equal(isLoadListedPublicly(expired), false);
  assert.equal(listLoads({}).some((item) => item.id === load.id), false);
  assert.equal(activeListings().loads.some((item) => item.id === load.id), false);
});

test("T-009: un aviso abierto, con plazo vigente y retiro futuro sigue en el listado", () => {
  const owner = person("mandante", "t009-vigente");
  const load = createLoad(owner.user, {
    origin: "Antofagasta",
    destination: "Santiago",
    pickupDate: addDays(8),
    equipment: "rampla_plana",
    description: "Aviso vigente de control",
    weightT: 18,
    specs: {},
  });
  const listed = getLoad(load.id)!;
  assert.equal(isLoadListedPublicly(listed), true);
  assert.equal(listLoads({}).some((item) => item.id === load.id), true);
  assert.equal(activeListings().loads.some((item) => item.id === load.id), true);
});
