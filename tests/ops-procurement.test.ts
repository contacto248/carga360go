import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { POST as postOrg } from "../src/app/api/ops/organizaciones/route";
import { POST as postMember } from "../src/app/api/ops/organizaciones/[id]/miembros/route";
import { GET as getContracts, POST as postContract } from "../src/app/api/ops/contratos/route";
import { PATCH as patchContract } from "../src/app/api/ops/contratos/[id]/route";
import { POST as approveContract } from "../src/app/api/ops/contratos/[id]/aprobar/route";
import { GET as getVersions } from "../src/app/api/ops/contratos/[id]/versiones/route";
import { GET as getLanes, POST as postLane } from "../src/app/api/ops/rutas/route";
import { GET as getSlas, POST as postSla } from "../src/app/api/ops/sla/route";
import { PATCH as patchSla } from "../src/app/api/ops/sla/[id]/route";
import { GET as getRates, POST as postRate } from "../src/app/api/ops/tarifas/route";
import { PATCH as patchRate } from "../src/app/api/ops/tarifas/[id]/route";
import { POST as approveRate } from "../src/app/api/ops/tarifas/[id]/aprobar/route";
import { POST as importRates } from "../src/app/api/ops/tarifas/importar/route";
import { GET as getZones, POST as postZone } from "../src/app/api/ops/zonas/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { MIGRATION_24_SQL, getDb } from "../src/lib/db";
import { rutDv } from "../src/lib/format";
import { OPS_FLAGS } from "../src/lib/ops/flags";
import { dieselAdjustment } from "../src/lib/ops/procurement";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

const ctx = { params: Promise.resolve({}) };
let seq = 91_000_000;

function rut() {
  seq += 1;
  const body = String(seq);
  return `${body}-${rutDv(body)}`;
}

function withProcurement(on: boolean) {
  for (const flag of OPS_FLAGS) delete process.env[flag];
  if (!on) return;
  process.env.OPS_FEATURE_ENABLED = "true";
  process.env.OPS_PROCUREMENT_ENABLED = "true";
}

function person(role: "mandante" | "transportista", tag: string) {
  return registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: tag,
    email: `${tag}-${seq}@proc.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 6111 2345",
    city: "Santiago",
  }).user;
}

function admin(tag: string) {
  return upsertAdmin({
    email: `${tag}-${seq}@proc.test`,
    password: "Camino-Largo-2026",
    razonSocial: `Admin ${tag}`,
    rut: rut(),
    contactName: tag,
    whatsapp: "+56 9 4444 5555",
    city: "Santiago",
  });
}

function call(method: string, url: string, token: string | undefined, body?: unknown) {
  const headers = new Headers({ host: "127.0.0.1:4317" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token && method !== "GET") headers.set("sec-fetch-site", "same-origin");
  if (token) headers.set("cookie", `${COOKIE_NAME}=${token}`);
  return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function idCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function sqlBody(text: string) {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

test("migración 024 coincide con el SQL, no inserta zonas y la reversa está aparte", () => {
  const file = fs.readFileSync(path.join(process.cwd(), "docs/migrations/024-ops-procurement.sql"), "utf8");
  assert.equal(sqlBody(file), sqlBody(MIGRATION_24_SQL));
  assert.doesNotMatch(sqlBody(MIGRATION_24_SQL), /\b(ALTER\s+TABLE|DROP\s+TABLE|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(MIGRATION_24_SQL, /Calama|Antofagasta|Mejillones|Copiapó|Santiago/);
  const seed = fs.readFileSync(path.join(process.cwd(), "scripts/seed-dev.ts"), "utf8");
  for (const city of ["Calama", "Antofagasta", "Mejillones", "Copiapó", "Santiago"]) assert.match(seed, new RegExp(city));
  const rollback = fs.readFileSync(path.join(process.cwd(), "docs/migrations/024-ops-procurement-rollback.sql"), "utf8");
  for (const table of ["ops_zones", "ops_lanes", "ops_contracts", "ops_rate_cards", "ops_rate_card_lines", "ops_commercial_terms", "ops_slas", "ops_versions"]) {
    assert.match(rollback, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
  assert.match(rollback, /DELETE FROM schema_migrations WHERE version = 24/);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_zones`).get() as { n: number }).n >= 0, true);
});

test("con el flag apagado procurement responde 404 y no escribe", async () => {
  withProcurement(false);
  const root = admin("off");
  const token = createSession(root.id, { mfa: true });
  const before = (getDb().prepare(`SELECT COUNT(*) AS n FROM ops_zones`).get() as { n: number }).n;
  const listed = await getZones(call("GET", "http://127.0.0.1:4317/api/ops/zonas?orgId=x", token), ctx);
  const created = await postZone(call("POST", "http://127.0.0.1:4317/api/ops/zonas", token, { orgId: "x", name: "Calama" }), ctx);
  const rates = await getRates(call("GET", "http://127.0.0.1:4317/api/ops/tarifas?orgId=x", token), ctx);
  assert.equal(listed.status, 404);
  assert.equal(created.status, 404);
  assert.equal(rates.status, 404);
  process.env.OPS_FEATURE_ENABLED = "true";
  const childOff = await getZones(call("GET", "http://127.0.0.1:4317/api/ops/zonas?orgId=x", token), ctx);
  assert.equal(childOff.status, 404);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_zones`).get() as { n: number }).n, before);
});

test("permisos, vigencia, versionado, SLA, resolveRate y CSV", async () => {
  withProcurement(true);
  const root = admin("root");
  const rootToken = createSession(root.id, { mfa: true });
  const boss = person("mandante", "jefe");
  const buyer = person("mandante", "compra");
  const reader = person("mandante", "lee");
  const outsider = person("mandante", "ajeno");
  const carrierUser = person("transportista", "camion");

  async function org(kind: "mandante" | "transportista", name: string) {
    const response = await postOrg(call("POST", "http://127.0.0.1:4317/api/ops/organizaciones", rootToken, { kind, razonSocial: name, rut: rut() }), ctx);
    assert.equal(response.status, 201);
    return ((await response.json()) as { organization: { id: string } }).organization.id;
  }
  const shipper = await org("mandante", "Mandante Norte");
  const carrier = await org("transportista", "Transporte Sur");
  const other = await org("mandante", "Otra");
  async function member(orgId: string, userId: string, opsRole: string) {
    const response = await postMember(
      call("POST", `http://127.0.0.1:4317/api/ops/organizaciones/${orgId}/miembros`, rootToken, { userId, opsRole }),
      idCtx(orgId),
    );
    assert.equal(response.status, 201);
  }
  await member(shipper, boss.id, "org_admin");
  await member(shipper, buyer.id, "procurement");
  await member(shipper, reader.id, "lectura");
  await member(other, outsider.id, "org_admin");
  await member(carrier, carrierUser.id, "org_admin");

  const bossToken = createSession(boss.id);
  const buyerToken = createSession(buyer.id);
  const readerToken = createSession(reader.id);
  const outsiderToken = createSession(outsider.id);

  const forbidden = await getZones(call("GET", `http://127.0.0.1:4317/api/ops/zonas?orgId=${shipper}`, outsiderToken), ctx);
  assert.equal(forbidden.status, 403);
  const readOnly = await postZone(call("POST", "http://127.0.0.1:4317/api/ops/zonas", readerToken, { orgId: shipper, name: "Calama", region: "Antofagasta" }), ctx);
  assert.equal(readOnly.status, 403);

  async function zone(name: string, region: string) {
    const response = await postZone(call("POST", "http://127.0.0.1:4317/api/ops/zonas", bossToken, { orgId: shipper, name, region, comunas: [name] }), ctx);
    assert.equal(response.status, 201, await response.clone().text());
    return ((await response.json()) as { zone: { id: string } }).zone.id;
  }
  const calama = await zone("Calama", "Antofagasta");
  const antofagasta = await zone("Antofagasta", "Antofagasta");
  const listed = await getZones(call("GET", `http://127.0.0.1:4317/api/ops/zonas?orgId=${shipper}`, readerToken), ctx);
  assert.equal(listed.status, 200);

  const laneResponse = await postLane(
    call("POST", "http://127.0.0.1:4317/api/ops/rutas", bossToken, { orgId: shipper, originZoneId: calama, destinationZoneId: antofagasta, distanceKm: 210 }),
    ctx,
  );
  assert.equal(laneResponse.status, 201);
  const laneId = ((await laneResponse.json()) as { lane: { id: string } }).lane.id;
  assert.equal((await getLanes(call("GET", `http://127.0.0.1:4317/api/ops/rutas?orgId=${shipper}`, readerToken), ctx)).status, 200);

  const line = (amount: number) => ({ laneId, equipment: "sider", vehicleClass: "tracto_semirremolque_5_ejes", rateKind: "por_viaje", amountClp: amount });
  async function tariff(token: string, name: string, validFrom: string, validTo: string, amount: number) {
    return postRate(
      call("POST", "http://127.0.0.1:4317/api/ops/tarifas", token, {
        shipperOrgId: shipper,
        carrierOrgId: carrier,
        name,
        validFrom,
        validTo,
        lines: [line(amount)],
        terms: { paymentDays: 30, insuranceRequired: true, dieselClause: { zone: "Zona Norte", basePrice: 1000, liters: 10 } },
      }),
      ctx,
    );
  }

  const badDates = await tariff(bossToken, "Fechas", "2026-06-01", "2026-01-01", 100000);
  assert.equal(badDates.status, 400);

  const first = await tariff(buyerToken, "Tarifario A", "2026-01-01", "2026-06-30", 100000);
  assert.equal(first.status, 201);
  const firstId = ((await first.json()) as { rateCard: { id: string; status: string } }).rateCard.id;
  const buyerApproves = await approveRate(call("POST", `http://127.0.0.1:4317/api/ops/tarifas/${firstId}/aprobar`, buyerToken), idCtx(firstId));
  assert.equal(buyerApproves.status, 403);
  const approved = await approveRate(call("POST", `http://127.0.0.1:4317/api/ops/tarifas/${firstId}/aprobar`, bossToken), idCtx(firstId));
  assert.equal(approved.status, 200);

  const overlap = await tariff(bossToken, "Tarifario B", "2026-03-01", "2026-08-01", 110000);
  assert.equal(overlap.status, 201);
  const overlapId = ((await overlap.json()) as { rateCard: { id: string } }).rateCard.id;
  const rejected = await approveRate(call("POST", `http://127.0.0.1:4317/api/ops/tarifas/${overlapId}/aprobar`, bossToken), idCtx(overlapId));
  assert.equal(rejected.status, 400);

  const later = await tariff(bossToken, "Tarifario C", "2026-07-01", "2026-12-31", 120000);
  const laterId = ((await later.json()) as { rateCard: { id: string } }).rateCard.id;
  assert.equal((await approveRate(call("POST", `http://127.0.0.1:4317/api/ops/tarifas/${laterId}/aprobar`, bossToken), idCtx(laterId))).status, 200);

  const cardBefore = getDb().prepare(`SELECT amount_clp FROM ops_rate_card_lines WHERE rate_card_id = ?`).get(firstId) as { amount_clp: number };
  const edited = await patchRate(call("PATCH", `http://127.0.0.1:4317/api/ops/tarifas/${firstId}`, bossToken, { lines: [line(130000)] }), idCtx(firstId));
  assert.equal(edited.status, 200);
  const editedBody = (await edited.json()) as { rateCard: { id: string; version: number; status: string; lines: { amountClp: number }[] } };
  assert.equal(editedBody.rateCard.version, 2);
  assert.equal(editedBody.rateCard.status, "borrador");
  assert.equal(editedBody.rateCard.lines[0].amountClp, 130000);
  assert.notEqual(editedBody.rateCard.id, firstId);
  const still = getDb().prepare(`SELECT amount_clp FROM ops_rate_card_lines WHERE rate_card_id = ?`).get(firstId) as { amount_clp: number };
  assert.equal(still.amount_clp, cardBefore.amount_clp);
  assert.equal(still.amount_clp, 100000);
  const snap = getDb().prepare(`SELECT snapshot_json FROM ops_versions WHERE entity_type = 'tarifario' AND entity_id = ?`).get(firstId) as { snapshot_json: string };
  assert.equal(JSON.parse(snap.snapshot_json).lines[0].amountClp, 100000);
  assert.equal((await approveRate(call("POST", `http://127.0.0.1:4317/api/ops/tarifas/${editedBody.rateCard.id}/aprobar`, bossToken), idCtx(editedBody.rateCard.id))).status, 200);
  assert.equal((getDb().prepare(`SELECT amount_clp FROM ops_rate_card_lines WHERE rate_card_id = ?`).get(firstId) as { amount_clp: number }).amount_clp, 100000);

  async function resolved(date: string) {
    const response = await getRates(
      call("GET", `http://127.0.0.1:4317/api/ops/tarifas?shipperOrgId=${shipper}&carrierOrgId=${carrier}&origin=Calama&destination=Antofagasta&equipment=sider&date=${date}`, readerToken),
      ctx,
    );
    assert.equal(response.status, 200);
    return ((await response.json()) as { rate: { amountClp: number; diesel: { adjustmentClp: number | null; note: string }; referencia: { notice?: string } | null } | null }).rate;
  }
  assert.equal((await resolved("2026-02-01"))?.amountClp, 130000);
  assert.equal(await resolved("2025-12-31"), null);
  assert.equal((await resolved("2026-08-01"))?.amountClp, 120000);
  const february = await resolved("2026-02-01");
  assert.match(february?.diesel.note ?? "", /referencial/i);
  if (february?.referencia) assert.equal(typeof february.referencia.notice, "string");

  const contractResponse = await postContract(
    call("POST", "http://127.0.0.1:4317/api/ops/contratos", bossToken, {
      shipperOrgId: shipper,
      carrierOrgId: carrier,
      kind: "contrato_marco",
      title: "Contrato norte",
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
    }),
    ctx,
  );
  assert.equal(contractResponse.status, 201);
  const contractId = ((await contractResponse.json()) as { contract: { id: string } }).contract.id;
  const badSla = await postSla(call("POST", "http://127.0.0.1:4317/api/ops/sla", bossToken, { contractId, metric: "entrega_a_tiempo", target: 150, unit: "%" }), ctx);
  assert.equal(badSla.status, 400);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_slas WHERE contract_id = ?`).get(contractId) as { n: number }).n, 0);
  const sla = await postSla(call("POST", "http://127.0.0.1:4317/api/ops/sla", bossToken, { contractId, metric: "entrega_a_tiempo", target: 95, unit: "%", tolerance: 2 }), ctx);
  assert.equal(sla.status, 201);
  const slaId = ((await sla.json()) as { sla: { id: string } }).sla.id;
  assert.equal((await getSlas(call("GET", `http://127.0.0.1:4317/api/ops/sla?contractId=${contractId}`, readerToken), ctx)).status, 200);
  assert.equal((await getContracts(call("GET", `http://127.0.0.1:4317/api/ops/contratos?orgId=${shipper}`, outsiderToken), ctx)).status, 403);
  assert.equal((await approveContract(call("POST", `http://127.0.0.1:4317/api/ops/contratos/${contractId}/aprobar`, buyerToken), idCtx(contractId))).status, 403);
  assert.equal((await approveContract(call("POST", `http://127.0.0.1:4317/api/ops/contratos/${contractId}/aprobar`, bossToken), idCtx(contractId))).status, 200);
  const locked = await patchSla(call("PATCH", `http://127.0.0.1:4317/api/ops/sla/${slaId}`, bossToken, { target: 90 }), idCtx(slaId));
  assert.equal(locked.status, 409);
  assert.equal((getDb().prepare(`SELECT target FROM ops_slas WHERE id = ?`).get(slaId) as { target: number }).target, 95);
  const versioned = await patchContract(call("PATCH", `http://127.0.0.1:4317/api/ops/contratos/${contractId}`, bossToken, { title: "Contrato norte v2" }), idCtx(contractId));
  assert.equal(versioned.status, 200);
  const versionedBody = (await versioned.json()) as { contract: { id: string; version: number; title: string } };
  assert.equal(versionedBody.contract.version, 2);
  assert.equal((getDb().prepare(`SELECT title FROM ops_contracts WHERE id = ?`).get(contractId) as { title: string }).title, "Contrato norte");
  const versions = await getVersions(call("GET", `http://127.0.0.1:4317/api/ops/contratos/${contractId}/versiones`, readerToken), idCtx(contractId));
  assert.equal(versions.status, 200);
  const versionBody = (await versions.json()) as { versions: { snapshot: { title: string } }[] };
  assert.equal(versionBody.versions[0].snapshot.title, "Contrato norte");

  const beforeCsv = (getDb().prepare(`SELECT COUNT(*) AS n FROM ops_rate_cards`).get() as { n: number }).n;
  const csvBad = await importRates(
    call("POST", "http://127.0.0.1:4317/api/ops/tarifas/importar", buyerToken, {
      shipperOrgId: shipper,
      carrierOrgId: carrier,
      name: "Importado",
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
      csv: "origen,destino,equipo,tipo,monto\nCalama,Antofagasta,sider,por_viaje,90000\nCalama,Antofagasta,no-existe,por_viaje,80000\n",
    }),
    ctx,
  );
  assert.equal(csvBad.status, 422);
  const csvErrors = (await csvBad.json()) as { errors: { row: number; message: string }[] };
  assert.equal(csvErrors.errors.some((item) => item.row === 3), true);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_rate_cards`).get() as { n: number }).n, beforeCsv);
  const csvOk = await importRates(
    call("POST", "http://127.0.0.1:4317/api/ops/tarifas/importar", buyerToken, {
      shipperOrgId: shipper,
      carrierOrgId: carrier,
      name: "Importado ok",
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
      csv: "origen,destino,equipo,clase,tipo,monto,notas\nCalama,Antofagasta,sider,tracto_semirremolque_5_ejes,por_viaje,90000,norte\n",
    }),
    ctx,
  );
  assert.equal(csvOk.status, 201);
  assert.equal(((await csvOk.json()) as { rateCard: { status: string; lines: { amountClp: number }[] } }).rateCard.lines[0].amountClp, 90000);
});

test("el ajuste de diésel usa el precio guardado y no factura", () => {
  withProcurement(true);
  getDb()
    .prepare(`INSERT INTO cost_diesel_prices (id, source_id, zone, price, price_min, price_max, unit, fetched_at) VALUES (?, 'cne', 'Zona Norte', 1200, NULL, NULL, '$/L', ?)`)
    .run(`diesel-${seq}`, new Date().toISOString());
  const result = dieselAdjustment({ zone: "Zona Norte", basePrice: 1000, liters: 10 });
  assert.equal(result.adjustmentClp, 2000);
  assert.equal(result.dieselPrice, 1200);
  assert.match(result.note, /No es un cobro/);
  assert.equal(dieselAdjustment(null).adjustmentClp, null);
});

test("ninguna página pública importa procurement", () => {
  const root = path.join(process.cwd(), "src/app");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full.includes(`${path.sep}api${path.sep}ops`)) continue;
        walk(full);
      } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.equal(text.includes("ops/procurement"), false, file);
    assert.equal(text.includes("resolveRate"), false, file);
    assert.equal(text.includes("OPS_PROCUREMENT_ENABLED"), false, file);
  }
});
