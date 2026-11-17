import { randomUUID } from "crypto";
import { z } from "zod";
import { isAccredited } from "../accreditation";
import { audit, auditStrict } from "../audit";
import { isCarrierLocked } from "../carrier";
import { carrierCapacity } from "./capacity";
import { equipmentById } from "../catalog";
import { getDb } from "../db";
import { AppError } from "../errors";
import { todayChile } from "../format";
import { matchTrucksForLoad } from "../match";
import { acceptOffer, submitOffer } from "../offers";
import { resolveRate } from "./procurement";
import { appendEvent } from "./shipments";
import { allocationMode, assertEnabled } from "./flags";
import { can } from "./permissions";
import { EQUIPMENT_IDS, type EquipmentId, type PublicUser, type Role, type Specs, type VerificationStatus } from "../types";

/**
 * Motor de asignación (OPS-203). Siempre propone (dry_run = 1).
 * OPS_ALLOCATION_AUTO se ignora: una persona con asignacion.ejecutar confirma
 * usando el flujo de ofertas. No envía WhatsApp ni correo.
 */

export const ALLOCATION_MODES = ["directa", "por_tarifa", "por_desempeno", "cascada"] as const;
export type AllocationMode = (typeof ALLOCATION_MODES)[number];

export const ALLOCATION_STEPS = ["filtrar", "ordenar", "invitar", "esperar", "siguiente"] as const;
export type AllocationStep = (typeof ALLOCATION_STEPS)[number];

const CANDIDATE_OPEN = ["propuesto", "invitado"] as const;
const VENCER = "asignacion.vencer";

type Pesos = { costo: number; desempeno: number; capacidad: number; disponibilidad: number };
type StepFile = { tipo: AllocationStep };
type WeightFile = { pesos: Pesos; pasos: StepFile[]; carrierUserId: string | null };

type RuleRow = {
  id: string;
  shipper_org_id: string;
  lane_id: string | null;
  equipment: string | null;
  mode: AllocationMode;
  weights_json: string;
  min_score: number | null;
  accept_timeout_minutes: number;
  max_rounds: number;
  active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  shipment_id: string;
  rule_id: string | null;
  mode: string;
  status: string;
  dry_run: number;
  started_by: string | null;
  created_at: string;
  finished_at: string | null;
};

type CandidateRow = {
  id: string;
  run_id: string;
  carrier_user_id: string;
  truck_id: string | null;
  rank: number;
  rate_clp: number | null;
  score: number | null;
  match_score: number | null;
  availability: string | null;
  reasons_json: string;
  status: string;
  attempt: number;
  next_retry_at: string | null;
  responded_at: string | null;
};

type DecisionRow = {
  id: string;
  run_id: string;
  seq: number;
  step: string;
  rule_id: string | null;
  input_json: string;
  output_json: string;
  decided_by: string;
  created_at: string;
};

type JobRow = {
  id: string;
  kind: string;
  ref_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type Draft = {
  carrierUserId: string;
  truckId: string | null;
  rateClp: number | null;
  score: number | null;
  matchScore: number | null;
  availability: string;
  reasons: string[];
  status: "propuesto" | "descartado";
  composite: number;
  windowOk: boolean;
  rank: number;
  attempt: number;
  nextRetryAt: string | null;
};

export type AllocationCandidate = {
  id: string;
  runId: string;
  carrierUserId: string;
  truckId: string | null;
  rank: number;
  rateClp: number | null;
  score: number | null;
  matchScore: number | null;
  availability: string | null;
  reasons: string[];
  status: string;
  attempt: number;
  nextRetryAt: string | null;
  respondedAt: string | null;
};

export type AllocationDecision = {
  id: string;
  runId: string;
  seq: number;
  step: string;
  ruleId: string | null;
  input: unknown;
  output: unknown;
  decidedBy: string;
  createdAt: string;
};

export type AllocationRun = {
  id: string;
  shipmentId: string;
  ruleId: string | null;
  mode: string;
  status: string;
  dryRun: boolean;
  startedBy: string | null;
  createdAt: string;
  finishedAt: string | null;
  candidates: AllocationCandidate[];
  decisions: AllocationDecision[];
};

export type AllocationRule = {
  id: string;
  shipperOrgId: string;
  laneId: string | null;
  equipment: string | null;
  mode: AllocationMode;
  pesos: Pesos;
  pasos: StepFile[];
  carrierUserId: string | null;
  minScore: number | null;
  acceptTimeoutMinutes: number;
  maxRounds: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const pesosSchema = z.object({
  costo: z.number().min(0).max(1),
  desempeno: z.number().min(0).max(1),
  capacidad: z.number().min(0).max(1),
  disponibilidad: z.number().min(0).max(1),
});

const stepSchema = z.object({ tipo: z.enum(ALLOCATION_STEPS) });

const createSchema = z.object({
  shipperOrgId: z.string().uuid(),
  laneId: z.string().uuid().nullable().optional(),
  equipment: z.enum(EQUIPMENT_IDS).nullable().optional(),
  mode: z.enum(ALLOCATION_MODES),
  pesos: pesosSchema.optional(),
  pasos: z.array(stepSchema).min(1).max(8).optional(),
  minScore: z.number().min(0).max(100).nullable().optional(),
  acceptTimeoutMinutes: z.number().int().min(1).max(10080).optional(),
  maxRounds: z.number().int().min(1).max(20).optional(),
  carrierUserId: z.string().trim().min(8).max(80).nullable().optional(),
  active: z.boolean().optional(),
});

const proposeSchema = z.object({
  shipmentId: z.string().uuid(),
  ruleId: z.string().uuid(),
});

const storedSchema = z.object({
  pesos: pesosSchema,
  pasos: z.array(stepSchema).min(1),
  carrierUserId: z.string().nullable(),
});

type JobHandler = (job: JobRow, now: Date) => void;

const DEFAULT_PESOS: Pesos = { costo: 0.25, desempeno: 0.25, capacidad: 0.25, disponibilidad: 0.25 };

function assertAllocation() {
  assertEnabled("OPS_ALLOCATION_ENABLED");
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  return parsed.data;
}

function pesosSum(pesos: Pesos): number {
  return pesos.costo + pesos.desempeno + pesos.capacidad + pesos.disponibilidad;
}

function defaultSteps(mode: AllocationMode): StepFile[] {
  if (mode === "cascada") {
    return [{ tipo: "filtrar" }, { tipo: "ordenar" }, { tipo: "invitar" }, { tipo: "esperar" }, { tipo: "siguiente" }];
  }
  return [{ tipo: "filtrar" }, { tipo: "ordenar" }];
}

function ensureSteps(steps: StepFile[]): StepFile[] {
  const rest = steps.filter((step) => step.tipo !== "filtrar" && step.tipo !== "ordenar");
  return [{ tipo: "filtrar" }, { tipo: "ordenar" }, ...rest];
}

function jsonObject(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function reasonsOf(text: string): string[] {
  const value = jsonObject(text);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readWeights(text: string): WeightFile {
  const parsed = storedSchema.safeParse(jsonObject(text));
  if (!parsed.success) throw new AppError("La regla de asignación está incompleta.");
  return parsed.data;
}

function mapRule(row: RuleRow): AllocationRule {
  const weights = readWeights(row.weights_json);
  return {
    id: row.id,
    shipperOrgId: row.shipper_org_id,
    laneId: row.lane_id,
    equipment: row.equipment,
    mode: row.mode,
    pesos: weights.pesos,
    pasos: weights.pasos,
    carrierUserId: weights.carrierUserId,
    minScore: row.min_score,
    acceptTimeoutMinutes: row.accept_timeout_minutes,
    maxRounds: row.max_rounds,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCandidate(row: CandidateRow): AllocationCandidate {
  return {
    id: row.id,
    runId: row.run_id,
    carrierUserId: row.carrier_user_id,
    truckId: row.truck_id,
    rank: row.rank,
    rateClp: row.rate_clp,
    score: row.score,
    matchScore: row.match_score,
    availability: row.availability,
    reasons: reasonsOf(row.reasons_json),
    status: row.status,
    attempt: row.attempt,
    nextRetryAt: row.next_retry_at,
    respondedAt: row.responded_at,
  };
}

function mapDecision(row: DecisionRow): AllocationDecision {
  return {
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    step: row.step,
    ruleId: row.rule_id,
    input: jsonObject(row.input_json),
    output: jsonObject(row.output_json),
    decidedBy: row.decided_by,
    createdAt: row.created_at,
  };
}

function ruleRow(id: string): RuleRow | null {
  const row = getDb().prepare(`SELECT * FROM ops_allocation_rules WHERE id = ?`).get(id) as RuleRow | undefined;
  return row ?? null;
}

function loadRunBundle(id: string): AllocationRun | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ops_allocation_runs WHERE id = ?`).get(id) as RunRow | undefined;
  if (!row) return null;
  const candidates = (db.prepare(`SELECT * FROM ops_allocation_candidates WHERE run_id = ? ORDER BY rank, id`).all(id) as CandidateRow[]).map(mapCandidate);
  const decisions = (db.prepare(`SELECT * FROM ops_allocation_decisions WHERE run_id = ? ORDER BY seq`).all(id) as DecisionRow[]).map(mapDecision);
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    ruleId: row.rule_id,
    mode: row.mode,
    status: row.status,
    dryRun: row.dry_run === 1,
    startedBy: row.started_by,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    candidates,
    decisions,
  };
}

function assertCan(user: PublicUser, orgId: string, permiso: "asignacion.ver" | "asignacion.ejecutar" | "reglas.editar") {
  if (!can(user, orgId, permiso)) throw new AppError("No tienes permiso para esta acción.", 403);
}

function publicUser(id: string): PublicUser | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, role, razon_social, rut, contact_name, whatsapp, city, verification_status, verification_note,
              email_verified_at, phone_verified_at, verified_at, created_at, free_until, manual_readonly_until
       FROM users WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        email: string;
        role: string;
        razon_social: string;
        rut: string;
        contact_name: string;
        whatsapp: string;
        city: string;
        verification_status: string;
        verification_note: string | null;
        email_verified_at: string | null;
        phone_verified_at: string | null;
        verified_at: string | null;
        created_at: string;
        free_until: string | null;
        manual_readonly_until: string | null;
      }
    | undefined;
  if (!row || (row.role !== "transportista" && row.role !== "mandante" && row.role !== "admin")) return null;
  const role = row.role as Role;
  return {
    id: row.id,
    email: row.email,
    role,
    razonSocial: row.razon_social,
    rut: row.rut,
    contactName: row.contact_name,
    whatsapp: row.whatsapp,
    city: row.city,
    verificationStatus: row.verification_status as VerificationStatus,
    verificationNote: row.verification_note,
    emailVerifiedAt: row.email_verified_at,
    phoneVerifiedAt: row.phone_verified_at,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    freeUntil: role === "admin" ? null : row.free_until,
    manualReadonlyUntil: row.manual_readonly_until,
  };
}

function specsOf(text: string): Specs {
  const value = jsonObject(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Specs;
}

function dayOf(value: string): string {
  return value.slice(0, 10);
}

function covers(from: string, to: string, day: string): boolean {
  return dayOf(from) <= day && day <= dayOf(to);
}

function carrierOrgId(userId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT o.id AS id FROM ops_org_members m
       JOIN ops_organizations o ON o.id = m.org_id
       WHERE m.user_id = ? AND m.status = 'activo' AND o.kind = 'transportista'
       ORDER BY m.created_at LIMIT 1`,
    )
    .get(userId) as { id: string } | undefined;
  return row?.id ?? null;
}

function latestScore(userId: string): number | null {
  const row = getDb()
    .prepare(`SELECT score FROM ops_carrier_scores WHERE carrier_user_id = ? ORDER BY period_end DESC, computed_at DESC LIMIT 1`)
    .get(userId) as { score: number } | undefined;
  return row && Number.isFinite(row.score) ? row.score : null;
}

function rateFor(
  actor: PublicUser,
  input: { shipperOrgId: string; carrierOrgId: string | null; origin: string; destination: string; equipment: string; date: string },
): number | null {
  if (!(EQUIPMENT_IDS as readonly string[]).includes(input.equipment)) return null;
  try {
    const found = resolveRate({ ...actor, role: "admin" }, input);
    return found ? found.amountClp : null;
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}

function addDecision(
  db: ReturnType<typeof getDb>,
  runId: string,
  step: string,
  ruleId: string | null,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  decidedBy: string,
  stamp: string,
) {
  const current = db.prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM ops_allocation_decisions WHERE run_id = ?`).get(runId) as { seq: number };
  db.prepare(
    `INSERT INTO ops_allocation_decisions (id, run_id, seq, step, rule_id, input_json, output_json, decided_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), runId, current.seq + 1, step, ruleId, JSON.stringify(input), JSON.stringify(output), decidedBy, stamp);
}

function enqueueJob(db: ReturnType<typeof getDb>, kind: string, refId: string, runAfter: string, maxAttempts: number, stamp: string) {
  const existing = db
    .prepare(`SELECT id FROM ops_jobs WHERE kind = ? AND ref_id = ? AND status IN ('pendiente', 'en_curso')`)
    .get(kind, refId) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ops_jobs (id, kind, ref_id, status, attempts, max_attempts, run_after, last_error, created_at, updated_at)
     VALUES (?, ?, ?, 'pendiente', 0, ?, ?, NULL, ?, ?)`,
  ).run(id, kind, refId, maxAttempts, runAfter, stamp, stamp);
  return id;
}

function weigh(drafts: Draft[], pesos: Pesos) {
  const rates = drafts.filter((draft) => draft.status !== "descartado" && draft.rateClp != null).map((draft) => draft.rateClp as number);
  const min = rates.length ? Math.min(...rates) : null;
  const max = rates.length ? Math.max(...rates) : null;
  for (const draft of drafts) {
    if (draft.status === "descartado") {
      draft.composite = 0;
      continue;
    }
    const costo = draft.rateClp == null || min == null || max == null ? 0 : max === min ? 1 : (max - draft.rateClp) / (max - min);
    const desempeno = draft.score == null ? 0 : Math.min(1, Math.max(0, draft.score / 100));
    const capacidad = draft.availability === "disponible" ? 1 : draft.availability === "sin_datos" ? 0.5 : 0;
    const disponibilidad = draft.windowOk ? 1 : 0;
    draft.composite = pesos.costo * costo + pesos.desempeno * desempeno + pesos.capacidad * capacidad + pesos.disponibilidad * disponibilidad;
  }
}

function compareDrafts(mode: AllocationMode, a: Draft, b: Draft): number {
  if (a.status === "descartado" && b.status !== "descartado") return 1;
  if (b.status === "descartado" && a.status !== "descartado") return -1;
  if (mode === "por_tarifa") {
    const left = a.rateClp ?? Number.POSITIVE_INFINITY;
    const right = b.rateClp ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    const score = (b.score ?? -1) - (a.score ?? -1);
    if (score !== 0) return score;
  } else if (mode === "por_desempeno") {
    const score = (b.score ?? -1) - (a.score ?? -1);
    if (score !== 0) return score;
    const left = a.rateClp ?? Number.POSITIVE_INFINITY;
    const right = b.rateClp ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
  } else if (mode === "cascada") {
    if (a.composite !== b.composite) return b.composite - a.composite;
  }
  return a.carrierUserId < b.carrierUserId ? -1 : a.carrierUserId > b.carrierUserId ? 1 : 0;
}

function tied(mode: AllocationMode, a: Draft, b: Draft): boolean {
  if (a.status === "descartado" || b.status === "descartado") return false;
  if (mode === "por_tarifa") return a.rateClp != null && a.rateClp === b.rateClp;
  if (mode === "por_desempeno") return a.score != null && a.score === b.score;
  if (mode === "cascada") return Math.abs(a.composite - b.composite) < 1e-9;
  return false;
}

type LoadSnap = {
  id: string;
  owner_id: string;
  origin: string;
  destination: string;
  equipment: string;
  weight_t: number;
  pickup_date: string;
  specs_json: string;
  status: string | null;
  is_demo: number;
  awarded_offer_id: string | null;
};

function loadOf(id: string): LoadSnap | null {
  const row = getDb()
    .prepare(
      `SELECT id, owner_id, origin, destination, equipment, weight_t, pickup_date, specs_json, status, is_demo, awarded_offer_id
       FROM loads WHERE id = ?`,
    )
    .get(id) as LoadSnap | undefined;
  return row ?? null;
}

function collectDrafts(actor: PublicUser, rule: AllocationRule, load: LoadSnap, excluded: { count: number }): Draft[] {
  const db = getDb();
  const carriers = db.prepare(`SELECT id FROM users WHERE role = 'transportista' ORDER BY id`).all() as { id: string }[];
  const pickup = /^\d{4}-\d{2}-\d{2}$/.test(load.pickup_date) ? load.pickup_date : todayChile();
  const equipmentOk = (EQUIPMENT_IDS as readonly string[]).includes(load.equipment);
  const drafts: Draft[] = [];
  for (const carrier of carriers) {
    const person = publicUser(carrier.id);
    if (!person || isCarrierLocked(person) || !isAccredited(person)) {
      excluded.count += 1;
      continue;
    }
    const trucks = db
      .prepare(
        `SELECT id, origin, destination, available_from AS availableFrom, available_to AS availableTo, equipment, tonnage, specs_json AS specsJson
         FROM trucks WHERE owner_id = ?`,
      )
      .all(person.id) as {
      id: string;
      origin: string;
      destination: string;
      availableFrom: string;
      availableTo: string;
      equipment: string;
      tonnage: number;
      specsJson: string;
    }[];
    const cores = trucks
      .filter((truck) => (EQUIPMENT_IDS as readonly string[]).includes(truck.equipment))
      .map((truck) => ({
        id: truck.id,
        equipment: truck.equipment as EquipmentId,
        tonnage: truck.tonnage,
        origin: truck.origin,
        destination: truck.destination,
        availableFrom: truck.availableFrom,
        availableTo: truck.availableTo,
        specs: specsOf(truck.specsJson),
        windowOk: covers(truck.availableFrom, truck.availableTo, pickup),
      }));
    const matched = equipmentOk
      ? matchTrucksForLoad(
          {
            equipment: load.equipment as EquipmentId,
            weightT: load.weight_t,
            origin: load.origin,
            destination: load.destination,
            pickupDate: load.pickup_date,
            specs: specsOf(load.specs_json),
          },
          cores,
        )
      : [];
    const best = matched[0];
    const capacity = carrierCapacitySafe(person.id);
    const score = latestScore(person.id);
    const rate = rateFor(actor, {
      shipperOrgId: rule.shipperOrgId,
      carrierOrgId: carrierOrgId(person.id),
      origin: load.origin,
      destination: load.destination,
      equipment: load.equipment,
      date: pickup,
    });
    const reasons: string[] = [];
    let status: Draft["status"] = "propuesto";
    if (!best) {
      status = "descartado";
      reasons.push("sin camión compatible");
    } else {
      reasons.push(`camión ${equipmentById(best.truck.equipment).label.toLowerCase()} compatible`);
    }
    if (capacity.status === "ocupado") {
      status = "descartado";
      reasons.push(capacity.reason);
    } else {
      reasons.push(capacity.status === "disponible" ? "disponible" : capacity.reason);
    }
    if (score != null) reasons.push(`puntaje ${Math.round(score)}`);
    if (rate != null) reasons.push(`tarifa vigente de ${rate} CLP`);
    if (rule.mode === "directa" && person.id !== rule.carrierUserId) {
      status = "descartado";
      reasons.push("la regla directa fija a otro transportista");
    }
    if (rule.mode === "por_tarifa" && rate == null) {
      status = "descartado";
      reasons.push("sin tarifa vigente");
    }
    if (rule.mode === "por_desempeno" && (score == null || (rule.minScore != null && score < rule.minScore))) {
      status = "descartado";
      reasons.push(score == null ? "sin puntaje" : "puntaje bajo el mínimo");
    }
    const truck = best?.truck as (typeof cores)[number] | undefined;
    drafts.push({
      carrierUserId: person.id,
      truckId: truck?.id ?? null,
      rateClp: rate,
      score,
      matchScore: best ? best.match.score : null,
      availability: capacity.status,
      reasons,
      status,
      composite: 0,
      windowOk: truck?.windowOk ?? false,
      rank: 0,
      attempt: 0,
      nextRetryAt: null,
    });
  }
  return drafts;
}

function carrierCapacitySafe(userId: string) {
  try {
    return carrierCapacity(userId);
  } catch (error) {
    if (error instanceof AppError) return { status: "sin_datos" as const, reason: error.message };
    throw error;
  }
}

function applySteps(rule: AllocationRule, drafts: Draft[], excludedCount: number, now: Date) {
  const decisions: { step: string; input: Record<string, unknown>; output: Record<string, unknown> }[] = [];
  let invited: Draft | null = null;
  const due = new Date(now.getTime() + rule.acceptTimeoutMinutes * 60_000).toISOString();
  for (const step of rule.pasos) {
    if (step.tipo === "filtrar") {
      const discarded = drafts.filter((draft) => draft.status === "descartado").length;
      decisions.push({
        step: "filtrar",
        input: { modo: rule.mode, minScore: rule.minScore, excluidosNoAcreditados: excludedCount },
        output: { vigentes: drafts.filter((draft) => draft.status !== "descartado").length, descartados: discarded },
      });
    } else if (step.tipo === "ordenar") {
      weigh(drafts, rule.pesos);
      drafts.sort((a, b) => compareDrafts(rule.mode, a, b));
      drafts.forEach((draft, index) => {
        draft.rank = index + 1;
      });
      const kept = drafts.filter((draft) => draft.status !== "descartado");
      const empate = kept.length >= 2 && tied(rule.mode, kept[0], kept[1]);
      if (empate) {
        const key = rule.mode === "cascada" ? kept[0].composite : rule.mode === "por_desempeno" ? kept[0].score : kept[0].rateClp;
        for (const draft of kept) {
          const same = rule.mode === "cascada" ? Math.abs(draft.composite - (key as number)) < 1e-9 : rule.mode === "por_desempeno" ? draft.score === key : draft.rateClp === key;
          if (same) draft.reasons.push("empate en el criterio de la regla");
        }
      }
      const winner = kept[0];
      if (winner && rule.mode === "por_tarifa") winner.reasons.unshift("tarifa vigente más baja");
      if (winner && rule.mode === "por_desempeno") winner.reasons.unshift("mayor puntaje");
      if (winner && rule.mode === "cascada") winner.reasons.unshift("mejor puntaje ponderado");
      if (winner && rule.mode === "directa") winner.reasons.unshift("transportista fijado por la regla");
      decisions.push({
        step: "ordenar",
        input: { modo: rule.mode, pesos: rule.pesos },
        output: { orden: kept.map((draft) => draft.carrierUserId), empate },
      });
    } else if (step.tipo === "invitar") {
      invited = drafts.find((draft) => draft.status !== "descartado") ?? null;
      if (invited) {
        invited.attempt = 1;
        invited.nextRetryAt = due;
      }
      decisions.push({
        step: "invitar",
        input: { minutos: rule.acceptTimeoutMinutes },
        output: { invitado: invited?.carrierUserId ?? null, envio: "apagado" },
      });
    } else if (step.tipo === "esperar") {
      decisions.push({
        step: "esperar",
        input: { minutos: rule.acceptTimeoutMinutes },
        output: { vence: invited ? due : null },
      });
    } else {
      const next = drafts.filter((draft) => draft.status !== "descartado" && draft !== invited)[0];
      decisions.push({
        step: "siguiente",
        input: { maxRounds: rule.maxRounds },
        output: { siguiente: next?.carrierUserId ?? null },
      });
    }
  }
  const kept = drafts.filter((draft) => draft.status !== "descartado");
  let status: "propuesta" | "en_cascada" | "agotada" = kept.length ? "propuesta" : "agotada";
  if (invited) status = "en_cascada";
  return { decisions, invited, due, status };
}

export function createRule(user: PublicUser, body: unknown, ip: string | null = null): AllocationRule {
  assertAllocation();
  const etapa = allocationMode();
  const input = parseBody(createSchema, body);
  if (input.pesos && Math.abs(pesosSum(input.pesos) - 1) > 0.001) {
    throw new AppError("Los pesos de costo, desempeño, capacidad y disponibilidad deben sumar 1.");
  }
  if (input.mode === "directa" && !input.carrierUserId) throw new AppError("La regla directa debe indicar el transportista.");
  const org = getDb().prepare(`SELECT kind FROM ops_organizations WHERE id = ?`).get(input.shipperOrgId) as { kind: string } | undefined;
  if (!org || org.kind !== "mandante") throw new AppError("No encontrado.", 404);
  assertCan(user, input.shipperOrgId, "reglas.editar");
  if (input.laneId) {
    const lane = getDb().prepare(`SELECT org_id FROM ops_lanes WHERE id = ?`).get(input.laneId) as { org_id: string } | undefined;
    if (!lane || lane.org_id !== input.shipperOrgId) throw new AppError("La ruta no pertenece a la organización.");
  }
  const pesos = input.pesos ?? DEFAULT_PESOS;
  const pasos = ensureSteps(input.pasos ?? defaultSteps(input.mode));
  const file: WeightFile = { pesos, pasos, carrierUserId: input.carrierUserId ?? null };
  const now = new Date().toISOString();
  const id = randomUUID();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO ops_allocation_rules (
         id, shipper_org_id, lane_id, equipment, mode, weights_json, min_score, accept_timeout_minutes, max_rounds, active, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.shipperOrgId,
      input.laneId ?? null,
      input.equipment ?? null,
      input.mode,
      JSON.stringify(file),
      input.minScore ?? null,
      input.acceptTimeoutMinutes ?? 60,
      input.maxRounds ?? 3,
      input.active === false ? 0 : 1,
      user.id,
      now,
      now,
    );
    auditStrict(user, "ops.asignacion_regla", { type: "ops_asignacion", id }, { mode: input.mode, etapa, orgId: input.shipperOrgId }, ip);
  });
  save();
  const created = ruleRow(id);
  if (!created) throw new AppError("No se pudo guardar la regla.", 500);
  return mapRule(created);
}

export function listRules(user: PublicUser, orgId?: string | null): AllocationRule[] {
  assertAllocation();
  const rows = getDb().prepare(`SELECT * FROM ops_allocation_rules ORDER BY created_at DESC`).all() as RuleRow[];
  return rows.filter((row) => (!orgId || row.shipper_org_id === orgId) && can(user, row.shipper_org_id, "asignacion.ver")).map(mapRule);
}

export function listAllocationRuns(user: PublicUser, shipmentId?: string | null): AllocationRun[] {
  assertAllocation();
  const db = getDb();
  const rows = (
    shipmentId
      ? db.prepare(`SELECT * FROM ops_allocation_runs WHERE shipment_id = ? ORDER BY created_at DESC LIMIT 50`).all(shipmentId)
      : db.prepare(`SELECT * FROM ops_allocation_runs ORDER BY created_at DESC LIMIT 50`).all()
  ) as RunRow[];
  return rows
    .map((row) => loadRunBundle(row.id))
    .filter((run): run is AllocationRun => {
      if (!run) return false;
      if (user.role === "admin") return true;
      const rule = run.ruleId ? ruleRow(run.ruleId) : null;
      return Boolean(rule && can(user, rule.shipper_org_id, "asignacion.ver"));
    });
}

export function getAllocationRun(user: PublicUser, runId: string): AllocationRun {
  assertAllocation();
  const run = loadRunBundle(runId);
  if (!run) throw new AppError("No encontrado.", 404);
  if (user.role !== "admin") {
    const rule = run.ruleId ? ruleRow(run.ruleId) : null;
    if (!rule || !can(user, rule.shipper_org_id, "asignacion.ver")) throw new AppError("No encontrado.", 404);
  }
  return run;
}

export function proposeAllocation(user: PublicUser, body: unknown, ip: string | null = null): AllocationRun {
  assertAllocation();
  const etapa = allocationMode();
  const input = parseBody(proposeSchema, body);
  const ruleRaw = ruleRow(input.ruleId);
  if (!ruleRaw || ruleRaw.active !== 1) throw new AppError("No encontrado.", 404);
  const rule = mapRule(ruleRaw);
  assertCan(user, rule.shipperOrgId, "asignacion.ejecutar");
  const shipment = getDb()
    .prepare(`SELECT id, load_id, shipper_org_id, lane_id FROM ops_shipments WHERE id = ?`)
    .get(input.shipmentId) as { id: string; load_id: string | null; shipper_org_id: string | null; lane_id: string | null } | undefined;
  if (!shipment) throw new AppError("No encontrado.", 404);
  if (shipment.shipper_org_id && shipment.shipper_org_id !== rule.shipperOrgId) {
    throw new AppError("La regla no corresponde a la organización del envío.", 409);
  }
  if (rule.laneId && shipment.lane_id && rule.laneId !== shipment.lane_id) throw new AppError("La regla no corresponde a la ruta del envío.", 409);
  if (!shipment.load_id) throw new AppError("El envío no tiene una carga para proponer.", 409);
  const load = loadOf(shipment.load_id);
  if (!load) throw new AppError("No encontrado.", 404);
  if (rule.equipment && rule.equipment !== load.equipment) throw new AppError("La regla no corresponde al equipo de la carga.", 409);
  const excluded = { count: 0 };
  const drafts = collectDrafts(user, rule, load, excluded);
  const now = new Date();
  const plan = applySteps(rule, drafts, excluded.count, now);
  const stamp = now.toISOString();
  const runId = randomUUID();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO ops_allocation_runs (id, shipment_id, rule_id, mode, status, dry_run, started_by, created_at, finished_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(runId, shipment.id, rule.id, rule.mode, plan.status, user.id, stamp, plan.status === "agotada" ? stamp : null);
    const insertCandidate = db.prepare(
      `INSERT INTO ops_allocation_candidates (
         id, run_id, carrier_user_id, truck_id, rank, rate_clp, score, match_score, availability, reasons_json, status, attempt, next_retry_at, responded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    );
    let invitedId: string | null = null;
    for (const draft of drafts) {
      const id = randomUUID();
      const status = plan.invited === draft ? "invitado" : draft.status;
      if (status === "invitado") invitedId = id;
      insertCandidate.run(
        id,
        runId,
        draft.carrierUserId,
        draft.truckId,
        draft.rank || drafts.length,
        draft.rateClp,
        draft.score,
        draft.matchScore,
        draft.availability,
        JSON.stringify(draft.reasons),
        status,
        status === "invitado" ? draft.attempt : 0,
        status === "invitado" ? draft.nextRetryAt : null,
      );
    }
    for (const decision of plan.decisions) addDecision(db, runId, decision.step, rule.id, decision.input, decision.output, "motor", stamp);
    if (invitedId) enqueueJob(db, VENCER, invitedId, plan.due, 3, stamp);
    appendEvent({
      shipmentId: shipment.id,
      kind: "asignacion.propuesta",
      payload: { runId, estado: plan.status, candidatos: drafts.length, dryRun: true },
      actor: user,
    });
    if (invitedId) {
      appendEvent({
        shipmentId: shipment.id,
        kind: "asignacion.invitacion",
        payload: { runId, candidateId: invitedId, envio: "apagado" },
        actor: user,
      });
    }
    auditStrict(
      user,
      "ops.asignacion_propuesta",
      { type: "ops_asignacion", id: runId },
      { shipmentId: shipment.id, estado: plan.status, dryRun: true, etapa },
      ip,
    );
  });
  save();
  const run = loadRunBundle(runId);
  if (!run) throw new AppError("No se pudo guardar la propuesta.", 500);
  return run;
}

function pickupForOffer(pickup: string): string {
  const today = todayChile();
  if (/^\d{4}-\d{2}-\d{2}$/.test(pickup) && pickup >= today) return pickup;
  return today;
}

function closeConfirmed(user: PublicUser, run: AllocationRun, candidateId: string, offerId: string, ip: string | null) {
  const stamp = new Date().toISOString();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(`UPDATE ops_allocation_runs SET status = 'confirmada', finished_at = ? WHERE id = ?`).run(stamp, run.id);
    db.prepare(`UPDATE ops_allocation_candidates SET status = 'acepto', responded_at = ? WHERE id = ?`).run(stamp, candidateId);
    db.prepare(
      `UPDATE ops_allocation_candidates SET status = 'descartado' WHERE run_id = ? AND id <> ? AND status IN ('propuesto', 'invitado')`,
    ).run(run.id, candidateId);
    db.prepare(
      `UPDATE ops_jobs SET status = 'cancelado', updated_at = ?
       WHERE status = 'pendiente' AND ref_id IN (SELECT id FROM ops_allocation_candidates WHERE run_id = ?)`,
    ).run(stamp, run.id);
    db.prepare(
      `UPDATE ops_allocation_runs SET status = 'cancelada', finished_at = ?
       WHERE shipment_id = ? AND id <> ? AND status IN ('propuesta', 'en_cascada')`,
    ).run(stamp, run.shipmentId, run.id);
    addDecision(db, run.id, "confirmacion", run.ruleId, { candidateId, offerId }, { estado: "confirmada", dryRun: true }, user.id, stamp);
    appendEvent({
      shipmentId: run.shipmentId,
      kind: "asignacion.confirmada",
      payload: { runId: run.id, candidateId, offerId },
      actor: user,
    });
    auditStrict(user, "ops.asignacion_confirmada", { type: "ops_asignacion", id: run.id }, { candidateId, offerId, etapa: allocationMode() }, ip);
  });
  save();
}

export async function confirmAllocation(user: PublicUser, runId: string, candidateId: string | undefined, ip: string | null = null): Promise<AllocationRun> {
  assertAllocation();
  const run = loadRunBundle(runId);
  if (!run) throw new AppError("No encontrado.", 404);
  const rule = run.ruleId ? ruleRow(run.ruleId) : null;
  if (!rule) throw new AppError("No encontrado.", 404);
  assertCan(user, rule.shipper_org_id, "asignacion.ejecutar");
  if (run.status === "confirmada") {
    const chosen = run.candidates.find((candidate) => candidate.status === "acepto");
    if (!candidateId || chosen?.id === candidateId) return run;
    throw new AppError("Esta propuesta ya fue confirmada.", 409);
  }
  if (run.status !== "propuesta" && run.status !== "en_cascada") throw new AppError("Esta propuesta ya no se puede confirmar.", 409);
  const candidate = candidateId
    ? run.candidates.find((item) => item.id === candidateId)
    : (run.candidates.find((item) => item.status === "invitado") ?? run.candidates.find((item) => item.status === "propuesto"));
  if (!candidate || !CANDIDATE_OPEN.includes(candidate.status as (typeof CANDIDATE_OPEN)[number])) {
    throw new AppError("Ese candidato no se puede confirmar.", 409);
  }
  const shipment = getDb().prepare(`SELECT load_id FROM ops_shipments WHERE id = ?`).get(run.shipmentId) as { load_id: string | null } | undefined;
  if (!shipment?.load_id) throw new AppError("El envío no tiene una carga para adjudicar.", 409);
  const load = loadOf(shipment.load_id);
  if (!load) throw new AppError("No encontrado.", 404);
  if (load.is_demo) throw new AppError("Esta carga es de demostración y no se adjudica.", 409);
  if (load.status === "adjudicada") {
    const awarded = getDb()
      .prepare(`SELECT carrier_id FROM offers WHERE id = ?`)
      .get(load.awarded_offer_id) as { carrier_id: string } | undefined;
    if (!awarded || awarded.carrier_id !== candidate.carrierUserId) throw new AppError("Esta carga ya fue adjudicada.", 409);
    closeConfirmed(user, run, candidate.id, load.awarded_offer_id as string, ip);
    return getAllocationRun(user, run.id);
  }
  if ((load.status ?? "abierta") !== "abierta") throw new AppError("Esta carga ya fue adjudicada o cerrada.", 409);
  const existing = getDb()
    .prepare(`SELECT id FROM offers WHERE load_id = ? AND carrier_id = ? AND status = 'activa'`)
    .get(load.id, candidate.carrierUserId) as { id: string } | undefined;
  let offerId = existing?.id ?? null;
  if (!offerId) {
    if (!candidate.rateClp) throw new AppError("No hay tarifa vigente para crear la oferta. La propuesta queda sin adjudicar.", 409);
    const carrier = publicUser(candidate.carrierUserId);
    if (!carrier) throw new AppError("Transportista no encontrado.", 404);
    const created = await submitOffer(
      carrier,
      load.id,
      {
        priceClp: candidate.rateClp,
        pickupDate: pickupForOffer(load.pickup_date),
        truckId: candidate.truckId,
        note: "Propuesta confirmada por una persona. No se envió WhatsApp ni correo.",
      },
      { notify: false },
    );
    offerId = created.offer.id;
  }
  const actor = user.role === "admin" || user.id === load.owner_id ? user : publicUser(load.owner_id);
  if (!actor) throw new AppError("No se encontró a quien publicó la carga.", 409);
  await acceptOffer(actor, offerId, { notify: false });
  closeConfirmed(user, run, candidate.id, offerId, ip);
  return getAllocationRun(user, run.id);
}

function advanceCascade(candidateId: string, now: Date) {
  const db = getDb();
  const stamp = now.toISOString();
  const work = db.transaction(() => {
    const candidate = db.prepare(`SELECT * FROM ops_allocation_candidates WHERE id = ?`).get(candidateId) as CandidateRow | undefined;
    if (!candidate) return;
    const run = db.prepare(`SELECT * FROM ops_allocation_runs WHERE id = ?`).get(candidate.run_id) as RunRow | undefined;
    if (!run || run.status !== "en_cascada") return;
    const rule = run.rule_id ? ruleRow(run.rule_id) : null;
    const open = db.prepare(`SELECT id FROM ops_allocation_candidates WHERE run_id = ? AND status = 'invitado'`).all(run.id) as { id: string }[];
    if (candidate.status === "invitado") {
      db.prepare(`UPDATE ops_allocation_candidates SET status = 'vencido', responded_at = ? WHERE id = ? AND status = 'invitado'`).run(stamp, candidate.id);
      addDecision(db, run.id, "vencimiento", run.rule_id, { candidateId: candidate.id }, { estado: "vencido" }, "motor", stamp);
      appendEvent({ shipmentId: run.shipment_id, kind: "asignacion.vencida", payload: { runId: run.id, candidateId: candidate.id }, actor: null });
    } else if (open.length > 0) {
      return;
    }
    const stillOpen = db.prepare(`SELECT id FROM ops_allocation_candidates WHERE run_id = ? AND status = 'invitado'`).get(run.id);
    if (stillOpen) return;
    const invitedCount = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM ops_allocation_candidates WHERE run_id = ? AND status IN ('invitado', 'acepto', 'rechazo', 'vencido')`)
        .get(run.id) as { n: number }
    ).n;
    const maxRounds = rule?.max_rounds ?? 1;
    const next = db
      .prepare(`SELECT * FROM ops_allocation_candidates WHERE run_id = ? AND status = 'propuesto' ORDER BY rank ASC LIMIT 1`)
      .get(run.id) as CandidateRow | undefined;
    if (!next || invitedCount >= maxRounds) {
      db.prepare(`UPDATE ops_allocation_runs SET status = 'agotada', finished_at = ? WHERE id = ? AND status = 'en_cascada'`).run(stamp, run.id);
      addDecision(db, run.id, "siguiente", run.rule_id, { invitados: invitedCount, maxRounds }, { estado: "agotada" }, "motor", stamp);
      appendEvent({ shipmentId: run.shipment_id, kind: "asignacion.agotada", payload: { runId: run.id }, actor: null });
      return;
    }
    const minutes = rule?.accept_timeout_minutes ?? 60;
    const due = new Date(now.getTime() + minutes * 60_000).toISOString();
    db.prepare(`UPDATE ops_allocation_candidates SET status = 'invitado', attempt = attempt + 1, next_retry_at = ? WHERE id = ? AND status = 'propuesto'`).run(
      due,
      next.id,
    );
    addDecision(db, run.id, "siguiente", run.rule_id, { desde: candidate.id }, { invitado: next.id, vence: due }, "motor", stamp);
    enqueueJob(db, VENCER, next.id, due, 3, stamp);
    appendEvent({ shipmentId: run.shipment_id, kind: "asignacion.invitacion", payload: { runId: run.id, candidateId: next.id, envio: "apagado" }, actor: null });
  });
  work();
}

function recordRetry(job: JobRow, message: string, outcome: "reintento" | "error") {
  try {
    const candidate = getDb().prepare(`SELECT run_id FROM ops_allocation_candidates WHERE id = ?`).get(job.ref_id) as { run_id: string } | undefined;
    const stamp = new Date().toISOString();
    if (candidate) {
      const run = getDb().prepare(`SELECT rule_id FROM ops_allocation_runs WHERE id = ?`).get(candidate.run_id) as { rule_id: string | null } | undefined;
      addDecision(
        getDb(),
        candidate.run_id,
        "reintento",
        run?.rule_id ?? null,
        { jobId: job.id, kind: job.kind },
        { estado: outcome, error: message },
        "motor",
        stamp,
      );
    }
    audit(null, "ops.asignacion_reintento", { type: "ops_asignacion", id: job.id }, { estado: outcome, error: message });
  } catch (error) {
    console.error("[carga360go] No se pudo anotar el reintento", error);
  }
}

const JOBS: Record<string, JobHandler> = {
  [VENCER]: (job, now) => advanceCascade(job.ref_id, now),
};

/** Espera exponencial: 1 min, 2 min, 4 min… hasta 128 min. */
export function retryDelayMs(attempts: number): number {
  const step = Math.min(Math.max(attempts, 1), 8);
  return 60_000 * 2 ** (step - 1);
}

export function processOpsJobs(options: { now?: Date; limit?: number; handlers?: Record<string, JobHandler>; delayMs?: (attempts: number) => number } = {}) {
  assertAllocation();
  const now = options.now ?? new Date();
  const limit = options.limit ?? 20;
  const delay = options.delayMs ?? retryDelayMs;
  const handlers = { ...JOBS, ...options.handlers };
  const db = getDb();
  const due = db
    .prepare(`SELECT * FROM ops_jobs WHERE status = 'pendiente' AND run_after <= ? ORDER BY run_after, id LIMIT ?`)
    .all(now.toISOString(), limit) as JobRow[];
  let done = 0;
  let retried = 0;
  let failed = 0;
  for (const job of due) {
    const claim = db.prepare(`UPDATE ops_jobs SET status = 'en_curso', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pendiente'`).run(
      now.toISOString(),
      job.id,
    );
    if (claim.changes !== 1) continue;
    const attempts = job.attempts + 1;
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`Trabajo desconocido: ${job.kind}`);
      handler(job, now);
      db.prepare(`UPDATE ops_jobs SET status = 'hecho', last_error = NULL, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), job.id);
      done += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Error").slice(0, 500);
      if (attempts >= job.max_attempts) {
        db.prepare(`UPDATE ops_jobs SET status = 'error', last_error = ?, updated_at = ? WHERE id = ?`).run(message, new Date().toISOString(), job.id);
        failed += 1;
        recordRetry(job, message, "error");
      } else {
        const runAfter = new Date(now.getTime() + delay(attempts)).toISOString();
        db.prepare(`UPDATE ops_jobs SET status = 'pendiente', last_error = ?, run_after = ?, updated_at = ? WHERE id = ?`).run(
          message,
          runAfter,
          new Date().toISOString(),
          job.id,
        );
        retried += 1;
        recordRetry(job, message, "reintento");
      }
    }
  }
  return { processed: due.length, done, retried, failed };
}
