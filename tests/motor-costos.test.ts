import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
process.env.COSTOS_API_KEYS = "agente_voz:clave-agente-voz-de-prueba-123456,match:clave-match-de-prueba-1234567890";
process.env.COSTOS_CRON_SECRET = "secreto-cron-de-prueba-0123456789abcdef";

import { GET as getEstimacion } from "../src/app/api/estimacion/route";
import { POST as postCotizacionPublica } from "../src/app/api/cotizaciones/route";
import { POST as postCotizar } from "../src/app/api/costos/cotizar/route";
import { POST as postCron } from "../src/app/api/costos/cron/route";
import { PUT as putParametros } from "../src/app/api/admin/costos/parametros/route";
import { PATCH as patchCotizacion } from "../src/app/api/admin/costos/cotizaciones/[id]/route";
import { createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { listAudit } from "../src/lib/audit";
import { getDb } from "../src/lib/db";
import { parseZonalCsv, refreshDiesel, resolveDiesel } from "../src/lib/costos/diesel";
import { planDriving } from "../src/lib/costos/driving-rules";
import { computeQuote, publicView, quote, quoteFromCache } from "../src/lib/costos/engine";
import { costHintFor } from "../src/lib/costos/hint";
import { decodePolyline, encodePolyline } from "../src/lib/costos/geometry";
import { setCostosFetch } from "../src/lib/costos/http";
import { getParams, saveParams } from "../src/lib/costos/params";
import { getQuote, setQuoteStatus } from "../src/lib/costos/quotes";
import { refreshTollSources } from "../src/lib/costos/tolls";
import { TOLL_PLAZAS, TOLL_SOURCES } from "../src/lib/costos/tolls-data";
import { AppError } from "../src/lib/errors";
import { rutDv } from "../src/lib/format";
import { resetRateLimits } from "../src/lib/rate-limit";
import { saveSettings } from "../src/lib/settings";
import { costForMatch } from "../src/lib/costos/match";
import { matchLoadsForTruck, matchTrucksForLoad } from "../src/lib/match";

const FIX = path.join(__dirname, "fixtures", "costos");
const OSRM = fs.readFileSync(path.join(FIX, "osrm-antofagasta-santiago.json"), "utf8");
const CSV = fs.readFileSync(path.join(FIX, "bencina-export-zonal-2026-11-14.csv"), "utf8");
const NOW = new Date("2026-11-14T12:00:00.000Z");

type Mode = { osrm: "ok" | "fail"; diesel: "ok" | "fail"; pdf: "same" | "changed" | "fail" };
const mode: Mode = { osrm: "ok", diesel: "ok", pdf: "same" };
const calls: string[] = [];
const pdfBytes = (url: string) => `pdf:${url}`;
setCostosFetch(async (url: string) => {
  calls.push(url);
  if (url.includes("router.project-osrm.org")) {
    if (mode.osrm === "fail") throw new Error("ECONNREFUSED");
    return new Response(OSRM, { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("bencinaenlinea")) {
    if (mode.diesel === "fail") return new Response("error", { status: 503 });
    return new Response(CSV, { status: 200 });
  }
  if (url.includes("concesiones.mop.gob.cl")) {
    if (mode.pdf === "fail") return new Response("x", { status: 500 });
    return new Response(mode.pdf === "same" ? pdfBytes(url) : `${pdfBytes(url)}-nuevo`, { status: 200 });
  }
  throw new Error(`URL no esperada en prueba: ${url}`);
});
// Las huellas de los PDF en la base de prueba se alinean al contenido simulado ("same").
function alignPdfHashes() {
  for (const s of TOLL_SOURCES) {
    const hash = createHash("sha256").update(pdfBytes(s.url)).digest("hex");
    getDb().prepare(`UPDATE cost_sources SET expected_sha256 = ?, status = 'ok', last_error = NULL WHERE id = ?`).run(hash, s.id);
  }
}

let seq = 41_000_000;
function nextRut() {
  seq += 1;
  return `${seq}-${rutDv(String(seq))}`;
}
const adminUser = () =>
  upsertAdmin({ email: "admin-costos@test.cl", password: "Admin-Clave-Larga-2026", razonSocial: "Admin Costos", rut: "22.222.222-2", contactName: "Admin", whatsapp: "+56 9 1000 0010", city: "Santiago" });
function adminCookie() {
  return `c360_session=${createSession(adminUser().id, { mfa: true })}`;
}
function headers(extra: Record<string, string> = {}) {
  return new Headers({ "content-type": "application/json", "sec-fetch-site": "same-origin", host: "127.0.0.1:4317", "x-real-ip": "203.0.113.10", ...extra });
}
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

async function seedDiesel(at: Date) {
  mode.diesel = "ok";
  await refreshDiesel();
  getDb().prepare(`UPDATE cost_diesel_prices SET fetched_at = ?`).run(at.toISOString());
}

test("art. 25 bis: bloques de 5 h, descanso de 2 h y 8 h ininterrumpidas cada 24 h", () => {
  const plan = planDriving(21.8, 4);
  const blocks = plan.timeline.filter((t) => t.kind === "manejo");
  assert.ok(blocks.every((b) => b.hours <= 5));
  assert.equal(Math.round(blocks.reduce((s, b) => s + b.hours, 0) * 10) / 10, 21.8);
  assert.ok(plan.dailyRests >= 1, "un viaje de 21,8 h de manejo exige al menos un descanso de 8 h");
  // Ninguna jornada entre descansos de 8 h supera 16 h.
  let span = 0;
  for (const t of plan.timeline) {
    if (t.kind === "descanso_diario") span = 0;
    else span += t.hours;
    assert.ok(span <= 16 + 1e-9);
  }
  assert.ok(plan.serviceDays >= 2);
  const short = planDriving(3, 0);
  assert.deepEqual(short.timeline, [{ kind: "manejo", hours: 3 }]);
  const seven = planDriving(7, 0);
  assert.deepEqual(seven.timeline.map((t) => t.kind), ["manejo", "descanso", "manejo"]);
  assert.equal(seven.timeline[1].hours, 2);
});

test("geometría: polilínea de precisión 6 ida y vuelta", () => {
  const pts: [number, number][] = [
    [-70.4, -23.65],
    [-70.123456, -25.654321],
    [-70.67, -33.45],
  ];
  const back = decodePolyline(encodePolyline(pts, 6), 6);
  back.forEach((p, i) => {
    assert.ok(Math.abs(p[0] - pts[i][0]) < 1e-6 && Math.abs(p[1] - pts[i][1]) < 1e-6);
  });
});

test("diésel: el CSV zonal de la CNE se lee por zona", () => {
  const rows = parseZonalCsv(CSV);
  assert.deepEqual(rows.map((r) => r.zone).sort(), ["Metropolitana", "Zona Centro", "Zona Norte", "Zona Sur"]);
  assert.equal(rows.find((r) => r.zone === "Zona Norte")?.price, 1675.77);
});

test("migración 16: tablas creadas y peajes oficiales cargados con fuente y vigencia", () => {
  const db = getDb();
  assert.ok(db.prepare(`SELECT 1 FROM schema_migrations WHERE version = 16`).get());
  const plazas = db.prepare(`SELECT COUNT(*) AS n FROM cost_toll_plazas`).get() as { n: number };
  assert.equal(plazas.n, TOLL_PLAZAS.length);
  const rates = db.prepare(`SELECT * FROM cost_toll_rates`).all() as { amount: number; valid_to: string; source_id: string }[];
  assert.ok(rates.length > 30);
  assert.ok(rates.every((r) => r.amount > 0 && r.valid_to === "2026-12-31" && r.source_id.startsWith("mop_")));
  // Plaza sin tarifa emparejable: cargada sin tarifas (queda PENDIENTE, no se inventa).
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM cost_toll_rates WHERE plaza_id = 'cn_p04_vivaceta'`).get() as { n: number }).n, 0);
});

test("cotización Antofagasta–Santiago: ruta real, peajes por categoría de ejes y combustible con fuente", async () => {
  resetRateLimits();
  alignPdfHashes();
  await seedDiesel(new Date(NOW.getTime() - 3600_000));
  const two = await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: "camion_2_ejes" }, NOW);
  const five = await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: "tracto_semirremolque_5_ejes" }, NOW);
  for (const q of [two, five]) {
    assert.equal(q.method, "motor");
    assert.ok(q.route && q.route.km > 1300 && q.route.km < 1420, `km ${q.route?.km}`);
    assert.match(q.route!.viaLabel ?? "", /Ruta 5/);
    assert.equal(q.diesel?.zone, "Zona Norte");
    assert.equal(q.diesel?.priceGross, 1675.8);
    assert.equal(q.diesel?.status, "verificado");
    assert.ok(q.totals.complete);
  }
  const names = two.tolls.map((t) => t.plazaId);
  for (const id of ["puerto_viejo", "totoral", "cachiyuyo", "punta_colorada", "elqui_troncal_norte", "elqui_troncal_sur", "pichidangui", "las_vegas", "lampa"]) {
    assert.ok(names.includes(id), `falta ${id}`);
  }
  const pv2 = two.tolls.find((t) => t.plazaId === "puerto_viejo")!;
  const pv5 = five.tolls.find((t) => t.plazaId === "puerto_viejo")!;
  assert.equal(pv2.amountGross, 5200);
  assert.equal(pv5.amountGross, 6900);
  assert.equal(two.tolls.find((t) => t.plazaId === "lo_pinto")?.category, "camion_sin_remolque");
  assert.equal(five.tolls.find((t) => t.plazaId === "lo_pinto")?.category, "camion_con_remolque");
  const peajes = (q: typeof two) => q.components.find((c) => c.key === "peajes")!.amount!;
  assert.ok(peajes(five) > peajes(two), "un 5 ejes no paga lo mismo que un 2 ejes");
  // Orden de paso norte → sur.
  assert.ok(names.indexOf("puerto_viejo") < names.indexOf("lampa"));
  // Fórmula: costo base = suma de obligatorios + operacionales; IVA 19 % sobre neto.
  const sum = five.components.filter((c) => c.group === "obligatorio" || c.group === "operacional").reduce((s, c) => s + (c.amount ?? 0), 0);
  assert.equal(five.totals.costoBase, sum);
  assert.equal(five.totals.margen, 0);
  assert.equal(five.totals.iva, Math.round(five.totals.precioNeto * 0.19));
  // Litros: km / rendimiento cargado.
  assert.equal(five.diesel!.kmPerL, 2.6);
  assert.ok(Math.abs(five.diesel!.liters - five.route!.km / 2.6) < 0.2);
  // Segunda consulta usa caché (OSRM no se vuelve a llamar).
  const before = calls.filter((c) => c.includes("osrm")).length;
  await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: "camion_2_ejes" }, NOW);
  assert.equal(calls.filter((c) => c.includes("osrm")).length, before);
});

test("diésel: último valor dentro de vigencia se usa con advertencia; vencido deja el combustible PENDIENTE", async () => {
  await seedDiesel(new Date(NOW.getTime() - 3 * 86_400_000));
  const stale = resolveDiesel("Zona Norte", 30, 7, NOW);
  assert.equal(stale.status, "verificado");
  assert.match(stale.warning ?? "", /Último valor verificado/);
  getDb().prepare(`UPDATE cost_diesel_prices SET fetched_at = ?`).run(new Date(NOW.getTime() - 9 * 86_400_000).toISOString());
  const q = await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: "camion_2_ejes" }, NOW);
  const fuel = q.components.find((c) => c.key === "combustible")!;
  assert.equal(fuel.amount, null);
  assert.equal(fuel.status, "vencido");
  assert.equal(q.totals.complete, false);
  assert.ok(q.totals.pending.includes("combustible"));
  // Fuente caída: no se inventa un valor nuevo; el histórico queda igual y la fuente marca error.
  mode.diesel = "fail";
  const n = (getDb().prepare(`SELECT COUNT(*) AS n FROM cost_diesel_prices`).get() as { n: number }).n;
  const out = await refreshDiesel();
  assert.match(out.find((o) => o.id === "bencina_en_linea_zonal")!.result, /error/);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM cost_diesel_prices`).get() as { n: number }).n, n);
  assert.equal(out.find((o) => o.id === "cne_api_v4")!.result, "no conectado");
  await seedDiesel(new Date(NOW.getTime() - 3600_000));
});

test("peajes: documento oficial cambiado o tarifa fuera de vigencia nunca se presentan como verificados", async () => {
  alignPdfHashes();
  mode.pdf = "same";
  assert.ok((await refreshTollSources()).every((r) => r.result === "sin cambios"));
  mode.pdf = "changed";
  await refreshTollSources();
  const q = await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: "camion_2_ejes" }, NOW);
  assert.match(q.tolls[0].note, /cambio_detectado/);
  mode.pdf = "fail";
  const failed = await refreshTollSources();
  assert.ok(failed.every((r) => r.result.startsWith("error")));
  // En 2027 la tarifa 2026 ya no rige: VENCIDO y peajes PENDIENTE.
  const next = await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: "camion_2_ejes" }, new Date("2027-01-05T12:00:00Z"));
  assert.ok(next.tolls.every((t) => t.status === "vencido" || t.status === "pendiente"));
  assert.equal(next.components.find((c) => c.key === "peajes")!.status, "pendiente");
  mode.pdf = "same";
  alignPdfHashes();
});

test("sin ruta disponible: respaldo con el cálculo antiguo, marcado como tal", async () => {
  mode.osrm = "fail";
  const q = await quote({ origin: "Antofagasta", destination: "Calama", equipment: "rampla_plana" }, NOW);
  mode.osrm = "ok";
  assert.equal(q.method, "respaldo_linea_recta");
  assert.ok(q.fallback && q.fallback.min > 0);
  assert.match(q.warnings.join(" "), /respaldo/);
  assert.equal(q.totals.complete, false);
});

test("parámetros: cada cambio queda en la auditoría con valor anterior y nuevo; el margen no sale en la vista pública", async () => {
  resetRateLimits();
  const admin = adminUser();
  assert.throws(() => saveParams(admin, { margenPct: 500 }), (e: unknown) => e instanceof AppError);
  assert.throws(() => saveParams(admin, { noExiste: 1 }), (e: unknown) => e instanceof AppError);
  const response = await putParametros(
    new Request("http://127.0.0.1:4317/api/admin/costos/parametros", {
      method: "PUT",
      headers: headers({ cookie: adminCookie() }),
      body: JSON.stringify({ cambios: { margenPct: 12, "vehiculo.camion_2_ejes.rendCargadoKmL": 4 } }),
    }),
    ctx(),
  );
  assert.equal(response.status, 200);
  const entries = listAudit(50).filter((a) => a.action === "costos.parametro");
  const margin = entries.find((a) => a.targetId === "margenPct")!;
  assert.deepEqual(JSON.parse(margin.detail!), { parametro: "margenPct", anterior: 0, nuevo: 12 });
  assert.equal(margin.actorEmail, "admin-costos@test.cl");
  const rend = entries.find((a) => a.targetId === "vehiculo.camion_2_ejes.rendCargadoKmL")!;
  assert.deepEqual(JSON.parse(rend.detail!), { parametro: "vehiculo.camion_2_ejes.rendCargadoKmL", anterior: 4.2, nuevo: 4 });
  const q = await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: "camion_2_ejes" }, NOW);
  assert.equal(q.totals.margen, Math.round(q.totals.costoBase * 0.12));
  const view = publicView(q, true);
  assert.ok(!JSON.stringify(view).toLowerCase().includes("margen"));
  assert.equal(view.costoBase, q.totals.costoBase);
  // Un usuario no administrador no puede cambiar parámetros.
  const user = registerUser({ role: "mandante", email: "m-costos@test.cl", password: "clave-segura-costos-1", razonSocial: "Mandante Costos SpA", rut: nextRut(), contactName: "Prueba Costos", whatsapp: "+56 9 2222 3333", city: "Santiago" }).user;
  const denied = await putParametros(
    new Request("http://127.0.0.1:4317/api/admin/costos/parametros", { method: "PUT", headers: headers({ cookie: `c360_session=${createSession(user.id)}` }), body: JSON.stringify({ cambios: { margenPct: 1 } }) }),
    ctx(),
  );
  assert.equal(denied.status, 403);
  saveParams(admin, { margenPct: 0, "vehiculo.camion_2_ejes.rendCargadoKmL": 4.2 });
});

test("el costo es el mismo en cotizador, publicación de cargas, panel de administración y API del agente", async () => {
  resetRateLimits();
  saveSettings({ showSuggestedPrice: true });
  const expected = (await quote({ origin: "Antofagasta", destination: "Santiago", equipment: "rampla_plana", weightT: 20 })).totals.costoBase;
  // Cotizador y asistente de publicación (GET /api/estimacion).
  const est = await getEstimacion(new Request("http://127.0.0.1:4317/api/estimacion?origen=Antofagasta&destino=Santiago&equipo=rampla_plana&peso=20", { headers: headers() }), ctx());
  const estBody = (await est.json()) as { costo: { costoBase: number } };
  // Solicitud pública del cotizador (POST /api/cotizaciones) → borrador en el panel.
  const pub = await postCotizacionPublica(
    new Request("http://127.0.0.1:4317/api/cotizaciones", { method: "POST", headers: headers(), body: JSON.stringify({ origen: "Antofagasta", destino: "Santiago", equipo: "rampla_plana", pesoT: 20 }) }),
    ctx(),
  );
  const pubBody = (await pub.json()) as { id: string; costo: { costoBase: number } };
  // API del agente de voz.
  const api = await postCotizar(
    new Request("http://127.0.0.1:4317/api/costos/cotizar", {
      method: "POST",
      headers: headers({ "x-costos-key": "clave-agente-voz-de-prueba-123456" }),
      body: JSON.stringify({ origen: "Antofagasta", destino: "Santiago", equipo: "rampla_plana", pesoT: 20 }),
    }),
    ctx(),
  );
  const apiBody = (await api.json()) as { id: string; estado: string; cotizacion: { costoBase: number } };
  // Tarjetas de cargas publicadas (sin red, desde caché).
  const hint = costHintFor({ origin: "Antofagasta", destination: "Santiago", equipment: "rampla_plana", weightT: 20 });
  const cached = quoteFromCache({ origin: "Antofagasta", destination: "Santiago", equipment: "rampla_plana", weightT: 20 });
  // Panel de administración (cotización guardada).
  const stored = getQuote(apiBody.id)!;
  assert.equal(estBody.costo.costoBase, expected);
  assert.equal(pubBody.costo.costoBase, expected);
  assert.equal(apiBody.cotizacion.costoBase, expected);
  assert.equal(apiBody.estado, "borrador");
  assert.equal(cached?.totals.costoBase, expected);
  assert.equal(stored.parsed.totals.costoBase, expected);
  assert.equal(stored.base_cost, expected);
  assert.equal(getQuote(pubBody.id)!.base_cost, expected);
  assert.equal(hint?.total, Math.round(expected * 1.19));
  saveSettings({ showSuggestedPrice: false });
});

test("vista pública: con la opción apagada (por defecto) no se muestran montos", async () => {
  resetRateLimits();
  saveSettings({ showSuggestedPrice: false });
  const res = await getEstimacion(new Request("http://127.0.0.1:4317/api/estimacion?origen=Antofagasta&destino=Santiago&equipo=rampla_plana", { headers: headers() }), ctx());
  const body = (await res.json()) as { km: number; costo: { costoTotal: number | null; components: { amount: number | null }[]; notice: string; showAmount: boolean } };
  assert.ok(body.km > 1300);
  assert.equal(body.costo.showAmount, false);
  assert.equal(body.costo.costoTotal, null);
  assert.ok(body.costo.components.every((c) => c.amount === null));
  assert.equal(body.costo.notice, "Precio referencial sujeto a revisión; el precio final lo acuerdan las partes.");
});

test("rango público: desactivado por defecto; se activa solo con el parámetro y queda auditado", async () => {
  const admin = adminUser();
  const result = await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: "camion_2_ejes", weightT: null });
  assert.equal(getParams().rangoPublicoPct, 0);
  assert.equal(publicView(result, true).rango, null);
  saveParams(admin, { rangoPublicoPct: 10 }, "127.0.0.1");
  const view = publicView(result, true);
  assert.ok(view.rango && view.costoTotal);
  assert.equal(view.rango.min, Math.round(view.costoTotal * 0.9));
  assert.equal(view.rango.max, Math.round(view.costoTotal * 1.1));
  assert.equal(publicView(result, false).rango, null);
  assert.ok(listAudit(50).some((e) => e.action === "costos.parametro" && JSON.stringify(e).includes("rangoPublicoPct")));
  saveParams(admin, { rangoPublicoPct: 0 }, "127.0.0.1");
});

test("revisión: borrador → revisada → enviada, auditada; enviar exige cotización completa; solo administradores", async () => {
  resetRateLimits();
  const admin = adminUser();
  const res = await postCotizar(
    new Request("http://127.0.0.1:4317/api/costos/cotizar", { method: "POST", headers: headers({ cookie: adminCookie() }), body: JSON.stringify({ origen: "Antofagasta", destino: "Santiago", vehiculo: "camion_2_ejes" }) }),
    ctx(),
  );
  assert.equal(res.status, 200);
  const { id } = (await res.json()) as { id: string };
  assert.throws(() => setQuoteStatus(admin, id, "enviada", ""), (e: unknown) => e instanceof AppError);
  const patch = (estado: string, cookie: string) =>
    patchCotizacion(new Request(`http://127.0.0.1:4317/api/admin/costos/cotizaciones/${id}`, { method: "PATCH", headers: headers({ cookie }), body: JSON.stringify({ estado, nota: "ok" }) }), ctx({ id }));
  assert.equal((await patch("revisada", adminCookie())).status, 200);
  assert.equal((await patch("enviada", adminCookie())).status, 200);
  assert.equal(getQuote(id)!.status, "enviada");
  assert.ok(listAudit(50).some((a) => a.action === "costos.cotizacion_estado" && a.targetId === id && JSON.parse(a.detail!).nuevo === "enviada"));
  // Incompleta (sin diésel vigente): no se puede marcar enviada.
  getDb().prepare(`UPDATE cost_diesel_prices SET fetched_at = ?`).run("2020-01-01T00:00:00.000Z");
  const inc = await postCotizar(
    new Request("http://127.0.0.1:4317/api/costos/cotizar", { method: "POST", headers: headers({ cookie: adminCookie() }), body: JSON.stringify({ origen: "Antofagasta", destino: "Santiago" }) }),
    ctx(),
  );
  const incId = ((await inc.json()) as { id: string }).id;
  setQuoteStatus(admin, incId, "revisada", "");
  assert.throws(() => setQuoteStatus(admin, incId, "enviada", ""), /pendientes/);
  await seedDiesel(new Date(Date.now() - 3600_000));
  // Sin sesión ni clave: 401. Clave inválida: 401.
  const anon = await postCotizar(new Request("http://127.0.0.1:4317/api/costos/cotizar", { method: "POST", headers: headers(), body: "{}" }), ctx());
  assert.equal(anon.status, 401);
  const bad = await postCotizar(new Request("http://127.0.0.1:4317/api/costos/cotizar", { method: "POST", headers: headers({ "x-costos-key": "x".repeat(30) }), body: "{}" }), ctx());
  assert.equal(bad.status, 401);
});

test("API del motor: límite de solicitudes por llamador", async () => {
  resetRateLimits();
  const send = () =>
    postCotizar(
      new Request("http://127.0.0.1:4317/api/costos/cotizar", {
        method: "POST",
        headers: headers({ "x-costos-key": "clave-match-de-prueba-1234567890" }),
        body: JSON.stringify({ origen: "Antofagasta", destino: "Santiago" }),
      }),
      ctx(),
    );
  for (let i = 0; i < 30; i++) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429);
  resetRateLimits();
});

test("cron: exige el secreto en Authorization y guarda la corrida", async () => {
  const call = (auth?: string) => postCron(new Request("http://127.0.0.1:4317/api/costos/cron", { method: "POST", headers: headers(auth ? { authorization: auth } : {}) }), ctx());
  assert.equal((await call()).status, 401);
  assert.equal((await call("Bearer otro-secreto-incorrecto-0000000000000")).status, 401);
  alignPdfHashes();
  const ok = await call(`Bearer ${process.env.COSTOS_CRON_SECRET}`);
  assert.equal(ok.status, 200);
  const runs = getDb().prepare(`SELECT COUNT(*) AS n FROM cost_job_runs WHERE detail LIKE '%"cron"%'`).get() as { n: number };
  assert.ok(runs.n >= 1);
  const saved = process.env.COSTOS_CRON_SECRET;
  delete process.env.COSTOS_CRON_SECRET;
  assert.equal((await call(`Bearer ${saved}`)).status, 503);
  process.env.COSTOS_CRON_SECRET = saved;
});

test("computeQuote es puro: mismos datos, mismo resultado", () => {
  const params = getParams();
  const a = quoteFromCache({ origin: "Antofagasta", destination: "Santiago", vehicle: "tracto_semirremolque_5_ejes" }, NOW)!;
  const b = computeQuote({ origin: "Antofagasta", destination: "Santiago", vehicle: "tracto_semirremolque_5_ejes" }, a.origin, a.destination, null, params, NOW);
  assert.equal(b.method, "respaldo_linea_recta");
  assert.equal(a.method, "motor");
});

test("Match: cada par carga–camión trae el costo real aproximado del viaje (costForMatch), solo si la opción está activa", async () => {
  await seedDiesel(new Date());
  await quote({ origin: "Antofagasta", destination: "Santiago", equipment: "rampla_plana", weightT: 20 }); // deja la ruta en caché
  const load = { equipment: "rampla_plana" as const, weightT: 20, origin: "Antofagasta", destination: "Santiago", pickupDate: "2026-11-20", specs: {} };
  const truck = { equipment: "rampla_plana" as const, tonnage: 28, origin: "Antofagasta", destination: "Santiago", availableFrom: "2026-11-18", availableTo: "2026-11-25", specs: {} };
  saveSettings({ showSuggestedPrice: false });
  assert.equal(matchTrucksForLoad(load, [truck])[0].match.tripCost, undefined);
  saveSettings({ showSuggestedPrice: true });
  const view = costForMatch(load, truck)!;
  assert.equal(view.complete, true, JSON.stringify(view.pending));
  const [forLoad] = matchTrucksForLoad(load, [truck]);
  const [forTruck] = matchLoadsForTruck(truck, [load]);
  assert.equal(forLoad.match.tripCost?.total, view.costoTotal);
  assert.equal(forTruck.match.tripCost?.total, view.costoTotal);
  assert.equal(forLoad.match.tripCost?.complete, true);
  // Sin ruta en caché (otro destino): respaldo marcado, sin cifra.
  const [other] = matchTrucksForLoad({ ...load, destination: "Calama" }, [{ ...truck, destination: "Calama" }]);
  assert.equal(other.match.tripCost?.total ?? null, null);
  saveSettings({ showSuggestedPrice: false });
});

test("peajes: ruta con vías de peaje fuera de la base oficial queda PENDIENTE (no se asume $0) y el agente no da cifra", async () => {
  await seedDiesel(new Date());
  const a = { lat: -33.45, lon: -70.67, label: "Santiago", region: null, source: "prueba" };
  const b = { lat: -36.82, lon: -73.05, label: "Concepción", region: null, source: "prueba" };
  const route = {
    provider: "osrm", profile: "driving", truckAware: false, distanceM: 500_000, durationS: 18_000,
    geometry: [[-70.67, -33.45], [-71.5, -34.6], [-72.1, -35.4], [-73.05, -36.82]] as [number, number][],
    steps: [{ name: "Ruta 5 Sur", ref: "5", distanceM: 480_000, toll: true, motorway: true }, { name: "Acceso", ref: "", distanceM: 20_000, toll: false, motorway: false }],
    alternatives: [], via: [], viaLabel: null, fetchedAt: new Date().toISOString(), cached: false, attribution: "prueba",
  };
  const r = computeQuote({ origin: "Santiago", destination: "Concepción", vehicle: "tracto_semirremolque_5_ejes" }, a, b, route);
  const peajes = r.components.find((c) => c.key === "peajes")!;
  assert.equal(peajes.status, "pendiente");
  assert.equal(peajes.amount, null);
  assert.equal(r.totals.complete, false);
  assert.ok(r.totals.pending.includes("peajes"));
  const { estimateFromQuote, costSentence } = await import("../src/lib/agent/costs");
  assert.equal(/\$\s?\d/.test(costSentence(estimateFromQuote(r))), false);
  // Ruta sin vías de peaje: $0 legítimo (estimado), la cotización puede quedar completa.
  const free = computeQuote({ origin: "Santiago", destination: "Concepción", vehicle: "tracto_semirremolque_5_ejes" }, a, b, { ...route, steps: route.steps.map((st) => ({ ...st, toll: false })) });
  assert.equal(free.components.find((c) => c.key === "peajes")!.amount, 0);
  assert.equal(free.components.find((c) => c.key === "peajes")!.status, "estimado");
});
