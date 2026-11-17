import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET as getAsignacion } from "../src/app/api/ops/v1/asignaciones/[runId]/route";
import { GET as getContratos } from "../src/app/api/ops/v1/contratos/route";
import { GET as getEnvio } from "../src/app/api/ops/v1/envios/[id]/route";
import { GET as getTarifas } from "../src/app/api/ops/v1/tarifas/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { rutDv } from "../src/lib/format";
import { getAllocationRun, readAllocationRun } from "../src/lib/ops/allocation";
import { loadOpsPanel } from "../src/lib/ops/panel";
import { addMember, createOrganization } from "../src/lib/ops/organizations";
import { middleware } from "../src/middleware";
import { parseYaml, type Yaml } from "./parse-yaml";
import { randomUUID } from "node:crypto";

const ROUTES = {
  "/api/ops/v1/contratos": "src/app/api/ops/v1/contratos/route.ts",
  "/api/ops/v1/tarifas": "src/app/api/ops/v1/tarifas/route.ts",
  "/api/ops/v1/envios/{id}": "src/app/api/ops/v1/envios/[id]/route.ts",
  "/api/ops/v1/asignaciones/{runId}": "src/app/api/ops/v1/asignaciones/[runId]/route.ts",
} as const;

let seq = 91_000_000;

function rut() {
  seq += 1;
  const body = String(seq);
  return `${body}-${rutDv(body)}`;
}

function person(role: "mandante" | "transportista", tag: string) {
  return registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: tag,
    email: `${tag}-${seq}@ops-panel.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 6111 2345",
    city: "Santiago",
  }).user;
}

function admin(tag: string) {
  return upsertAdmin({
    email: `${tag}-${seq}@ops-panel.test`,
    password: "Camino-Largo-2026",
    razonSocial: `Admin ${tag}`,
    rut: rut(),
    contactName: tag,
    whatsapp: "+56 9 4444 5555",
    city: "Santiago",
  });
}

function withFlags(values: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const names = ["OPS_FEATURE_ENABLED", "OPS_API_V1_ENABLED", "OPS_ALLOCATION_ENABLED", "OPS_PROCUREMENT_ENABLED"];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  const restore = () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  try {
    const result = run();
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function cookieOf(userId: string, mfa = false) {
  return createSession(userId, { mfa });
}

type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

function call(handler: Handler, url: string, params: Record<string, string>, cookie?: string, bearer?: string) {
  const headers = new Headers({ host: "127.0.0.1:4317", accept: "application/json" });
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  else if (cookie) headers.set("cookie", `${COOKIE_NAME}=${cookie}`);
  return handler(new Request(`http://127.0.0.1:4317${url}`, { headers }), { params: Promise.resolve(params) });
}

function isRecord(value: Yaml): value is { [key: string]: Yaml } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

test("con el flag apagado /admin/ops responde 404 HTTP y no la pantalla de carga", async () => {
  await withFlags({ OPS_FEATURE_ENABLED: undefined }, async () => {
    const hidden = middleware(new NextRequest("http://127.0.0.1:4317/admin/ops"));
    assert.equal(hidden.status, 404);
    assert.match(hidden.headers.get("content-type") ?? "", /text\/html/);
    const html = await hidden.text();
    assert.match(html, /No encontramos esa página/);
    assert.equal(html.includes("Cargando"), false);
    assert.equal(html.includes("Panel de operación"), false);

    const owner = admin("dueno");
    const session = cookieOf(owner.id, true);
    const stillHidden = middleware(new NextRequest("http://127.0.0.1:4317/admin/ops?seccion=tarifas", { headers: { cookie: `${COOKIE_NAME}=${session}` } }));
    assert.equal(stillHidden.status, 404);
    assert.equal((await stillHidden.text()).includes("Cargando"), false);
  });

  const carrier = person("transportista", "visita");
  const platform = admin("plataforma");
  await withFlags({ OPS_FEATURE_ENABLED: "true" }, async () => {
    const anonymous = middleware(new NextRequest("http://127.0.0.1:4317/admin/ops"));
    assert.equal(anonymous.status, 404);
    assert.equal((await anonymous.text()).includes("Cargando"), false);

    const outsider = middleware(
      new NextRequest("http://127.0.0.1:4317/admin/ops", { headers: { cookie: `${COOKIE_NAME}=${cookieOf(carrier.id)}` } }),
    );
    assert.equal(outsider.status, 404);

    const allowed = middleware(
      new NextRequest("http://127.0.0.1:4317/admin/ops", { headers: { cookie: `${COOKIE_NAME}=${cookieOf(platform.id, true)}` } }),
    );
    assert.notEqual(allowed.status, 404);
  });

  const page = fs.readFileSync(path.join(process.cwd(), "src/app/admin/ops/page.tsx"), "utf8");
  assert.match(page, /notFound\(/);
  assert.match(page, /OPS_FEATURE_ENABLED/);
  assert.equal(page.includes("Cargando"), false);
  for (const file of ["src/components/Header.tsx", "src/components/AdminNav.tsx", "src/app/sitemap.ts", "src/app/page.tsx"]) {
    const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.equal(text.includes("/admin/ops"), false, file);
    assert.equal(text.includes("/api/ops/v1"), false, file);
  }
});

test("la API v1 solo lee con el flag hijo, la sesión y el permiso del rol", async () => {
  const platform = admin("api");
  const adminCookie = cookieOf(platform.id, true);
  const adminBearer = cookieOf(platform.id, true);
  const shipper = createOrganization(platform, { kind: "mandante", razonSocial: "Mandante Norte", rut: rut() }, null);
  const other = createOrganization(platform, { kind: "mandante", razonSocial: "Mandante Sur", rut: rut() }, null);
  const finance = person("mandante", "finanzas");
  const traffic = person("mandante", "trafico");
  const reader = person("mandante", "lectura");
  const foreign = person("mandante", "ajeno");
  const stranger = person("mandante", "extra");
  addMember(platform, shipper.id, { userId: finance.id, opsRole: "finanzas" }, null);
  addMember(platform, shipper.id, { userId: traffic.id, opsRole: "trafico" }, null);
  addMember(platform, shipper.id, { userId: reader.id, opsRole: "lectura" }, null);
  addMember(platform, other.id, { userId: foreign.id, opsRole: "finanzas" }, null);

  const now = new Date().toISOString();
  const contractId = randomUUID();
  const slaId = randomUUID();
  const rateId = randomUUID();
  const shipmentId = randomUUID();
  const ruleId = randomUUID();
  const runId = randomUUID();
  const decisionId = randomUUID();
  const candidateId = randomUUID();
  const db = getDb();
  db.prepare(
    `INSERT INTO ops_contracts (id, shipper_org_id, carrier_org_id, kind, title, status, valid_from, valid_to, version, parent_id, document_id, approved_by, approved_at, created_at, updated_at)
     VALUES (?, ?, NULL, 'contrato_marco', 'Contrato norte', 'vigente', '2026-01-01', '2026-12-31', 1, NULL, NULL, NULL, NULL, ?, ?)`,
  ).run(contractId, shipper.id, now, now);
  db.prepare(`INSERT INTO ops_slas (id, contract_id, metric, target, unit, tolerance, penalty_note) VALUES (?, ?, 'entrega_a_tiempo', 95, '%', NULL, NULL)`).run(slaId, contractId);
  db.prepare(
    `INSERT INTO ops_rate_cards (id, contract_id, shipper_org_id, carrier_org_id, name, status, valid_from, valid_to, version, approved_by, approved_at, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'Tarifa norte', 'vigente', '2026-01-01', '2026-12-31', 1, NULL, NULL, ?, ?)`,
  ).run(rateId, contractId, shipper.id, now, now);
  db.prepare(
    `INSERT INTO ops_shipments (id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id, stage, planned_pickup_at, planned_delivery_at, created_at, updated_at)
     VALUES (?, NULL, ?, NULL, NULL, NULL, NULL, 'asignacion', NULL, NULL, ?, ?)`,
  ).run(shipmentId, shipper.id, now, now);
  db.prepare(
    `INSERT INTO ops_allocation_rules (id, shipper_org_id, lane_id, equipment, mode, weights_json, min_score, accept_timeout_minutes, max_rounds, active, created_by, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 'por_tarifa', '{}', NULL, 60, 3, 1, ?, ?, ?)`,
  ).run(ruleId, shipper.id, platform.id, now, now);
  db.prepare(
    `INSERT INTO ops_allocation_runs (id, shipment_id, rule_id, mode, status, dry_run, started_by, created_at, finished_at)
     VALUES (?, ?, ?, 'por_tarifa', 'propuesta', 1, ?, ?, NULL)`,
  ).run(runId, shipmentId, ruleId, platform.id, now);
  db.prepare(
    `INSERT INTO ops_allocation_decisions (id, run_id, seq, step, rule_id, input_json, output_json, decided_by, created_at)
     VALUES (?, ?, 1, 'filtrar', ?, '{"modo":"por_tarifa"}', '{"vigentes":1}', 'motor', ?)`,
  ).run(decisionId, runId, ruleId, now);
  db.prepare(
    `INSERT INTO ops_allocation_candidates (id, run_id, carrier_user_id, truck_id, rank, rate_clp, score, match_score, availability, reasons_json, status, attempt, next_retry_at, responded_at)
     VALUES (?, ?, ?, NULL, 1, 180000, 80, NULL, 'disponible', '["tarifa vigente más baja"]', 'propuesto', 0, NULL, NULL)`,
  ).run(candidateId, runId, traffic.id);

  await withFlags({ OPS_FEATURE_ENABLED: "true" }, async () => {
    const panel = loadOpsPanel(platform);
    assert.equal(panel.contracts.some((contract) => contract.title === "Contrato norte" && contract.slas.some((sla) => sla.metric === "entrega_a_tiempo")), true);
    assert.equal(panel.rateCards.some((card) => card.name === "Tarifa norte"), true);
    const run = panel.runs.find((item) => item.id === runId);
    assert.ok(run);
    assert.equal(run.decisions[0]?.step, "filtrar");
    assert.equal(run.candidates[0]?.rateClp, 180000);
    assert.equal(panel.shipments.some((shipment) => shipment.id === shipmentId), true);
    assert.throws(() => loadOpsPanel(finance), (error: unknown) => error instanceof AppError && error.status === 404);
    assert.throws(() => getAllocationRun(platform, runId), (error: unknown) => error instanceof AppError && error.status === 404);
    assert.equal(readAllocationRun(platform, runId).id, runId);

    const off = await call(getContratos, "/api/ops/v1/contratos", {});
    assert.equal(off.status, 404);
    assert.equal(((await off.json()) as { error: string }).error, "No encontrado.");
  });

  await withFlags({ OPS_FEATURE_ENABLED: undefined, OPS_API_V1_ENABLED: "true" }, async () => {
    const hidden = await call(getContratos, "/api/ops/v1/contratos", {}, adminCookie);
    assert.equal(hidden.status, 404);
  });

  await withFlags({ OPS_FEATURE_ENABLED: "true", OPS_API_V1_ENABLED: "TRUE" }, async () => {
    const hidden = await call(getTarifas, "/api/ops/v1/tarifas", {}, adminCookie);
    assert.equal(hidden.status, 404);
  });

  await withFlags({ OPS_FEATURE_ENABLED: "true", OPS_API_V1_ENABLED: "true" }, async () => {
    assert.equal((await call(getContratos, "/api/ops/v1/contratos", {})).status, 401);
    assert.equal((await call(getTarifas, "/api/ops/v1/tarifas", {})).status, 401);
    assert.equal((await call(getEnvio, `/api/ops/v1/envios/${shipmentId}`, { id: shipmentId })).status, 401);
    assert.equal((await call(getAsignacion, `/api/ops/v1/asignaciones/${runId}`, { runId })).status, 401);

    const invalid = await call(getContratos, "/api/ops/v1/contratos?orgId=no-es-uuid", {}, adminCookie);
    assert.equal(invalid.status, 400);

    const byBearer = await call(getContratos, `/api/ops/v1/contratos?orgId=${shipper.id}`, {}, undefined, adminBearer);
    assert.equal(byBearer.status, 200);
    const bearerBody = (await byBearer.json()) as { contracts: { title: string; slas: { metric: string }[] }[] };
    assert.equal(bearerBody.contracts.some((contract) => contract.title === "Contrato norte" && contract.slas[0]?.metric === "entrega_a_tiempo"), true);

    const rates = await call(getTarifas, `/api/ops/v1/tarifas?orgId=${shipper.id}`, {}, adminCookie);
    assert.equal(rates.status, 200);
    const rateBody = (await rates.json()) as { rateCards: { name: string }[] };
    assert.equal(rateBody.rateCards.some((card) => card.name === "Tarifa norte"), true);

    const financeCookie = cookieOf(finance.id);
    const financeList = await call(getContratos, `/api/ops/v1/contratos?orgId=${shipper.id}`, {}, financeCookie);
    assert.equal(financeList.status, 200);
    const trafficCookie = cookieOf(traffic.id);
    const trafficDenied = await call(getContratos, `/api/ops/v1/contratos?orgId=${shipper.id}`, {}, trafficCookie);
    assert.equal(trafficDenied.status, 403);
    const trafficAll = await call(getContratos, "/api/ops/v1/contratos", {}, trafficCookie);
    assert.equal(trafficAll.status, 200);
    assert.equal(((await trafficAll.json()) as { contracts: unknown[] }).contracts.length, 0);

    const foreignCookie = cookieOf(foreign.id);
    const foreignDenied = await call(getTarifas, `/api/ops/v1/tarifas?orgId=${shipper.id}`, {}, foreignCookie);
    assert.equal(foreignDenied.status, 403);
    const strangerCookie = cookieOf(stranger.id);
    const strangerDenied = await call(getContratos, `/api/ops/v1/contratos?orgId=${shipper.id}`, {}, strangerCookie);
    assert.equal(strangerDenied.status, 403);

    const trafficShipment = await call(getEnvio, `/api/ops/v1/envios/${shipmentId}`, { id: shipmentId }, trafficCookie);
    assert.equal(trafficShipment.status, 200);
    assert.equal(((await trafficShipment.json()) as { shipment: { id: string } }).shipment.id, shipmentId);
    const readerCookie = cookieOf(reader.id);
    const readerShipment = await call(getEnvio, `/api/ops/v1/envios/${shipmentId}`, { id: shipmentId }, readerCookie);
    assert.equal(readerShipment.status, 403);
    const financeShipment = await call(getEnvio, `/api/ops/v1/envios/${shipmentId}`, { id: shipmentId }, financeCookie);
    assert.equal(financeShipment.status, 403);
    const missingId = randomUUID();
    const missingShipment = await call(getEnvio, `/api/ops/v1/envios/${missingId}`, { id: missingId }, adminCookie);
    assert.equal(missingShipment.status, 404);

    const readerRun = await call(getAsignacion, `/api/ops/v1/asignaciones/${runId}`, { runId }, readerCookie);
    assert.equal(readerRun.status, 200);
    const runBody = (await readerRun.json()) as { run: { decisions: { step: string }[]; candidates: { rateClp: number }[] } };
    assert.equal(runBody.run.decisions[0]?.step, "filtrar");
    assert.equal(runBody.run.candidates[0]?.rateClp, 180000);
    const financeRun = await call(getAsignacion, `/api/ops/v1/asignaciones/${runId}`, { runId }, financeCookie);
    assert.equal(financeRun.status, 404);
    const missingRunId = randomUUID();
    const missingRun = await call(getAsignacion, `/api/ops/v1/asignaciones/${missingRunId}`, { runId: missingRunId }, adminCookie);
    assert.equal(missingRun.status, 404);
  });
});

test("OpenAPI v1 se puede parsear y cada ruta existe", () => {
  const specPath = path.join(process.cwd(), "docs/ops/openapi-v1.yaml");
  const doc = parseYaml(fs.readFileSync(specPath, "utf8"));
  assert.equal(isRecord(doc), true);
  if (!isRecord(doc)) return;
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(isRecord(doc.paths), true);
  if (!isRecord(doc.paths)) return;
  assert.deepEqual(Object.keys(doc.paths).sort(), Object.keys(ROUTES).sort());
  for (const [route, file] of Object.entries(ROUTES)) {
    const item: Yaml = doc.paths[route] ?? null;
    assert.equal(isRecord(item), true, route);
    if (!isRecord(item)) continue;
    assert.equal(isRecord(item.get), true, route);
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.match(source, /export const GET/);
    assert.match(source, /apiV1Guard/);
  }
  const guide = fs.readFileSync(path.join(process.cwd(), "docs/ops/API-v1.md"), "utf8");
  for (const route of Object.keys(ROUTES)) assert.equal(guide.includes(route), true, route);
  assert.match(guide, /OPS_API_V1_ENABLED/);
  assert.match(guide, /OPS_FEATURE_ENABLED/);
  assert.match(guide, /c360_session/);
  assert.match(guide, /Bearer/);
});
