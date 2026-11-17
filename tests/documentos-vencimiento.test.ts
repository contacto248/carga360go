import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST as postAvisos } from "../src/app/api/admin/documentos-vencimiento/avisos/route";
import { listAudit } from "../src/lib/audit";
import { registerUser } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import {
  AVISO_VENCIMIENTO_KIND,
  assertDocumentosParaCarga,
  documentoVencido,
  documentosPageHidden,
  evaluateAvisosVencimiento,
  requisitosPorFaena,
} from "../src/lib/documentos-vencimiento";
import { daysBetween, rutDv, todayChile } from "../src/lib/format";
import { acceptOffer } from "../src/lib/offers";
import { ensureShipmentForLoad } from "../src/lib/ops/shipments";
import { middleware } from "../src/middleware";
import type { PublicUser } from "../src/lib/types";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

let seq = 91_000_000;

function rut() {
  seq += 1;
  const body = String(seq);
  return `${body}-${rutDv(body)}`;
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function instantInSantiago(isoDate: string, hour: number, minute: number): Date {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const start = Date.parse(`${isoDate}T00:00:00Z`) - 20 * 3600_000;
  for (let t = start; t < start + 56 * 3600_000; t += 60_000) {
    const date = new Date(t);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    if (`${get("year")}-${get("month")}-${get("day")}` === isoDate && get("hour") === hh && get("minute") === mm) return date;
  }
  throw new Error(`sin instante ${isoDate} ${hh}:${mm}`);
}

function person(role: "mandante" | "transportista", tag: string): PublicUser {
  return registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: tag,
    email: `${tag}-${seq}@docs-vence.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 6111 2345",
    city: "Santiago",
  }).user;
}

function truck(ownerId: string) {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO trucks (id, owner_id, origin, destination, available_from, available_to, equipment, tonnage, specs_json, is_demo, created_at, updated_at)
       VALUES (?, ?, 'Santiago', 'Valparaíso', '2020-01-01', '2099-12-31', 'sider', 28, '{}', 0, ?, ?)`,
    )
    .run(id, ownerId, stamp, stamp);
  return id;
}

function carga(ownerId: string) {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO loads (
        id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, specs_json,
        is_demo, created_at, updated_at, status
      ) VALUES (?, ?, 'Santiago', 'Valparaíso', ?, 'sider', 'Documentos', 12, '{}', 0, ?, ?, 'abierta')`,
    )
    .run(id, ownerId, addDays(todayChile(), 2), stamp, stamp);
  return id;
}

function oferta(loadId: string, carrierId: string, truckId: string) {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO offers (id, load_id, carrier_id, truck_id, price_clp, pickup_date, status, revisions, created_at, updated_at)
       VALUES (?, ?, ?, ?, 100000, ?, 'activa', 0, ?, ?)`,
    )
    .run(id, loadId, carrierId, truckId, addDays(todayChile(), 2), stamp, stamp);
  return id;
}

function documento(input: { sujeto: "conductor" | "vehiculo"; sujetoId: string; tipo: string; venceEl: string; verificacion: string; verificadoPor?: string | null }) {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO documentos_vencimiento (
        id, sujeto, sujeto_id, tipo, numero, vence_el, verificacion, verificado_por, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.sujeto, input.sujetoId, input.tipo, input.venceEl, input.verificacion, input.verificadoPor ?? null, stamp, stamp);
  return id;
}

function escena(tag: string) {
  const mandante = person("mandante", `${tag}-manda`);
  const carrier = person("transportista", `${tag}-trans`);
  const truckId = truck(carrier.id);
  const loadId = carga(mandante.id);
  const offerId = oferta(loadId, carrier.id, truckId);
  return { mandante, carrier, truckId, loadId, offerId };
}

async function withFlag<T>(value: string | undefined, run: () => Promise<T> | T): Promise<T> {
  const previous = process.env.DOCS_VENCIMIENTO_ENABLED;
  try {
    if (value === undefined) delete process.env.DOCS_VENCIMIENTO_ENABLED;
    else process.env.DOCS_VENCIMIENTO_ENABLED = value;
    return await run();
  } finally {
    if (previous === undefined) delete process.env.DOCS_VENCIMIENTO_ENABLED;
    else process.env.DOCS_VENCIMIENTO_ENABLED = previous;
  }
}

test("solo el texto true enciende el flag y la página nueva responde 404", async () => {
  assert.equal(documentosPageHidden("/admin/documentos-vencimiento", {}), true);
  assert.equal(documentosPageHidden("/admin/documentos-vencimiento/", { DOCS_VENCIMIENTO_ENABLED: "TRUE" }), true);
  assert.equal(documentosPageHidden("/admin/documentos-vencimiento", { DOCS_VENCIMIENTO_ENABLED: "1" }), true);
  assert.equal(documentosPageHidden("/admin/documentos-vencimiento", { DOCS_VENCIMIENTO_ENABLED: " true" }), true);
  assert.equal(documentosPageHidden("/admin", { DOCS_VENCIMIENTO_ENABLED: undefined }), false);
  assert.equal(documentosPageHidden("/admin/documentos-vencimiento", { DOCS_VENCIMIENTO_ENABLED: "true" }), false);

  const previous = process.env.DOCS_VENCIMIENTO_ENABLED;
  try {
    for (const value of [undefined, "false", "TRUE", "1", "yes", " true"]) {
      if (value === undefined) delete process.env.DOCS_VENCIMIENTO_ENABLED;
      else process.env.DOCS_VENCIMIENTO_ENABLED = value;
      const response = await middleware(new NextRequest("http://127.0.0.1:4317/admin/documentos-vencimiento"));
      assert.equal(response.status, 404, String(value));
      assert.match(await response.text(), /No encontramos esa página/);
      const api = await postAvisos();
      assert.equal(api.status, 404, String(value));
    }
    delete process.env.DOCS_VENCIMIENTO_ENABLED;
    const page = (await import("../src/app/admin/documentos-vencimiento/page")).default;
    await assert.rejects(
      () => page(),
      (error: unknown) => {
        const text = error instanceof Error ? `${error.message} ${String((error as { digest?: string }).digest ?? "")}` : String(error);
        return text.includes("404");
      },
    );
    process.env.DOCS_VENCIMIENTO_ENABLED = "true";
    const open = await middleware(new NextRequest("http://127.0.0.1:4317/admin/documentos-vencimiento"));
    assert.notEqual(open.status, 404);
    const home = await middleware(new NextRequest("http://127.0.0.1:4317/contacto"));
    assert.notEqual(home.status, 404);
  } finally {
    if (previous === undefined) delete process.env.DOCS_VENCIMIENTO_ENABLED;
    else process.env.DOCS_VENCIMIENTO_ENABLED = previous;
  }
});

test("vence hoy y mañana no bloquean; vencido ayer y sin verificar sí, en America/Santiago", async () => {
  const late = instantInSantiago("2026-11-17", 23, 30);
  const early = instantInSantiago("2026-11-18", 0, 30);
  assert.equal(todayChile(late), "2026-11-17");
  assert.equal(todayChile(early), "2026-11-18");
  assert.equal(documentoVencido("2026-11-17", late), false);
  assert.equal(documentoVencido("2026-11-18", late), false);
  assert.equal(documentoVencido("2026-11-16", late), true);
  assert.equal(documentoVencido("2026-11-17", early), true);

  const borde = escena("borde");
  documento({ sujeto: "conductor", sujetoId: borde.carrier.id, tipo: "licencia", venceEl: "2026-11-17", verificacion: "verificado", verificadoPor: borde.mandante.id });
  await withFlag("true", () => {
    assert.doesNotThrow(() =>
      assertDocumentosParaCarga({ accion: "aceptar", carrierId: borde.carrier.id, truckId: borde.truckId, actor: borde.mandante, loadId: borde.loadId, now: late }),
    );
    assert.throws(
      () => assertDocumentosParaCarga({ accion: "aceptar", carrierId: borde.carrier.id, truckId: borde.truckId, actor: borde.mandante, loadId: borde.loadId, now: early }),
      /vencido/,
    );
  });

  const hoy = todayChile();
  const vigente = escena("hoy");
  documento({ sujeto: "conductor", sujetoId: vigente.carrier.id, tipo: "licencia", venceEl: hoy, verificacion: "verificado", verificadoPor: vigente.mandante.id });
  documento({ sujeto: "vehiculo", sujetoId: vigente.truckId, tipo: "soap", venceEl: addDays(hoy, 1), verificacion: "verificado", verificadoPor: vigente.mandante.id });
  await withFlag("true", async () => {
    const accepted = await acceptOffer(vigente.mandante, vigente.offerId, { notify: false });
    assert.equal(accepted?.status, "aceptada");
  });

  const manana = escena("manana");
  documento({ sujeto: "conductor", sujetoId: manana.carrier.id, tipo: "curso_seguridad", venceEl: addDays(hoy, 1), verificacion: "verificado", verificadoPor: manana.mandante.id });
  await withFlag("true", async () => {
    assert.equal((await acceptOffer(manana.mandante, manana.offerId, { notify: false }))?.status, "aceptada");
  });

  const ayer = escena("ayer");
  documento({ sujeto: "vehiculo", sujetoId: ayer.truckId, tipo: "revision_tecnica", venceEl: addDays(hoy, -1), verificacion: "verificado", verificadoPor: ayer.mandante.id });
  await withFlag("true", async () => {
    await assert.rejects(() => acceptOffer(ayer.mandante, ayer.offerId, { notify: false }), /No se puede aceptar la carga/);
  });
  assert.equal((getDb().prepare(`SELECT status FROM loads WHERE id = ?`).get(ayer.loadId) as { status: string }).status, "abierta");
  const audited = listAudit(50).find((entry) => entry.action === "carga.documento_bloquea" && entry.targetId === ayer.loadId);
  assert.ok(audited);
  assert.match(audited?.detail ?? "", /revision_tecnica|vencido/);

  const sucio = escena("sucio");
  documento({ sujeto: "vehiculo", sujetoId: sucio.truckId, tipo: "permiso_circulacion", venceEl: addDays(hoy, 1), verificacion: "pendiente" });
  documento({ sujeto: "vehiculo", sujetoId: sucio.truckId, tipo: "seguro", venceEl: addDays(hoy, 40), verificacion: "rechazado" });
  await withFlag("true", async () => {
    await assert.rejects(() => acceptOffer(sucio.mandante, sucio.offerId, { notify: false }), /sin verificar/);
  });
});

test("apagado no bloquea y la lista por faena vacía no inventa requisitos", async () => {
  assert.deepEqual(requisitosPorFaena("Faena Norte"), []);
  const libre = escena("libre");
  await withFlag("true", async () => {
    assert.equal((await acceptOffer(libre.mandante, libre.offerId, { notify: false }))?.status, "aceptada");
  });

  const configurada = escena("faena");
  const stamp = new Date().toISOString();
  getDb().prepare(`INSERT INTO documentos_faena (faena, tipo, created_at) VALUES ('Faena Norte', 'soap', ?)`).run(stamp);
  assert.deepEqual(requisitosPorFaena("Faena Norte"), [{ faena: "Faena Norte", tipo: "soap" }]);
  await withFlag("true", async () => {
    assert.equal((await acceptOffer(configurada.mandante, configurada.offerId, { notify: false }))?.status, "aceptada");
  });
  getDb().prepare(`DELETE FROM documentos_faena WHERE faena = 'Faena Norte'`).run();

  const vencido = escena("off");
  documento({ sujeto: "conductor", sujetoId: vencido.carrier.id, tipo: "licencia", venceEl: addDays(todayChile(), -1), verificacion: "verificado", verificadoPor: vencido.mandante.id });
  for (const value of [undefined, "TRUE", "1", "false"]) {
    const copia = value === undefined ? vencido : escena(`off-${value}`);
    if (value !== undefined) {
      documento({
        sujeto: "conductor",
        sujetoId: copia.carrier.id,
        tipo: "licencia",
        venceEl: addDays(todayChile(), -1),
        verificacion: "verificado",
        verificadoPor: copia.mandante.id,
      });
    }
    await withFlag(value, async () => {
      assert.equal((await acceptOffer(copia.mandante, copia.offerId, { notify: false }))?.status, "aceptada");
    });
  }

  assert.throws(() => documento({ sujeto: "vehiculo", sujetoId: vencido.truckId, tipo: "licencia", venceEl: addDays(todayChile(), 10), verificacion: "pendiente" }));
});

test("los avisos de 30, 15 y 7 días son un kind de ops y no salen por correo", async () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/documentos-vencimiento.ts"), "utf8");
  assert.doesNotMatch(src, /sendEmail|sendWhatsapp|nodemailer/);
  assert.equal(fs.readFileSync(path.join(process.cwd(), "src/lib/ops/alerts.ts"), "utf8").includes(AVISO_VENCIMIENTO_KIND), false);
  const guard = src.slice(src.indexOf("export function assertDocumentosParaCarga"), src.indexOf("type Aviso"));
  assert.equal(guard.includes("documentos_faena"), false);

  const data = escena("aviso");
  ensureShipmentForLoad(data.loadId, data.mandante);
  const base = "2026-11-17";
  assert.equal(daysBetween(base, "2026-12-17"), 30);
  assert.equal(daysBetween(base, "2026-12-02"), 15);
  assert.equal(daysBetween(base, "2026-11-24"), 7);
  const licencia = documento({ sujeto: "conductor", sujetoId: data.carrier.id, tipo: "licencia", venceEl: "2026-12-17", verificacion: "verificado", verificadoPor: data.mandante.id });
  const soap = documento({ sujeto: "vehiculo", sujetoId: data.truckId, tipo: "soap", venceEl: "2026-12-02", verificacion: "verificado", verificadoPor: data.mandante.id });
  const outbox = process.env.MAIL_OUTBOX ?? "";
  const before = fs.existsSync(outbox) ? fs.readdirSync(outbox).length : 0;
  const noon = instantInSantiago(base, 12, 0);
  const first = await withFlag("true", () => evaluateAvisosVencimiento(noon, data.mandante));
  assert.equal(first.reviewed, 2);
  assert.equal(first.opened, 1);
  const after = fs.existsSync(outbox) ? fs.readdirSync(outbox).length : 0;
  assert.equal(after, before);
  const open = getDb()
    .prepare(`SELECT kind, status, evidence_json FROM ops_alerts WHERE shipment_id = (SELECT id FROM ops_shipments WHERE load_id = ?) AND status = 'abierta'`)
    .all(data.loadId) as { kind: string; status: string; evidence_json: string }[];
  assert.equal(open.length, 1);
  assert.equal(open[0].kind, AVISO_VENCIMIENTO_KIND);
  const evidence = JSON.parse(open[0].evidence_json) as { audiencia: string[]; avisos: { documentoId: string; dias: number; transportistaId: string; clienteId: string }[] };
  assert.deepEqual(evidence.audiencia, ["transportista", "cliente"]);
  assert.deepEqual(
    evidence.avisos.map((item) => item.documentoId).sort(),
    [licencia, soap].sort(),
  );
  assert.ok(evidence.avisos.every((item) => item.transportistaId === data.carrier.id && item.clienteId === data.mandante.id));
  assert.deepEqual(evidence.avisos.map((item) => item.dias).sort(), [15, 30]);

  const nextDay = await withFlag("true", () => evaluateAvisosVencimiento(instantInSantiago("2026-11-18", 12, 0)));
  assert.equal(nextDay.opened, 0);
  assert.equal(nextDay.closed, 1);

  getDb().prepare(`UPDATE documentos_vencimiento SET vence_el = '2026-11-24' WHERE id = ?`).run(licencia);
  getDb().prepare(`DELETE FROM documentos_vencimiento WHERE id = ?`).run(soap);
  const week = await withFlag("true", () => evaluateAvisosVencimiento(noon));
  assert.equal(week.opened, 1);
  assert.equal(week.reviewed, 1);
  const again = getDb()
    .prepare(`SELECT kind FROM ops_alerts WHERE shipment_id = (SELECT id FROM ops_shipments WHERE load_id = ?) AND status = 'abierta'`)
    .all(data.loadId) as { kind: string }[];
  assert.deepEqual(again.map((row) => row.kind), [AVISO_VENCIMIENTO_KIND]);

  await withFlag(undefined, () => {
    const quiet = evaluateAvisosVencimiento(noon);
    assert.deepEqual(quiet, { reviewed: 0, opened: 0, closed: 0 });
  });
});
