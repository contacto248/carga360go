import { getDb } from "../db";
import { daysBetween, todayChile } from "../format";
import { TRIP_LABEL, TRIP_STATUSES } from "../viaje";
import type { EstadoConteo, GestionSnapshot } from "./types";

const LOAD_LABEL: Record<string, string> = { abierta: "Abierta", adjudicada: "Adjudicada", cerrada: "Cerrada" };
const LEAD_LABEL: Record<string, string> = { nuevo: "Nuevo", en_gestion: "En gestión", cerrado: "Cerrado", descartado: "Descartado" };

function countOf(sql: string, ...params: string[]): number {
  return (getDb().prepare(sql).get(...params) as { n: number }).n;
}

function grouped(sql: string, ...params: string[]): { estado: string; n: number }[] {
  return getDb().prepare(sql).all(...params) as { estado: string; n: number }[];
}

function ordered(rows: { estado: string; n: number }[], order: readonly string[], labels: { [key: string]: string | undefined }): EstadoConteo[] {
  const map = new Map(rows.map((row) => [row.estado, row.n]));
  const known = order.map((estado) => ({ estado, label: labels[estado] ?? estado, n: map.get(estado) ?? 0 }));
  const extra = rows
    .filter((row) => !order.includes(row.estado))
    .map((row) => ({ estado: row.estado, label: labels[row.estado] ?? row.estado, n: row.n }));
  return [...known, ...extra];
}

/** Indicadores leídos de la base. Cero filas se muestran como [sin datos] en el tablero. */
export function gestionSnapshot(today = todayChile(), now = new Date()): GestionSnapshot {
  const stamp = now.toISOString();
  const cargasRows = grouped(
    `SELECT COALESCE(status, 'abierta') AS estado, COUNT(*) AS n FROM loads WHERE is_demo = 0 GROUP BY COALESCE(status, 'abierta')`,
  );
  const cargasTotal = cargasRows.reduce((sum, row) => sum + row.n, 0);
  const viajeRows = grouped(
    `SELECT COALESCE(trip_status, 'asignado') AS estado, COUNT(*) AS n
     FROM loads WHERE is_demo = 0 AND status = 'adjudicada' GROUP BY COALESCE(trip_status, 'asignado')`,
  );
  const viajesTotal = viajeRows.reduce((sum, row) => sum + row.n, 0);
  const leadRows = grouped(
    `SELECT status AS estado, COUNT(*) AS n FROM agent_leads GROUP BY status`,
  );
  const leadsTotal = leadRows.reduce((sum, row) => sum + row.n, 0);
  const docs = getDb().prepare(`SELECT expiry FROM documents`).all() as { expiry: string }[];
  let documentosPorVencer = 0;
  for (const doc of docs) {
    const days = daysBetween(today, doc.expiry);
    if (days >= 0 && days <= 30) documentosPorVencer += 1;
  }
  const muestras = getDb()
    .prepare(
      `SELECT l.id AS loadId, l.origin || ' → ' || l.destination AS route, COUNT(*) AS camiones
       FROM load_suggestions s JOIN loads l ON l.id = s.load_id
       WHERE s.kind = 'retorno' AND l.is_demo = 0
       GROUP BY l.id
       ORDER BY MAX(s.created_at) DESC
       LIMIT 8`,
    )
    .all() as { loadId: string; route: string; camiones: number }[];
  return {
    generatedAt: stamp,
    cargasPorEstado: ordered(cargasRows, ["abierta", "adjudicada", "cerrada"], LOAD_LABEL),
    cargasTotal,
    viajes: ordered(viajeRows, TRIP_STATUSES, TRIP_LABEL as { [key: string]: string }),
    viajesTotal,
    transportistasActivos: countOf(
      `SELECT COUNT(*) AS n FROM users
       WHERE role = 'transportista' AND verification_status = 'verificado'
         AND (locked_until IS NULL OR locked_until <= ?)`,
      stamp,
    ),
    camionesActivos: countOf(`SELECT COUNT(*) AS n FROM trucks WHERE is_demo = 0 AND available_to >= ?`, today),
    leads: ordered(leadRows, ["nuevo", "en_gestion", "cerrado", "descartado"], LEAD_LABEL),
    leadsTotal,
    retornos: countOf(`SELECT COUNT(DISTINCT load_id) AS n FROM load_suggestions WHERE kind = 'retorno'`),
    retornoMuestras: muestras,
    compatibles: countOf(`SELECT COUNT(DISTINCT load_id) AS n FROM load_suggestions WHERE kind = 'compatible'`),
    alertasEnviadas: countOf(`SELECT COUNT(*) AS n FROM alert_log`),
    alertasGuardadas: countOf(`SELECT COUNT(*) AS n FROM saved_searches`),
    alertasOps: countOf(`SELECT COUNT(*) AS n FROM ops_alerts WHERE status = 'abierta'`),
    documentosPorVencer,
  };
}

