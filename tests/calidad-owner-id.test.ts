import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { GET as getCarga } from "../src/app/api/cargas/[id]/route";
import { load as getLoadMobile, loads as listLoadsMobile, truck as getTruckMobile, trucks as listTrucksMobile } from "../src/lib/mobile";
import { loadForViewer, redactLoad, redactTruck } from "../src/lib/access";
import { createLoad, createTruck, getLoad, getTruck, listLoads, listTrucks } from "../src/lib/listings";
import { addDays, makeAdmin, person } from "./helpers-agente";

const BASE = "http://127.0.0.1:4317";
const INTERNAL_ID_KEY = /^(ownerId|userId|carrierId|owner_id|user_id|carrier_id)$/;

function walkKeys(value: unknown, pathName = "$"): string[] {
  const hits: string[] = [];
  if (value == null || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...walkKeys(item, `${pathName}[${i}]`)));
    return hits;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (INTERNAL_ID_KEY.test(key) && child) hits.push(`${pathName}.${key}`);
    hits.push(...walkKeys(child, `${pathName}.${key}`));
  }
  return hits;
}

function req(url: string, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(url, { method: "GET", headers });
}

async function json(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

test("T-007: la API anónima de cargas y camiones no expone ownerId ni otros id internos de usuario", async () => {
  const owner = person("mandante", "t007-dueno");
  const carrier = person("transportista", "t007-chofer");
  const other = person("transportista", "t007-ajeno");
  const adminP = makeAdmin(person("mandante", "t007-admin").user);

  const load = createLoad(owner.user, {
    origin: "Vallenar",
    destination: "Temuco",
    pickupDate: addDays(7),
    equipment: "rampla_plana",
    description: "Pallets de prueba para recorte de ownerId",
    weightT: 12,
    specs: { largo: "12" },
  });
  const truck = createTruck(carrier.user, {
    origin: "Vallenar",
    destination: "Temuco",
    availableFrom: addDays(6),
    availableTo: addDays(10),
    equipment: "rampla_plana",
    tonnage: 24,
    specs: {},
  });

  const publicLoad = redactLoad(getLoad(load.id)!, null);
  const publicTruck = redactTruck(getTruck(truck.id)!, null);
  assert.equal("ownerId" in publicLoad, false);
  assert.equal("ownerId" in publicTruck, false);
  assert.equal(publicLoad.origin, "Vallenar");
  assert.equal(publicLoad.contactHidden, true);
  assert.equal(publicTruck.contactHidden, true);

  const ownLoad = redactLoad(getLoad(load.id)!, owner.user);
  assert.equal(ownLoad.ownerId, owner.user.id);
  const adminLoad = redactLoad(getLoad(load.id)!, adminP.user);
  assert.equal(adminLoad.ownerId, owner.user.id);
  const otherLoad = redactLoad(getLoad(load.id)!, other.user);
  assert.equal("ownerId" in otherLoad, false);

  // /api/cargas y /cargas usan listLoads + redactLoad (getCurrentUser exige un request de Next).
  const listed = listLoads({}).map((item) => redactLoad(item, null)).find((item) => item.id === load.id);
  assert.ok(listed, "la carga abierta debe seguir en el listado público");
  assert.equal("ownerId" in listed, false);
  assert.deepEqual(walkKeys(JSON.parse(JSON.stringify(listed))), []);
  assert.equal(loadForViewer(load.id, null)?.load && "ownerId" in loadForViewer(load.id, null)!.load, false);

  const detalle = (await json(await getCarga(req(`${BASE}/api/cargas/${load.id}`), { params: Promise.resolve({ id: load.id }) }))) as {
    load: Record<string, unknown>;
  };
  assert.equal("ownerId" in detalle.load, false);
  assert.deepEqual(walkKeys(detalle.load), []);

  const listedTruck = listTrucks({}).map((item) => redactTruck(item, null)).find((item) => item.id === truck.id);
  assert.ok(listedTruck);
  assert.equal("ownerId" in listedTruck, false);
  assert.deepEqual(walkKeys(JSON.parse(JSON.stringify(listedTruck))), []);

  const mobileList = (await json(await listLoadsMobile(req(`${BASE}/api/loads`)))) as Record<string, unknown>[];
  const mobileItem = mobileList.find((item) => item.id === load.id);
  assert.ok(mobileItem);
  assert.equal("ownerId" in mobileItem!, false);
  assert.deepEqual(walkKeys(mobileItem), []);

  const mobileDetail = (await json(await getLoadMobile(req(`${BASE}/api/loads/${load.id}`), load.id))) as Record<string, unknown>;
  assert.equal("ownerId" in mobileDetail, false);

  const mobileTrucks = (await json(await listTrucksMobile(req(`${BASE}/api/trucks`)))) as Record<string, unknown>[];
  const mobileTruck = mobileTrucks.find((item) => item.id === truck.id);
  assert.ok(mobileTruck);
  assert.equal("ownerId" in mobileTruck!, false);

  const mobileTruckDetail = (await json(await getTruckMobile(req(`${BASE}/api/trucks/${truck.id}`), truck.id))) as Record<string, unknown>;
  assert.equal("ownerId" in mobileTruckDetail, false);

  const asOwner = (await json(await getLoadMobile(req(`${BASE}/api/loads/${load.id}`, owner.token), load.id))) as Record<string, unknown>;
  assert.equal(asOwner.ownerId, owner.user.id);
  const asAdmin = (await json(await getLoadMobile(req(`${BASE}/api/loads/${load.id}`, adminP.token), load.id))) as Record<string, unknown>;
  assert.equal(asAdmin.ownerId, owner.user.id);
  const asOther = (await json(await getLoadMobile(req(`${BASE}/api/loads/${load.id}`, other.token), load.id))) as Record<string, unknown>;
  assert.equal("ownerId" in asOther, false);
});
