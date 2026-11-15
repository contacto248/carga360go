import { randomUUID } from "crypto";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { isTripStatus } from "../viaje";
import type { QualityView, Severity } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trip_authorizations (
  load_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('autorizada', 'rechazada', 'en_revision')),
  note TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bassam_quality_decisions (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('baja','media','alta','muy_alta')),
  rule_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('resuelto','solicitar_revision','sin_datos','pendiente_gerente','aprobado')),
  result TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('agente_calidad','gerente')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bassam_quality_load ON bassam_quality_decisions(load_id, created_at);
`;

const IN_TRANSIT = new Set(["en_camino", "retirado", "en_transito"]);

export type TripFacts = {
  tripStatus: string | null;
  origin: string;
  destination: string;
  eventCount: number;
  gpsCount: number;
  hasCarrier: boolean;
};

export type Finding = {
  severity: Severity;
  ruleId: string;
  decision: "resuelto" | "solicitar_revision" | "sin_datos" | "pendiente_gerente";
  result: string;
  needsManager: boolean;
  authorization: "autorizada" | "en_revision" | null;
};

/** Reglas fijas sobre hechos del viaje. No llama a ningún proveedor de IA. */
export function evaluateQuality(facts: TripFacts): Finding {
  if (facts.tripStatus === "incidencia") {
    return {
      severity: "muy_alta",
      ruleId: "incidencia-abierta",
      decision: "pendiente_gerente",
      result: "Hay una incidencia registrada. Queda para revisión de gerencia.",
      needsManager: true,
      authorization: null,
    };
  }
  if (!facts.origin.trim() || !facts.destination.trim() || !facts.hasCarrier) {
    return {
      severity: "alta",
      ruleId: "viaje-incompleto",
      decision: "solicitar_revision",
      result: "Faltan origen, destino o transportista adjudicado.",
      needsManager: false,
      authorization: "en_revision",
    };
  }
  if (!Number.isInteger(facts.eventCount) || facts.eventCount <= 0) {
    return {
      severity: "media",
      ruleId: "historial-vacio",
      decision: "sin_datos",
      result: "sin datos",
      needsManager: false,
      authorization: null,
    };
  }
  if (isTripStatus(facts.tripStatus) && IN_TRANSIT.has(facts.tripStatus) && facts.gpsCount <= 0) {
    return {
      severity: "media",
      ruleId: "transito-sin-gps",
      decision: "resuelto",
      result: "En tránsito sin punto GPS: sin datos.",
      needsManager: false,
      authorization: "autorizada",
    };
  }
  if (facts.tripStatus !== null && !isTripStatus(facts.tripStatus)) {
    return {
      severity: "alta",
      ruleId: "estado-desconocido",
      decision: "solicitar_revision",
      result: "El estado del viaje no está en el catálogo.",
      needsManager: false,
      authorization: "en_revision",
    };
  }
  return {
    severity: "baja",
    ruleId: "rutina-sin-excepcion",
    decision: "resuelto",
    result: "Viaje rutinario, sin incidencia.",
    needsManager: false,
    authorization: "autorizada",
  };
}

function ensureQuality() {
  getDb().exec(SCHEMA);
}

type FactRow = TripFacts & { id: string; route: string };

function factRows(): FactRow[] {
  const rows = getDb()
    .prepare(
      `SELECT l.id AS id, l.origin AS origin, l.destination AS destination, l.trip_status AS tripStatus,
              o.carrier_id AS carrierId,
              (SELECT COUNT(*) FROM trip_events e WHERE e.load_id = l.id) AS eventCount,
              (SELECT COUNT(*) FROM trip_gps_points g WHERE g.load_id = l.id) AS gpsCount
       FROM loads l LEFT JOIN offers o ON o.id = l.awarded_offer_id
       WHERE l.status = 'adjudicada' AND l.is_demo = 0`,
    )
    .all() as { id: string; origin: string; destination: string; tripStatus: string | null; carrierId: string | null; eventCount: number; gpsCount: number }[];
  return rows.map((row) => ({
    id: row.id,
    route: `${row.origin} → ${row.destination}`,
    origin: row.origin,
    destination: row.destination,
    tripStatus: row.tripStatus,
    eventCount: row.eventCount,
    gpsCount: row.gpsCount,
    hasCarrier: Boolean(row.carrierId),
  }));
}

type Latest = { severity: Severity; ruleId: string; decision: string; result: string; actor: "agente_calidad" | "gerente" };

function latestOf(loadId: string): Latest | undefined {
  return getDb()
    .prepare(
      `SELECT severity, rule_id AS ruleId, decision, result, actor
       FROM bassam_quality_decisions WHERE load_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(loadId) as Latest | undefined;
}

function sameFinding(latest: Latest, finding: Finding): boolean {
  if (latest.actor === "gerente" && latest.decision === "aprobado" && latest.ruleId === finding.ruleId && finding.needsManager) return true;
  return latest.ruleId === finding.ruleId && latest.decision === finding.decision && latest.result === finding.result && latest.severity === finding.severity;
}

export function runQualityAgent(user: PublicUser): void {
  if (!user || user.role !== "admin") throw new AppError("Acceso exclusivo de administración.", 403);
  ensureQuality();
  const db = getDb();
  db.transaction(() => {
    for (const fact of factRows()) {
      const finding = evaluateQuality(fact);
      const latest = latestOf(fact.id);
      if (latest && sameFinding(latest, finding)) continue;
      const stamp = new Date().toISOString();
      db.prepare(
        `INSERT INTO bassam_quality_decisions (id, load_id, severity, rule_id, decision, result, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'agente_calidad', ?)`,
      ).run(randomUUID(), fact.id, finding.severity, finding.ruleId, finding.decision, finding.result, stamp);
      if (finding.authorization) {
        const existing = db.prepare(`SELECT 1 FROM trip_authorizations WHERE load_id = ?`).get(fact.id);
        if (!existing) {
          db.prepare(`INSERT INTO trip_authorizations (load_id, status, note, updated_at) VALUES (?, ?, NULL, ?)`).run(fact.id, finding.authorization, stamp);
        }
      }
      auditStrict(user, "bassam.agente", { type: "viaje", id: fact.id }, {
        actor: "agente_calidad",
        severity: finding.severity,
        ruleId: finding.ruleId,
        decision: finding.decision,
        result: finding.result,
        at: stamp,
      });
    }
  })();
}

export function approveByManager(user: PublicUser, loadId: string) {
  if (!user || user.role !== "admin") throw new AppError("Acceso exclusivo de administración.", 403);
  ensureQuality();
  const load = getDb()
    .prepare(`SELECT id, status, is_demo AS isDemo FROM loads WHERE id = ?`)
    .get(loadId) as { id: string; status: string; isDemo: number } | undefined;
  if (!load || load.status !== "adjudicada" || load.isDemo) throw new AppError("Solo se aprueba un viaje adjudicado.", 409);
  const latest = latestOf(loadId);
  if (!latest || latest.severity !== "muy_alta" || latest.decision !== "pendiente_gerente") {
    throw new AppError("Aprobado solo aparece cuando la severidad es muy alta.", 409);
  }
  const stamp = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO bassam_quality_decisions (id, load_id, severity, rule_id, decision, result, actor, created_at)
       VALUES (?, ?, 'muy_alta', ?, 'aprobado', 'Aprobado por gerencia.', 'gerente', ?)`,
    ).run(randomUUID(), loadId, latest.ruleId, stamp);
    db.prepare(
      `INSERT INTO trip_authorizations (load_id, status, note, updated_at) VALUES (?, 'autorizada', NULL, ?)
       ON CONFLICT(load_id) DO UPDATE SET status = 'autorizada', updated_at = excluded.updated_at`,
    ).run(loadId, stamp);
    auditStrict(user, "bassam.aprobado", { type: "viaje", id: loadId }, {
      actor: "gerente",
      severity: "muy_alta",
      ruleId: latest.ruleId,
      decision: "aprobado",
      result: "Aprobado por gerencia.",
      at: stamp,
    });
  })();
  return { loadId, status: "autorizada" as const, updatedAt: stamp };
}

export function qualityHistory(): QualityView[] {
  ensureQuality();
  const rows = getDb()
    .prepare(
      `SELECT d.id, d.load_id AS loadId, d.created_at AS at, d.severity, d.rule_id AS ruleId, d.decision, d.result, d.actor,
              l.origin AS origin, l.destination AS destination
       FROM bassam_quality_decisions d LEFT JOIN loads l ON l.id = d.load_id
       ORDER BY d.created_at DESC, d.rowid DESC LIMIT 80`,
    )
    .all() as { id: string; loadId: string; at: string; severity: Severity; ruleId: string; decision: QualityView["decision"]; result: string; actor: QualityView["actor"]; origin: string | null; destination: string | null }[];
  return rows.map((row) => ({
    id: row.id,
    loadId: row.loadId,
    at: row.at,
    severity: row.severity,
    ruleId: row.ruleId,
    decision: row.decision,
    result: row.result,
    actor: row.actor,
    route: row.origin && row.destination ? `${row.origin} → ${row.destination}` : "sin datos",
  }));
}

export function latestQualityMap(): Map<string, { severity: Severity; ruleId: string; decision: string; needsManager: boolean }> {
  ensureQuality();
  const rows = getDb()
    .prepare(`SELECT load_id AS loadId, severity, rule_id AS ruleId, decision FROM bassam_quality_decisions ORDER BY created_at DESC, rowid DESC`)
    .all() as { loadId: string; severity: Severity; ruleId: string; decision: string }[];
  const map = new Map<string, { severity: Severity; ruleId: string; decision: string; needsManager: boolean }>();
  for (const row of rows) {
    if (map.has(row.loadId)) continue;
    map.set(row.loadId, { severity: row.severity, ruleId: row.ruleId, decision: row.decision, needsManager: row.severity === "muy_alta" && row.decision === "pendiente_gerente" });
  }
  return map;
}
