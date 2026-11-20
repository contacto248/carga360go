import { randomUUID } from "crypto";
import type { Database } from "better-sqlite3";
import { ensureShipmentForLoad, eventHash } from "../ops/shipments";
import type { PublicUser } from "../types";

type Actor = Pick<PublicUser, "id" | "email"> | null;

/**
 * Bitácora encadenada del QR. Reutiliza ops_events (prev_hash / hash).
 * El payload no lleva nombres, RUT, teléfonos, direcciones ni montos.
 */
export function prepararCadena(loadId: string, actor: Actor) {
  return ensureShipmentForLoad(loadId, actor ?? undefined);
}

export function escribirEvento(
  db: Database,
  shipmentId: string,
  kind: string,
  payload: Record<string, string | number | boolean | null>,
  actorId: string | null,
  createdAt: string,
) {
  const last = db.prepare(`SELECT seq, hash FROM ops_events WHERE shipment_id = ? ORDER BY seq DESC LIMIT 1`).get(shipmentId) as
    | { seq: number; hash: string }
    | undefined;
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? "";
  const payloadJson = JSON.stringify(payload);
  const hash = eventHash(prevHash, seq, kind, payloadJson, createdAt);
  db.prepare(
    `INSERT INTO ops_events (id, shipment_id, seq, actor_id, kind, payload_json, prev_hash, hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), shipmentId, seq, actorId, kind, payloadJson, prevHash, hash, createdAt);
  db.prepare(`UPDATE ops_shipments SET updated_at = ? WHERE id = ?`).run(createdAt, shipmentId);
}
