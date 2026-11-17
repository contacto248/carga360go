import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST as postOperacion } from "../src/app/api/ops/operaciones/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { rutDv } from "../src/lib/format";
import { middleware } from "../src/middleware";
import {
  actualizarEstadoOperacion,
  codigoOperacion,
  createOperacion,
  decidirCancelacion,
  MAX_CORRELATIVO,
  periodoOperacion,
  SHIPMENT_CANCEL_PARA_AGENTES,
  transicionOperacionPermitida,
  type Operacion,
} from "../src/lib/ops/operacion";
import type { PublicUser } from "../src/lib/types";

let seq = 0;

function nextRut(): string {
  seq += 1;
  const body = String(21_500_000 + seq * 173).padStart(8, "0");
  return `${body}-${rutDv(body)}`;
}

function person(role: "mandante" | "transportista"): PublicUser {
  const { user } = registerUser({
    role,
    razonSocial: `${role} operacion ${seq}`,
    rut: nextRut(),
    contactName: `Contacto ${seq}`,
    email: `operacion-${seq}@ops-operacion.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(51000000 + seq).padStart(8, "0")}`,
    city: "La Serena",
  });
  return user;
}

function admin(tag: string): PublicUser {
  return upsertAdmin({
    email: `admin-${tag}-${seq}@ops-operacion.test`,
    password: "Camino-Largo-2026",
    razonSocial: `Admin ${tag}`,
    rut: nextRut(),
    contactName: tag,
    whatsapp: "+56 9 55556666",
    city: "Santiago",
  });
}

function withFlags(values: Record<string, string | undefined>, run: () => void) {
  const names = ["OPS_FEATURE_ENABLED", "OPS_OPERACION_ENABLED"];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function body(over: Record<string, unknown> = {}) {
  return {
    cliente: "Agricola Norte",
    origen: "La Serena",
    destino: "Santiago",
    tipoCarga: "Pallets",
    pesoKg: 12500,
    idempotencyKey: `op-${seq}-${Math.random().toString(16).slice(2)}`,
    ...over,
  };
}

function audits(id: string) {
  return getDb().prepare(`SELECT action, target_type, actor_id FROM audit_log WHERE target_id = ?`).all(id) as {
    action: string;
    target_type: string;
    actor_id: string;
  }[];
}

test("el identificador es 360-YYMM-NNNN en America/Santiago y no lo elige el cliente", () => {
  assert.equal(periodoOperacion(new Date("2026-11-15T15:00:00.000Z")), "2611");
  assert.equal(codigoOperacion("2611", 1), "360-2611-0001");
  assert.equal(codigoOperacion("2611", 42), "360-2611-0042");
  assert.equal(codigoOperacion("2611", 9999), "360-2611-9999");
  assert.throws(() => codigoOperacion("2611", 10000), (error: unknown) => error instanceof AppError && error.status === 409);
  assert.throws(() => codigoOperacion("261", 1), (error: unknown) => error instanceof AppError && error.status === 400);

  const owner = admin("codigo");
  withFlags({ OPS_FEATURE_ENABLED: "true", OPS_OPERACION_ENABLED: "true" }, () => {
    const enero = new Date("1999-01-15T08:00:00.000Z");
    const first = createOperacion(owner, body(), null, enero);
    const second = createOperacion(owner, body(), null, new Date("1999-01-31T23:00:00.000Z"));
    const febrero = createOperacion(owner, body(), null, new Date("1999-02-01T03:00:00.000Z"));
    assert.equal(first.replayed, false);
    assert.equal(first.operacion.id, "360-9901-0001");
    assert.equal(second.operacion.id, "360-9901-0002");
    assert.equal(febrero.operacion.id, "360-9902-0001");
    assert.equal(first.operacion.estado, "abierta");
    assert.equal(first.operacion.version, 1);
    assert.equal(first.operacion.createdBy, owner.id);
    assert.throws(
      () => createOperacion(owner, body({ id: "360-9901-0099", codigo: "360-9901-0099", estado: "ASSIGNED" }), null, enero),
      (error: unknown) => error instanceof AppError && error.status === 400,
    );
  });
});

test("entre las 21:00 y las 24:00 de Chile el YYMM sigue en el mes local", () => {
  // 30-nov 21:00 en Chile (UTC-3) corresponde a 01-dic 00:00Z; el periodo queda en noviembre.
  assert.equal(periodoOperacion(new Date("2026-12-01T00:00:00.000Z")), "2611");
  assert.equal(periodoOperacion(new Date("2026-12-01T02:59:59.999Z")), "2611");
  assert.equal(periodoOperacion(new Date("2026-12-01T03:00:00.000Z")), "2612");

  const owner = admin("borde");
  withFlags({ OPS_FEATURE_ENABLED: "true", OPS_OPERACION_ENABLED: "true" }, () => {
    const noche = createOperacion(owner, body(), null, new Date("2034-12-01T00:00:00.000Z"));
    const cierre = createOperacion(owner, body(), null, new Date("2034-12-01T02:59:59.999Z"));
    const diciembre = createOperacion(owner, body(), null, new Date("2034-12-01T03:00:00.000Z"));
    assert.equal(noche.operacion.id, "360-3411-0001");
    assert.equal(cierre.operacion.id, "360-3411-0002");
    assert.equal(diciembre.operacion.id, "360-3412-0001");
  });
});

test("el servidor revalida y la misma clave no duplica la auditoría", () => {
  const owner = admin("idem");
  const stranger = person("mandante");
  const when = new Date("2001-03-04T12:00:00.000Z");
  withFlags({ OPS_FEATURE_ENABLED: "true", OPS_OPERACION_ENABLED: "true" }, () => {
    assert.throws(() => createOperacion(stranger, body(), "203.0.113.8", when), (error: unknown) => error instanceof AppError && error.status === 403);
    const payload = body({ cliente: "  Norte  ", origen: "Santiago", destino: "  Santiago " });
    assert.throws(() => createOperacion(owner, payload, null, when), (error: unknown) => error instanceof AppError && error.status === 400);
    for (const pesoKg of [0, -4, Number.POSITIVE_INFINITY, "12500", 80_001]) {
      assert.throws(
        () => createOperacion(owner, body({ pesoKg }), null, when),
        (error: unknown) => error instanceof AppError && error.status === 400,
        `peso ${String(pesoKg)}`,
      );
    }
    assert.throws(
      () => createOperacion(owner, body({ idempotencyKey: "corta" }), null, when),
      (error: unknown) => error instanceof AppError && error.status === 400,
    );

    const ok = body({ cliente: "  Norte  " });
    const created = createOperacion(owner, ok, "203.0.113.9", when);
    assert.equal(created.operacion.cliente, "Norte");
    assert.match(created.operacion.id, /^360-0103-\d{4}$/);
    const replay = createOperacion(owner, { ...ok, cliente: "Norte" }, "203.0.113.9", new Date("2001-04-01T00:00:00.000Z"));
    assert.equal(replay.replayed, true);
    assert.equal(replay.operacion.id, created.operacion.id);
    assert.deepEqual(
      audits(created.operacion.id).map((row) => row.action),
      ["ops.operacion_creada"],
    );
    assert.equal(audits(created.operacion.id)[0]?.target_type, "operacion");
    assert.equal(audits(created.operacion.id)[0]?.actor_id, owner.id);

    assert.throws(
      () => createOperacion(owner, { ...ok, cliente: "Norte", pesoKg: 100 }, null, when),
      (error: unknown) => error instanceof AppError && error.status === 409,
    );
    const stored = getDb().prepare(`SELECT peso_kg FROM ops_operations WHERE id = ?`).get(created.operacion.id) as { peso_kg: number };
    assert.equal(stored.peso_kg, 12500);
    assert.equal(audits(created.operacion.id).length, 1);
  });
});

test("con el correlativo agotado no deja una fila a medias", () => {
  const owner = admin("tope");
  const when = new Date("2099-12-02T00:00:00.000Z");
  getDb().prepare(`INSERT INTO ops_operation_counters (periodo, ultimo) VALUES ('9912', 9999)`).run();
  withFlags({ OPS_FEATURE_ENABLED: "true", OPS_OPERACION_ENABLED: "true" }, () => {
    assert.throws(
      () => createOperacion(owner, body(), null, when),
      (error: unknown) => error instanceof AppError && error.status === 409,
    );
  });
  const counter = getDb().prepare(`SELECT ultimo FROM ops_operation_counters WHERE periodo = '9912'`).get() as { ultimo: number };
  assert.equal(counter.ultimo, 9999);
  assert.equal(MAX_CORRELATIVO, 9999);
  const agotado = getDb()
    .prepare(`SELECT action, detail FROM audit_log WHERE action = 'ops.operacion_correlativo_agotado' AND target_id = '9912'`)
    .get() as { action: string; detail: string } | undefined;
  assert.ok(agotado);
  assert.match(agotado.detail, /9999/);
  assert.match(agotado.detail, /360-YYMM-NNNN/);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_operations WHERE id LIKE '360-9912-%'`).get() as { n: number }).n, 0);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_operations WHERE length(id) > 13`).get() as { n: number }).n, 0);
});

test("el flag apagado responde 404 HTTP en la página y en la API", async () => {
  const previousMaster = process.env.OPS_FEATURE_ENABLED;
  const previousChild = process.env.OPS_OPERACION_ENABLED;
  delete process.env.OPS_FEATURE_ENABLED;
  delete process.env.OPS_OPERACION_ENABLED;
  const owner = admin("flag");
  const session = createSession(owner.id, { mfa: true });
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/admin/ops/operacion/page.tsx"), "utf8");
  assert.match(page, /notFound\(/);
  assert.match(page, /OPS_FEATURE_ENABLED/);
  assert.match(page, /OPS_OPERACION_ENABLED/);
  for (const file of ["src/app/admin/ops/page.tsx", "src/app/admin/ops/board.tsx", "src/lib/ops/panel.ts"]) {
    const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.equal(text.includes("OPS_OPERACION_ENABLED"), false, file);
    assert.equal(text.includes("ops_operations"), false, file);
  }

  const headers = { cookie: `${COOKIE_NAME}=${session}` };
  const hidden = middleware(new NextRequest("http://127.0.0.1:4317/admin/ops/operacion", { headers }));
  assert.equal(hidden.status, 404);
  assert.match(hidden.headers.get("content-type") ?? "", /text\/html/);
  const html = await hidden.text();
  assert.match(html, /No encontramos esa página/);
  assert.equal(html.includes("Cargando"), false);
  assert.equal(html.includes("Alta de operación"), false);

  const request = new Request("http://127.0.0.1:4317/api/ops/operaciones", {
    method: "POST",
    headers: {
      host: "127.0.0.1:4317",
      cookie: `${COOKIE_NAME}=${session}`,
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body()),
  });
  const denied = await postOperacion(request, { params: Promise.resolve({}) });
  assert.equal(denied.status, 404);
  assert.equal(((await denied.json()) as { error?: string }).error, "No encontrado.");

  process.env.OPS_OPERACION_ENABLED = "true";
  const childWithoutMaster = middleware(new NextRequest("http://127.0.0.1:4317/admin/ops/operacion", { headers }));
  assert.equal(childWithoutMaster.status, 404);
  process.env.OPS_FEATURE_ENABLED = "true";
  process.env.OPS_OPERACION_ENABLED = "TRUE";
  const weirdChild = middleware(new NextRequest("http://127.0.0.1:4317/admin/ops/operacion", { headers }));
  assert.equal(weirdChild.status, 404);

  process.env.OPS_OPERACION_ENABLED = "true";
  try {
    const open = middleware(new NextRequest("http://127.0.0.1:4317/admin/ops/operacion", { headers }));
    assert.notEqual(open.status, 404);
    const carrier = person("transportista");
    const outsider = middleware(
      new NextRequest("http://127.0.0.1:4317/admin/ops/operacion", { headers: { cookie: `${COOKIE_NAME}=${createSession(carrier.id)}` } }),
    );
    assert.equal(outsider.status, 404);

    const payload = body();
    const created = await postOperacion(
      new Request("http://127.0.0.1:4317/api/ops/operaciones", {
        method: "POST",
        headers: {
          host: "127.0.0.1:4317",
          cookie: `${COOKIE_NAME}=${session}`,
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(created.status, 201);
    const view = (await created.json()) as { replayed: boolean; operacion: Operacion };
    assert.equal(view.replayed, false);
    assert.equal(view.operacion.id.startsWith(`360-${periodoOperacion(new Date())}-`), true);
    const replay = await postOperacion(
      new Request("http://127.0.0.1:4317/api/ops/operaciones", {
        method: "POST",
        headers: {
          host: "127.0.0.1:4317",
          cookie: `${COOKIE_NAME}=${session}`,
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(replay.status, 200);
    const again = (await replay.json()) as { replayed: boolean; operacion: Operacion };
    assert.equal(again.replayed, true);
    assert.equal(again.operacion.id, view.operacion.id);
    assert.equal(audits(view.operacion.id).length, 1);

    const anon = await postOperacion(
      new Request("http://127.0.0.1:4317/api/ops/operaciones", {
        method: "POST",
        headers: { host: "127.0.0.1:4317", "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify(body()),
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(anon.status, 401);
    const forbidden = await postOperacion(
      new Request("http://127.0.0.1:4317/api/ops/operaciones", {
        method: "POST",
        headers: {
          host: "127.0.0.1:4317",
          cookie: `${COOKIE_NAME}=${createSession(carrier.id)}`,
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify(body()),
      }),
      { params: Promise.resolve({}) },
    );
    assert.equal(forbidden.status, 403);
  } finally {
    if (previousMaster === undefined) delete process.env.OPS_FEATURE_ENABLED;
    else process.env.OPS_FEATURE_ENABLED = previousMaster;
    if (previousChild === undefined) delete process.env.OPS_OPERACION_ENABLED;
    else process.env.OPS_OPERACION_ENABLED = previousChild;
  }
});

function archivosSrc(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return archivosSrc(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

test("v1.1: el alta nace en abierta y el resto sigue las transiciones", () => {
  assert.equal(SHIPMENT_CANCEL_PARA_AGENTES, false);
  for (const file of archivosSrc(path.join(process.cwd(), "src"))) {
    assert.equal(fs.readFileSync(file, "utf8").includes("shipment.cancel"), false, file);
  }
  assert.equal(transicionOperacionPermitida("abierta", "asignada"), false);
  assert.equal(transicionOperacionPermitida("en_asignacion", "asignada"), true);
  assert.equal(transicionOperacionPermitida("en_asignacion", "en_curso"), false);
  assert.equal(transicionOperacionPermitida("entregada", "cerrada"), true);
  assert.equal(transicionOperacionPermitida("planificada", "abierta"), false);
  const nivel2 = decidirCancelacion("abierta", false);
  const docs = decidirCancelacion("documentacion_pendiente", false);
  const nivel2b = decidirCancelacion("asignada", false);
  const nivel3 = decidirCancelacion("en_curso", true);
  const terminal = decidirCancelacion("entregada", false);
  assert.equal(nivel2.ok && nivel2.nivel === "2", true);
  assert.equal(docs.ok && docs.nivel === "2", true);
  assert.equal(nivel2b.ok && nivel2b.nivel === "2b", true);
  assert.equal(nivel3.ok && nivel3.nivel === "3", true);
  assert.equal(terminal.ok, false);

  const owner = admin("estados");
  const stranger = person("mandante");
  const when = new Date("2002-06-15T15:00:00.000Z");
  withFlags({ OPS_FEATURE_ENABLED: "true", OPS_OPERACION_ENABLED: "true" }, () => {
    const created = createOperacion(owner, body({ estado: "abierta" }), null, when);
    assert.equal(created.operacion.estado, "abierta");
    assert.throws(
      () => createOperacion(owner, body({ estado: "en_asignacion" }), null, when),
      (error: unknown) => error instanceof AppError && error.status === 403 && error.code === "POLICY_RECHAZA" && error.reglaPolicy === "transicion_no_permitida",
    );
    assert.throws(
      () => createOperacion(owner, body({ estado: "bloqueada" }), null, when),
      (error: unknown) => error instanceof AppError && error.status === 400,
    );
    const id = created.operacion.id;
    assert.throws(
      () => actualizarEstadoOperacion(stranger, id, "en_asignacion", null),
      (error: unknown) => error instanceof AppError && error.status === 403,
    );
    assert.throws(
      () => actualizarEstadoOperacion(owner, id, "asignada", null),
      (error: unknown) => error instanceof AppError && error.status === 403 && error.reglaPolicy === "transicion_no_permitida",
    );
    assert.throws(
      () => actualizarEstadoOperacion(owner, id, "bloqueada", null),
      (error: unknown) => error instanceof AppError && error.status === 403 && error.reglaPolicy === "transicion_no_permitida",
    );
    const enAsignacion = actualizarEstadoOperacion(owner, id, "en_asignacion", "203.0.113.20", {}, when);
    assert.equal(enAsignacion.estado, "en_asignacion");
    assert.equal(enAsignacion.version, 2);
    const asignada = actualizarEstadoOperacion(owner, id, "asignada", null, {}, when);
    assert.equal(asignada.estado, "asignada");
    assert.throws(
      () => actualizarEstadoOperacion(owner, id, "cancelada", null),
      (error: unknown) => error instanceof AppError && error.status === 403 && error.reglaPolicy === "confirmacion_previa",
    );
    assert.equal(
      (getDb().prepare(`SELECT estado FROM ops_operations WHERE id = ?`).get(id) as { estado: string }).estado,
      "asignada",
    );
    const cancelada = actualizarEstadoOperacion(owner, id, "cancelada", null, { confirmacionPrevia: true }, when);
    assert.equal(cancelada.estado, "cancelada");
    assert.throws(
      () => actualizarEstadoOperacion(owner, id, "abierta", null),
      (error: unknown) => error instanceof AppError && error.reglaPolicy === "transicion_no_permitida",
    );

    const conCobros = createOperacion(owner, body(), null, when);
    const avanzada = actualizarEstadoOperacion(owner, conCobros.operacion.id, "en_asignacion", null);
    actualizarEstadoOperacion(owner, avanzada.id, "asignada", null);
    assert.throws(
      () => actualizarEstadoOperacion(owner, avanzada.id, "cancelada", null, { confirmacionPrevia: true, hayCobros: true }),
      (error: unknown) => error instanceof AppError && error.status === 403 && error.code === "REQUIERE_APROBACION",
    );
    assert.equal(
      (getDb().prepare(`SELECT estado FROM ops_operations WHERE id = ?`).get(avanzada.id) as { estado: string }).estado,
      "asignada",
    );

    const docs = createOperacion(owner, body(), null, when);
    const pendiente = actualizarEstadoOperacion(owner, docs.operacion.id, "documentacion_pendiente", null);
    const cancelDocs = actualizarEstadoOperacion(owner, pendiente.id, "cancelada", null);
    assert.equal(cancelDocs.estado, "cancelada");

    const entrega = createOperacion(owner, body(), null, when);
    let actual = entrega.operacion;
    for (const paso of ["en_asignacion", "asignada", "en_curso", "entregada"] as const) {
      actual = actualizarEstadoOperacion(owner, actual.id, paso, null);
    }
    assert.equal(actual.estado, "entregada");
    assert.throws(
      () => actualizarEstadoOperacion(owner, actual.id, "cancelada", null, { confirmacionPrevia: true }),
      (error: unknown) => error instanceof AppError && error.reglaPolicy === "transicion_no_permitida",
    );
    const cerrada = actualizarEstadoOperacion(owner, actual.id, "cerrada", null);
    assert.equal(cerrada.estado, "cerrada");
  });
});
