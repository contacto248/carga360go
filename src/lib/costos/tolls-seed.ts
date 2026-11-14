import type Database from "better-sqlite3";
import { TOLL_PLAZAS, TOLL_SOURCES } from "./tolls-data";

export const TOLLS_CHECKED_AT = "2026-11-14T12:00:00.000Z";

/** Carga inicial (idempotente) de fuentes, plazas y tarifas verificadas. La llama la migración 16. */
export function seedTolls(db: Database.Database) {
  const insSource = db.prepare(
    `INSERT OR IGNORE INTO cost_sources (id, kind, name, url, expected_sha256, last_sha256, status, last_ok_at, updated_at)
     VALUES (?, 'peaje', ?, ?, ?, ?, 'ok', ?, ?)`,
  );
  const insPlaza = db.prepare(
    `INSERT OR IGNORE INTO cost_toll_plazas (id, name, concession, route, km, lat, lon, direction, scheme, kind, location_source, location_note, source_id, note, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  const insRate = db.prepare(
    `INSERT OR IGNORE INTO cost_toll_rates (id, plaza_id, category, rate_type, amount, valid_from, valid_to, source_id, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const s of TOLL_SOURCES) insSource.run(s.id, s.name, s.url, s.sha256, s.sha256, TOLLS_CHECKED_AT, TOLLS_CHECKED_AT);
  for (const p of TOLL_PLAZAS) {
    const src = TOLL_SOURCES.find((s) => s.id === p.sourceId)!;
    insPlaza.run(p.id, p.name, p.concession, p.route, p.km, p.lat, p.lon, p.direction, p.scheme, p.kind, p.locationSource, p.locationNote, p.sourceId, p.note ?? null);
    for (const r of p.rates) {
      insRate.run(`${p.id}:${r.category}:${r.rateType}:${src.validFrom}`, p.id, r.category, r.rateType, r.amount, src.validFrom, src.validTo, src.id, TOLLS_CHECKED_AT);
    }
  }
}

