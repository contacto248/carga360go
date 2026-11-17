import { createHash } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import { todayChile } from "../format";
import type { PublicUser } from "../types";
import { can } from "./permissions";

/**
 * Puntaje de desempeño (OPS-202). Los pesos son valores por defecto calibrables, no definitivos.
 * Si un dato no está guardado, el campo queda null y esa regla no suma ni resta.
 *
 * Puntualidad: solo si el envío operativo (migración 023) tiene planned_delivery_at
 * y hay un trip_event `entregado`. Sin esa fecha, on_time_pct queda null.
 * El bono "entrega a tiempo con POD" además exige una fila en pod_evidence.
 * Si la tabla de POD no existe o no hay evidencia, ese bono no se aplica.
 * "Retorno con carga" solo si la carga trae specs.retornoConCarga === true:
 * la plataforma no guarda ese hecho en otra columna.
 */
export const RULES_VERSION = "ops-score-v1";

export const RULE_IDS = {
  entregaATiempoPod: "entrega_a_tiempo_pod",
  retornoConCarga: "retorno_con_carga",
  calificacionAlta: "calificacion_alta",
  atraso: "atraso",
  cancelacionTardia: "cancelacion_tardia",
  noPresentarse: "no_presentarse",
  documentoVencido: "documento_vencido",
} as const;

export type ScoreRules = {
  version: string;
  base: number;
  entregaATiempoPod: number;
  retornoConCarga: number;
  calificacionAlta: number;
  calificacionAltaMin: number;
  atraso: number;
  cancelacionTardia: number;
  noPresentarse: number;
  documentoVencido: number;
  /** Horas antes del mediodía del retiro (UTC−3) que vuelven tardía una oferta retirada. */
  lateCancelHours: number;
  levels: readonly { id: string; min: number }[];
};

export const DEFAULT_RULES: ScoreRules = {
  version: RULES_VERSION,
  base: 70,
  entregaATiempoPod: 10,
  retornoConCarga: 5,
  calificacionAlta: 8,
  calificacionAltaMin: 4,
  atraso: -8,
  cancelacionTardia: -12,
  noPresentarse: -15,
  documentoVencido: -6,
  lateCancelHours: 24,
  levels: [
    { id: "alto", min: 80 },
    { id: "medio", min: 50 },
    { id: "bajo", min: 0 },
  ],
};

const MOVED = new Set(["en_camino", "retirado", "en_transito", "entregado", "incidencia"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const bodySchema = z.object({
  carrierUserId: z.string().trim().min(1).max(80).optional(),
  periodStart: z.string().regex(DAY).optional(),
  periodEnd: z.string().regex(DAY).optional(),
});

export type ScoreEventView = {
  id: string;
  loadId: string | null;
  ruleId: string;
  points: number;
  evidence: unknown;
  createdAt: string;
};

export type ScoreView = {
  id: string;
  carrierUserId: string;
  carrierOrgId: string | null;
  periodStart: string;
  periodEnd: string;
  tripsDone: number;
  onTimePct: number | null;
  cancelCount: number;
  incidentCount: number;
  avgRating: number | null;
  docsValid: number | null;
  score: number;
  level: string;
  rulesVersion: string;
  computedAt: string;
  events: ScoreEventView[];
};

export type RecalculateInput = {
  carrierUserId?: string;
  periodStart?: string;
  periodEnd?: string;
  rules?: ScoreRules;
  asOf?: Date;
};

type Actor = Pick<PublicUser, "id" | "email"> | null;

type BuiltEvent = {
  id: string;
  loadId: string | null;
  ruleId: string;
  points: number;
  evidenceJson: string;
};

type OfferLoad = {
  loadId: string;
  pickupDate: string;
  tripStatus: string | null;
  specsJson: string;
  awardedOfferId: string | null;
  offerId: string;
  offerStatus: string;
  offerUpdatedAt: string;
};

type TripEvent = { loadId: string; status: string; createdAt: string };

type ScoreRow = {
  id: string;
  carrier_user_id: string;
  carrier_org_id: string | null;
  period_start: string;
  period_end: string;
  trips_done: number;
  on_time_pct: number | null;
  cancel_count: number;
  incident_count: number;
  avg_rating: number | null;
  docs_valid: number | null;
  score: number;
  level: string;
  rules_version: string;
  computed_at: string;
};

type EventRow = {
  id: string;
  carrier_user_id: string;
  load_id: string | null;
  rule_id: string;
  points: number;
  evidence_json: string;
  created_at: string;
};

export function parseRecalculateBody(body: unknown): { carrierUserId?: string; periodStart?: string; periodEnd?: string } {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  return parsed.data;
}

/** Lo ve el admin y el mandante con desempeno.ver. Nadie más. */
export function assertCanViewScores(user: Pick<PublicUser, "id" | "role">, orgId: string | null): void {
  if (user.role === "admin") return;
  if (user.role !== "mandante") throw new AppError("No tienes permiso para esta acción.", 403);
  if (!orgId) throw new AppError("Indica la organización mandante.");
  const org = getDb().prepare(`SELECT kind FROM ops_organizations WHERE id = ?`).get(orgId) as { kind: string } | undefined;
  if (!org || org.kind !== "mandante" || !can(user, orgId, "desempeno.ver")) {
    throw new AppError("No tienes permiso para esta acción.", 403);
  }
}

export function listScores(carrierUserId?: string): ScoreView[] {
  const db = getDb();
  const rows = (
    carrierUserId
      ? db.prepare(`SELECT * FROM ops_carrier_scores WHERE carrier_user_id = ? ORDER BY period_end DESC, rules_version`).all(carrierUserId)
      : db.prepare(`SELECT * FROM ops_carrier_scores ORDER BY period_end DESC, carrier_user_id`).all()
  ) as ScoreRow[];
  return rows.map((row) => toView(db, row));
}

export function recalculateScores(input: RecalculateInput = {}, actor: Actor = null, ip: string | null = null) {
  const rules = input.rules ?? DEFAULT_RULES;
  const asOf = input.asOf ?? new Date();
  const period = resolvePeriod(input, asOf);
  const ids = carrierIds(input.carrierUserId);
  const scores: ScoreView[] = [];
  let changed = 0;
  for (const carrierUserId of ids) {
    const result = recalculateOne(carrierUserId, period, rules, asOf, actor, ip);
    scores.push(result.score);
    if (result.changed) changed += 1;
  }
  return { periodStart: period.periodStart, periodEnd: period.periodEnd, rulesVersion: rules.version, changed, scores };
}

function resolvePeriod(input: RecalculateInput, asOf: Date) {
  const periodEnd = input.periodEnd ?? todayChile(asOf);
  const periodStart = input.periodStart ?? addDays(periodEnd, -89);
  if (!DAY.test(periodStart) || !DAY.test(periodEnd) || periodStart > periodEnd) {
    throw new AppError("El periodo no es válido.");
  }
  return { periodStart, periodEnd };
}

function carrierIds(only?: string): string[] {
  if (!only) {
    return (getDb().prepare(`SELECT id FROM users WHERE role = 'transportista' ORDER BY id`).all() as { id: string }[]).map((row) => row.id);
  }
  const row = getDb().prepare(`SELECT id, role FROM users WHERE id = ?`).get(only) as { id: string; role: string } | undefined;
  if (!row || row.role !== "transportista") throw new AppError("Transportista no encontrado.", 404);
  return [row.id];
}

function recalculateOne(
  carrierUserId: string,
  period: { periodStart: string; periodEnd: string },
  rules: ScoreRules,
  asOf: Date,
  actor: Actor,
  ip: string | null,
): { score: ScoreView; changed: boolean } {
  const db = getDb();
  const built = buildScore(db, carrierUserId, period, rules, asOf);
  const existing = db
    .prepare(`SELECT * FROM ops_carrier_scores WHERE carrier_user_id = ? AND period_end = ? AND rules_version = ?`)
    .get(carrierUserId, period.periodEnd, rules.version) as ScoreRow | undefined;
  const existingEvents = (db.prepare(`SELECT * FROM ops_score_events WHERE carrier_user_id = ? ORDER BY id`).all(carrierUserId) as EventRow[]).filter((row) =>
    belongs(row.evidence_json, period.periodEnd, rules.version),
  );
  if (existing && sameScore(existing, built) && sameEvents(existingEvents, built.events)) {
    return { score: toView(db, existing), changed: false };
  }
  const computedAt = new Date().toISOString();
  const write = db.transaction(() => {
    const remove = db.prepare(`DELETE FROM ops_score_events WHERE id = ?`);
    for (const row of existingEvents) remove.run(row.id);
    const insert = db.prepare(
      `INSERT INTO ops_score_events (id, carrier_user_id, load_id, rule_id, points, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const event of built.events) {
      insert.run(event.id, carrierUserId, event.loadId, event.ruleId, event.points, event.evidenceJson, computedAt);
    }
    db.prepare(
      `INSERT INTO ops_carrier_scores (
         id, carrier_user_id, carrier_org_id, period_start, period_end, trips_done, on_time_pct, cancel_count,
         incident_count, avg_rating, docs_valid, score, level, rules_version, computed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(carrier_user_id, period_end, rules_version) DO UPDATE SET
         carrier_org_id = excluded.carrier_org_id,
         period_start = excluded.period_start,
         trips_done = excluded.trips_done,
         on_time_pct = excluded.on_time_pct,
         cancel_count = excluded.cancel_count,
         incident_count = excluded.incident_count,
         avg_rating = excluded.avg_rating,
         docs_valid = excluded.docs_valid,
         score = excluded.score,
         level = excluded.level,
         computed_at = excluded.computed_at`,
    ).run(
      built.id,
      carrierUserId,
      built.carrierOrgId,
      period.periodStart,
      period.periodEnd,
      built.tripsDone,
      built.onTimePct,
      built.cancelCount,
      built.incidentCount,
      built.avgRating,
      built.docsValid,
      built.score,
      built.level,
      rules.version,
      computedAt,
    );
    auditStrict(
      actor,
      "ops.desempeno_recalculado",
      { type: "ops_desempeno", id: carrierUserId },
      {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        rulesVersion: rules.version,
        score: built.score,
        level: built.level,
        events: built.events.length,
      },
      ip,
    );
  });
  write();
  const stored = db
    .prepare(`SELECT * FROM ops_carrier_scores WHERE carrier_user_id = ? AND period_end = ? AND rules_version = ?`)
    .get(carrierUserId, period.periodEnd, rules.version) as ScoreRow;
  return { score: toView(db, stored), changed: true };
}

function buildScore(
  db: ReturnType<typeof getDb>,
  carrierUserId: string,
  period: { periodStart: string; periodEnd: string },
  rules: ScoreRules,
  asOf: Date,
) {
  const loads = db
    .prepare(
      `SELECT l.id AS loadId, l.pickup_date AS pickupDate, l.trip_status AS tripStatus, l.specs_json AS specsJson,
              l.awarded_offer_id AS awardedOfferId, o.id AS offerId, o.status AS offerStatus, o.updated_at AS offerUpdatedAt
       FROM offers o JOIN loads l ON l.id = o.load_id WHERE o.carrier_id = ?`,
    )
    .all(carrierUserId) as OfferLoad[];
  const tripRows = db
    .prepare(
      `SELECT e.load_id AS loadId, e.status AS status, e.created_at AS createdAt
       FROM trip_events e JOIN offers o ON o.load_id = e.load_id AND o.carrier_id = ?
       ORDER BY e.created_at ASC`,
    )
    .all(carrierUserId) as TripEvent[];
  const byLoad = new Map<string, TripEvent[]>();
  for (const row of tripRows) {
    const list = byLoad.get(row.loadId) ?? [];
    list.push(row);
    byLoad.set(row.loadId, list);
  }
  const loadIds = loads.map((row) => row.loadId);
  const planned = plannedByLoad(db, loadIds);
  const pods = podLoads(db, loadIds);
  const events: BuiltEvent[] = [];
  let tripsDone = 0;
  let comparable = 0;
  let onTime = 0;
  let cancelCount = 0;
  let incidentCount = 0;
  const evalDay = period.periodEnd < todayChile(asOf) ? period.periodEnd : todayChile(asOf);

  for (const load of loads) {
    const awarded = load.offerStatus === "aceptada" && load.awardedOfferId === load.offerId;
    const history = byLoad.get(load.loadId) ?? [];
    if (awarded && history.some((event) => event.status === "incidencia" && inPeriod(chileDay(event.createdAt), period))) {
      incidentCount += 1;
    }
    const delivered = history.find((event) => event.status === "entregado" && inPeriod(chileDay(event.createdAt), period));
    if (awarded && delivered) {
      tripsDone += 1;
      const plan = planned.get(load.loadId) ?? null;
      if (plan) {
        comparable += 1;
        const day = chileDay(delivered.createdAt);
        if (day && day <= plan) {
          onTime += 1;
          if (pods?.has(load.loadId)) {
            pushEvent(events, rules, carrierUserId, period, RULE_IDS.entregaATiempoPod, rules.entregaATiempoPod, load.loadId, "pod", {
              rulesVersion: rules.version,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              source: "pod_evidence",
              observedAt: delivered.createdAt,
              loadId: load.loadId,
              documentId: null,
              detail: { fechaEntrega: plan, entregadoAt: delivered.createdAt, pod: true },
            });
          }
        } else if (day && day > plan) {
          pushEvent(events, rules, carrierUserId, period, RULE_IDS.atraso, rules.atraso, load.loadId, "atraso", {
            rulesVersion: rules.version,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            source: "trip_events",
            observedAt: delivered.createdAt,
            loadId: load.loadId,
            documentId: null,
            detail: { fechaEntrega: plan, entregadoAt: delivered.createdAt },
          });
        }
      }
      if (explicitReturn(load.specsJson) === true) {
        pushEvent(events, rules, carrierUserId, period, RULE_IDS.retornoConCarga, rules.retornoConCarga, load.loadId, "retorno", {
          rulesVersion: rules.version,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          source: "loads",
          observedAt: delivered.createdAt,
          loadId: load.loadId,
          documentId: null,
          detail: { retornoConCarga: true },
        });
      }
    }
    if (awarded && load.pickupDate && inPeriod(chileDay(load.pickupDate), period) && chileDay(load.pickupDate)! < evalDay && !showedUp(load.tripStatus, history)) {
      pushEvent(events, rules, carrierUserId, period, RULE_IDS.noPresentarse, rules.noPresentarse, load.loadId, "ausencia", {
        rulesVersion: rules.version,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        source: "offers",
        observedAt: load.pickupDate,
        loadId: load.loadId,
        documentId: null,
        detail: { pickupDate: load.pickupDate },
      });
    }
    if (load.offerStatus === "retirada") {
      const hours = hoursBeforePickupNoon(load.offerUpdatedAt, load.pickupDate);
      const when = chileDay(load.offerUpdatedAt);
      if (hours !== null && hours <= rules.lateCancelHours && inPeriod(when, period)) {
        cancelCount += 1;
        pushEvent(events, rules, carrierUserId, period, RULE_IDS.cancelacionTardia, rules.cancelacionTardia, load.loadId, "retiro", {
          rulesVersion: rules.version,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          source: "offers",
          observedAt: load.offerUpdatedAt,
          loadId: load.loadId,
          documentId: null,
          detail: { pickupDate: load.pickupDate, updatedAt: load.offerUpdatedAt, hoursBeforePickup: Math.round(hours * 10) / 10 },
        });
      }
    }
  }

  const ratings = db
    .prepare(`SELECT id, load_id AS loadId, stars, created_at AS createdAt FROM ratings WHERE to_user_id = ?`)
    .all(carrierUserId) as { id: string; loadId: string; stars: number; createdAt: string }[];
  const rated = ratings.filter((row) => inPeriod(chileDay(row.createdAt), period) && Number.isFinite(row.stars));
  for (const rating of rated) {
    if (rating.stars >= rules.calificacionAltaMin) {
      pushEvent(events, rules, carrierUserId, period, RULE_IDS.calificacionAlta, rules.calificacionAlta, rating.loadId, rating.id, {
        rulesVersion: rules.version,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        source: "ratings",
        observedAt: rating.createdAt,
        loadId: rating.loadId,
        documentId: null,
        detail: { stars: rating.stars, ratingId: rating.id },
      });
    }
  }
  const avgRating = rated.length ? round1(rated.reduce((sum, row) => sum + row.stars, 0) / rated.length) : null;

  const docs = readDocuments(db, carrierUserId, period.periodEnd);
  for (const doc of docs.expired) {
    pushEvent(events, rules, carrierUserId, period, RULE_IDS.documentoVencido, rules.documentoVencido, null, doc.id, {
      rulesVersion: rules.version,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      source: doc.source,
      observedAt: doc.expiry,
      loadId: null,
      documentId: doc.id,
      detail: { type: doc.type, expiry: doc.expiry },
    });
  }

  const points = events.reduce((sum, event) => sum + event.points, 0);
  const score = clamp(rules.base + points);
  return {
    id: stableId(["score", carrierUserId, period.periodEnd, rules.version]),
    carrierOrgId: carrierOrgId(db, carrierUserId),
    tripsDone,
    onTimePct: comparable === 0 ? null : round1((onTime / comparable) * 100),
    cancelCount,
    incidentCount,
    avgRating,
    docsValid: docs.docsValid,
    score,
    level: levelFor(score, rules),
    events,
  };
}

function pushEvent(
  events: BuiltEvent[],
  rules: ScoreRules,
  carrierUserId: string,
  period: { periodEnd: string },
  ruleId: string,
  points: number,
  loadId: string | null,
  ref: string,
  evidence: Record<string, unknown>,
) {
  const whole = Math.trunc(points);
  if (!Number.isFinite(points) || whole === 0) return;
  events.push({
    id: stableId([carrierUserId, period.periodEnd, rules.version, ruleId, loadId ?? "", ref]),
    loadId,
    ruleId,
    points: whole,
    evidenceJson: JSON.stringify(evidence),
  });
}

function readDocuments(db: ReturnType<typeof getDb>, carrierUserId: string, periodEnd: string) {
  const expired: { id: string; type: string; expiry: string; source: "documents" | "documentos_acreditacion" }[] = [];
  let evaluable = 0;
  let valid = 0;
  if (tableExists(db, "documents")) {
    const rows = db.prepare(`SELECT id, type, expiry, verification_status AS status FROM documents WHERE user_id = ?`).all(carrierUserId) as {
      id: string;
      type: string;
      expiry: string;
      status: string;
    }[];
    for (const row of rows) {
      if (row.status !== "verificado") continue;
      const expiry = chileDay(row.expiry);
      if (!expiry) continue;
      evaluable += 1;
      if (expiry < periodEnd) expired.push({ id: row.id, type: row.type, expiry, source: "documents" });
      else valid += 1;
    }
  }
  if (tableExists(db, "documentos_acreditacion")) {
    const rows = db
      .prepare(`SELECT id, tipo AS type, vencimiento, estado_admin AS status FROM documentos_acreditacion WHERE user_id = ?`)
      .all(carrierUserId) as { id: string; type: string; vencimiento: string | null; status: string }[];
    for (const row of rows) {
      if (row.status !== "aprobado" || !row.vencimiento) continue;
      const expiry = chileDay(row.vencimiento);
      if (!expiry) continue;
      evaluable += 1;
      if (expiry < periodEnd) expired.push({ id: row.id, type: row.type, expiry, source: "documentos_acreditacion" });
      else valid += 1;
    }
  }
  return { expired, docsValid: evaluable === 0 ? null : valid > 0 && expired.length === 0 ? 1 : 0 };
}

function plannedByLoad(db: ReturnType<typeof getDb>, loadIds: string[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  if (!loadIds.length || !tableExists(db, "ops_shipments")) return map;
  const rows = db
    .prepare(`SELECT load_id AS loadId, planned_delivery_at AS planned FROM ops_shipments WHERE load_id IN (${loadIds.map(() => "?").join(",")})`)
    .all(...loadIds) as { loadId: string; planned: string | null }[];
  for (const row of rows) map.set(row.loadId, row.planned ? chileDay(row.planned) : null);
  return map;
}

/** null: no hay tabla de POD. Set: cargas con al menos una evidencia. */
function podLoads(db: ReturnType<typeof getDb>, loadIds: string[]): Set<string> | null {
  if (!tableExists(db, "pod_evidence") || !tableExists(db, "freight_payments")) return null;
  if (!loadIds.length) return new Set();
  const rows = db
    .prepare(
      `SELECT DISTINCT fp.load_id AS loadId FROM freight_payments fp
       JOIN pod_evidence pe ON pe.freight_payment_id = fp.id
       WHERE fp.load_id IN (${loadIds.map(() => "?").join(",")})`,
    )
    .all(...loadIds) as { loadId: string }[];
  return new Set(rows.map((row) => row.loadId));
}

function carrierOrgId(db: ReturnType<typeof getDb>, carrierUserId: string): string | null {
  if (!tableExists(db, "ops_org_members") || !tableExists(db, "ops_organizations")) return null;
  const row = db
    .prepare(
      `SELECT m.org_id AS orgId FROM ops_org_members m
       JOIN ops_organizations o ON o.id = m.org_id
       WHERE m.user_id = ? AND m.status = 'activo' AND o.kind = 'transportista'
       ORDER BY m.created_at ASC LIMIT 1`,
    )
    .get(carrierUserId) as { orgId: string } | undefined;
  return row?.orgId ?? null;
}

function showedUp(tripStatus: string | null, events: TripEvent[]): boolean {
  if (tripStatus && MOVED.has(tripStatus)) return true;
  return events.some((event) => MOVED.has(event.status));
}

function explicitReturn(specsJson: string): boolean | null {
  try {
    const specs = JSON.parse(specsJson) as Record<string, unknown>;
    if (!specs || typeof specs !== "object" || !Object.prototype.hasOwnProperty.call(specs, "retornoConCarga")) return null;
    return specs.retornoConCarga === true;
  } catch {
    return null;
  }
}

function hoursBeforePickupNoon(updatedAt: string, pickupDate: string): number | null {
  const day = chileDay(pickupDate);
  const updated = Date.parse(updatedAt);
  if (!day || Number.isNaN(updated)) return null;
  const noon = Date.parse(`${day}T12:00:00-03:00`);
  if (Number.isNaN(noon)) return null;
  return (noon - updated) / 3_600_000;
}

function levelFor(score: number, rules: ScoreRules): string {
  const levels = [...rules.levels].sort((a, b) => b.min - a.min);
  return levels.find((level) => score >= level.min)?.id ?? "bajo";
}

function sameScore(existing: ScoreRow, built: ReturnType<typeof buildScore>): boolean {
  return (
    existing.carrier_org_id === built.carrierOrgId &&
    existing.trips_done === built.tripsDone &&
    sameNum(existing.on_time_pct, built.onTimePct) &&
    existing.cancel_count === built.cancelCount &&
    existing.incident_count === built.incidentCount &&
    sameNum(existing.avg_rating, built.avgRating) &&
    existing.docs_valid === built.docsValid &&
    sameNum(existing.score, built.score) &&
    existing.level === built.level
  );
}

function sameEvents(existing: EventRow[], built: BuiltEvent[]): boolean {
  if (existing.length !== built.length) return false;
  const next = new Map(built.map((event) => [event.id, event]));
  return existing.every((row) => {
    const event = next.get(row.id);
    return !!event && event.points === row.points && event.ruleId === row.rule_id && event.loadId === row.load_id && event.evidenceJson === row.evidence_json;
  });
}

function belongs(evidenceJson: string, periodEnd: string, version: string): boolean {
  try {
    const parsed = JSON.parse(evidenceJson) as { periodEnd?: string; rulesVersion?: string };
    return parsed.periodEnd === periodEnd && parsed.rulesVersion === version;
  } catch {
    return false;
  }
}

function toView(db: ReturnType<typeof getDb>, row: ScoreRow): ScoreView {
  const events = (db.prepare(`SELECT * FROM ops_score_events WHERE carrier_user_id = ? ORDER BY rule_id, load_id, id`).all(row.carrier_user_id) as EventRow[])
    .filter((event) => belongs(event.evidence_json, row.period_end, row.rules_version))
    .map((event) => ({
      id: event.id,
      loadId: event.load_id,
      ruleId: event.rule_id,
      points: event.points,
      evidence: parseEvidence(event.evidence_json),
      createdAt: event.created_at,
    }));
  return {
    id: row.id,
    carrierUserId: row.carrier_user_id,
    carrierOrgId: row.carrier_org_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    tripsDone: row.trips_done,
    onTimePct: row.on_time_pct,
    cancelCount: row.cancel_count,
    incidentCount: row.incident_count,
    avgRating: row.avg_rating,
    docsValid: row.docs_valid,
    score: row.score,
    level: row.level,
    rulesVersion: row.rules_version,
    computedAt: row.computed_at,
    events,
  };
}

function parseEvidence(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { raw: value };
  }
}

function tableExists(db: ReturnType<typeof getDb>, name: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

function chileDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (DAY.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return todayChile(date);
}

function inPeriod(day: string | null, period: { periodStart: string; periodEnd: string }): boolean {
  return !!day && day >= period.periodStart && day <= period.periodEnd;
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, round1(value)));
}

function sameNum(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 0.001;
}

function stableId(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}
