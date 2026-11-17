import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { GET as getEnvio } from "../src/app/api/ops/envios/[id]/route";
import { GET as getVerificar } from "../src/app/api/ops/envios/[id]/verificar/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { todayChile, rutDv } from "../src/lib/format";
import { createLoad } from "../src/lib/listings";
import { appendEvent, ensureShipmentForLoad, verifyChain } from "../src/lib/ops/shipments";
import type { PublicUser } from "../src/lib/types";

let seq = 0;

function nextRut(): string {
  seq += 1;
  const body = String(18_000_000 + seq * 137).padStart(8, "0");
  return `${body}-${rutDv(body)}`;
}

function addDays(days: number): string {
  const [year, month, day] = todayChile().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function person(role: "mandante" | "transportista", tag: string): PublicUser {
  const { user } = registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: nextRut(),
    contactName: `Contacto ${tag}`,
    email: `${tag}-${seq}@ops-envios.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(30000000 + seq).padStart(8, "0")}`,
    city: "La Serena",
  });
  return user;
}

function publish(owner: PublicUser) {
  return createLoad(owner, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(4),
    equipment: "rampla_plana",
    description: "Pallets de prueba OPS",
    weightT: 12,
    specs: {},
  });
}

function row(table: "loads" | "offers" | "trip_events", id: string) {
  return getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function rows(table: "loads" | "offers" | "trip_events", loadId: string) {
  return getDb().prepare(`SELECT * FROM ${table} WHERE load_id = ? OR id = ? ORDER BY id`).all(loadId, loadId);
}

test("ensureShipmentForLoad crea un envío, no toca loads y la cadena detecta un payload alterado", () => {
  const owner = person("mandante", "dueno");
  const carrier = person("transportista", "chofer");
  const load = publish(owner);
  const offerId = randomUUID();
  const eventId = randomUUID();
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, revisions, created_at, updated_at)
     VALUES (?, ?, ?, 900000, ?, 'activa', 0, ?, ?)`,
  ).run(offerId, load.id, carrier.id, addDays(4), stamp, stamp);
  db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, 'en_camino', 'salida', ?)`).run(
    eventId,
    load.id,
    carrier.id,
    stamp,
  );
  db.prepare(`UPDATE loads SET awarded_offer_id = ?, status = 'adjudicada', trip_status = 'en_transito' WHERE id = ?`).run(offerId, load.id);

  const loadsBefore = row("loads", load.id);
  const offersBefore = rows("offers", load.id);
  const tripsBefore = rows("trip_events", load.id);

  const shipment = ensureShipmentForLoad(load.id, owner);
  const again = ensureShipmentForLoad(load.id, owner);
  assert.equal(again.id, shipment.id);
  assert.equal(shipment.stage, "ejecucion");
  assert.equal(shipment.loadId, load.id);
  assert.equal(shipment.assignedOfferId, offerId);
  assert.equal(shipment.plannedPickupAt, addDays(4));
  assert.equal(shipment.shipperOrgId, null);
  assert.equal(verifyChain(shipment.id).ok, true);

  const note = appendEvent({ shipmentId: shipment.id, kind: "nota", payload: { texto: "retiro ok" }, actor: owner });
  assert.equal(note.seq, 2);
  assert.equal(note.prevHash.length, 64);
  assert.notEqual(note.prevHash, note.hash);
  const chain = verifyChain(shipment.id);
  assert.deepEqual(chain, { ok: true, events: 2 });

  assert.deepEqual(row("loads", load.id), loadsBefore);
  assert.deepEqual(rows("offers", load.id), offersBefore);
  assert.deepEqual(rows("trip_events", load.id), tripsBefore);
  const audits = db.prepare(`SELECT action FROM audit_log WHERE target_id = ? ORDER BY action`).all(shipment.id) as { action: string }[];
  assert.deepEqual(
    audits.map((item) => item.action).sort(),
    ["ops.envio_creado", "ops.evento"],
  );

  db.prepare(`UPDATE ops_events SET payload_json = ? WHERE shipment_id = ? AND seq = 2`).run('{"texto":"alterado"}', shipment.id);
  const broken = verifyChain(shipment.id);
  assert.equal(broken.ok, false);
  if (!broken.ok) {
    assert.equal(broken.seq, 2);
    assert.match(broken.reason, /hash/);
  }
  assert.deepEqual(row("loads", load.id), loadsBefore);

  assert.throws(() => ensureShipmentForLoad(randomUUID()), (error: unknown) => error instanceof AppError && error.status === 404);
  assert.throws(
    () => appendEvent({ shipmentId: shipment.id, kind: "Nota", payload: { texto: "x" } }),
    (error: unknown) => error instanceof AppError && error.status === 400,
  );
});

function call(handler: typeof getEnvio, id: string, cookie?: string) {
  const headers = new Headers({ host: "127.0.0.1:4317" });
  if (cookie) headers.set("cookie", `${COOKIE_NAME}=${cookie}`);
  return handler(new Request(`http://127.0.0.1:4317/api/ops/envios/${id}`, { headers }), { params: Promise.resolve({ id }) });
}

test("con el flag apagado las rutas responden 404; encendido, solo admin u org_admin/trafico", async () => {
  const previous = process.env.OPS_FEATURE_ENABLED;
  const owner = person("mandante", "api-dueno");
  const stranger = person("mandante", "api-ajeno");
  const trafico = person("mandante", "api-trafico");
  const lectura = person("mandante", "api-lectura");
  const suspendido = person("mandante", "api-suspendido");
  const load = publish(owner);
  const offerId = randomUUID();
  const tripId = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO offers (id, load_id, carrier_id, price_clp, pickup_date, status, revisions, created_at, updated_at)
       VALUES (?, ?, ?, 800000, ?, 'activa', 0, ?, ?)`,
    )
    .run(offerId, load.id, stranger.id, addDays(4), stamp, stamp);
  getDb().prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, 'retirado', 'en origen', ?)`).run(
    tripId,
    load.id,
    owner.id,
    stamp,
  );
  const shipment = ensureShipmentForLoad(load.id, owner);
  const admin = upsertAdmin({
    email: `admin-${seq}@ops-envios.test`,
    password: "Camino-Largo-2026",
    razonSocial: "Admin OPS",
    rut: nextRut(),
    contactName: "Admin",
    whatsapp: "+56 9 55554444",
    city: "Santiago",
  });
  const adminCookie = createSession(admin.id, { mfa: true });
  const strangerCookie = createSession(stranger.id);
  const traficoCookie = createSession(trafico.id);
  const lecturaCookie = createSession(lectura.id);

  const orgId = randomUUID();
  const otherOrg = randomUUID();
  const db = getDb();
  const org = db.prepare(
    `INSERT INTO ops_organizations (id, kind, razon_social, rut_norm, created_by, created_at, updated_at)
     VALUES (?, 'mandante', ?, ?, NULL, ?, ?)`,
  );
  org.run(orgId, "Mandante tráfico", `ops-envio-${orgId}`, stamp, stamp);
  org.run(otherOrg, "Otra organización", `ops-envio-${otherOrg}`, stamp, stamp);
  const member = db.prepare(
    `INSERT INTO ops_org_members (id, org_id, user_id, area, ops_role, status, created_at) VALUES (?, ?, ?, 'trafico', ?, ?, ?)`,
  );
  member.run(randomUUID(), orgId, trafico.id, "trafico", "activo", stamp);
  member.run(randomUUID(), orgId, lectura.id, "lectura", "activo", stamp);
  member.run(randomUUID(), orgId, suspendido.id, "org_admin", "suspendido", stamp);
  member.run(randomUUID(), otherOrg, stranger.id, "org_admin", "activo", stamp);
  db.prepare(`UPDATE ops_shipments SET shipper_org_id = ? WHERE id = ?`).run(orgId, shipment.id);

  try {
    delete process.env.OPS_FEATURE_ENABLED;
    for (const value of [undefined, "", "false", "0", "1", "TRUE", "True", " true"] as const) {
      if (value === undefined) delete process.env.OPS_FEATURE_ENABLED;
      else process.env.OPS_FEATURE_ENABLED = value;
      const hidden = await call(getEnvio, shipment.id, adminCookie);
      assert.equal(hidden.status, 404, `flag ${JSON.stringify(value)}`);
      const body = (await hidden.json()) as { error?: string; shipment?: unknown };
      assert.equal(body.error, "No encontrado.");
      assert.equal(body.shipment, undefined);
      const hiddenCheck = await call(getVerificar, shipment.id, adminCookie);
      assert.equal(hiddenCheck.status, 404, `verificar flag ${JSON.stringify(value)}`);
    }

    process.env.OPS_FEATURE_ENABLED = "true";
    const anon = await call(getEnvio, shipment.id);
    assert.equal(anon.status, 404);
    const denied = await call(getEnvio, shipment.id, strangerCookie);
    assert.equal(denied.status, 403);
    const deniedCheck = await call(getVerificar, shipment.id, strangerCookie);
    assert.equal(deniedCheck.status, 403);
    const reader = await call(getEnvio, shipment.id, lecturaCookie);
    assert.equal(reader.status, 403);
    const paused = await call(getEnvio, shipment.id, createSession(suspendido.id));
    assert.equal(paused.status, 403);

    const ok = await call(getEnvio, shipment.id, adminCookie);
    assert.equal(ok.status, 200);
    const view = (await ok.json()) as {
      shipment: { id: string; loadId: string; stage: string };
      events: { seq: number; kind: string }[];
      derived: { tripEvents: { id: string; status: string }[]; offers: { id: string; priceClp: number }[] };
      chain: { ok: boolean; events: number };
    };
    assert.equal(view.shipment.id, shipment.id);
    assert.equal(view.shipment.loadId, load.id);
    assert.equal(view.shipment.stage, "negociacion");
    assert.equal(view.events[0]?.kind, "envio.creado");
    assert.equal(view.chain.ok, true);
    assert.equal(view.derived.tripEvents.length, 1);
    assert.equal(view.derived.tripEvents[0]?.id, tripId);
    assert.equal(view.derived.tripEvents[0]?.status, "retirado");
    assert.equal(view.derived.offers.length, 1);
    assert.equal(view.derived.offers[0]?.id, offerId);
    assert.equal(view.derived.offers[0]?.priceClp, 800000);

    const traffic = await call(getEnvio, shipment.id, traficoCookie);
    assert.equal(traffic.status, 200);

    const missing = await call(getEnvio, randomUUID(), adminCookie);
    assert.equal(missing.status, 404);

    getDb().prepare(`UPDATE ops_events SET payload_json = ? WHERE shipment_id = ? AND seq = 1`).run('{"alterado":true}', shipment.id);
    const check = await call(getVerificar, shipment.id, adminCookie);
    assert.equal(check.status, 200);
    const result = (await check.json()) as { ok: boolean; seq?: number; reason?: string; shipmentId: string };
    assert.equal(result.shipmentId, shipment.id);
    assert.equal(result.ok, false);
    assert.equal(result.seq, 1);
    assert.match(result.reason ?? "", /hash/);

    const loadsAfter = row("loads", load.id) as { id: string };
    assert.equal(loadsAfter.id, load.id);
    assert.deepEqual(getDb().prepare(`SELECT COUNT(*) AS n FROM trip_events WHERE load_id = ?`).get(load.id), { n: 1 });
    assert.deepEqual(getDb().prepare(`SELECT COUNT(*) AS n FROM offers WHERE load_id = ?`).get(load.id), { n: 1 });
  } finally {
    if (previous === undefined) delete process.env.OPS_FEATURE_ENABLED;
    else process.env.OPS_FEATURE_ENABLED = previous;
  }
});
