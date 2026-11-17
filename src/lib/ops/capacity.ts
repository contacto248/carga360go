import { getDb } from "../db";
import { todayChile } from "../format";

/**
 * Disponibilidad del transportista sin tabla nueva.
 * Usa trucks (ventana y tonelaje), loads.trip_status y documentos vigentes.
 */
export type CapacityStatus = "disponible" | "ocupado" | "sin_datos";

export type CapacityResult = {
  status: CapacityStatus;
  reason: string;
  truckId: string | null;
  tonnage: number | null;
  loadId: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function carrierCapacity(carrierUserId: string, at = new Date()): CapacityResult {
  const db = getDb();
  const day = todayChile(at);
  const busy = db
    .prepare(
      `SELECT l.id AS id FROM loads l
       JOIN offers o ON o.id = l.awarded_offer_id
       WHERE o.carrier_id = ? AND l.trip_status IS NOT NULL AND l.trip_status != '' AND l.trip_status != 'entregado'
       LIMIT 1`,
    )
    .get(carrierUserId) as { id: string } | undefined;
  if (busy) {
    return { status: "ocupado", reason: "Tiene un viaje en curso.", truckId: null, tonnage: null, loadId: busy.id };
  }

  const trucks = db
    .prepare(`SELECT id, available_from AS availableFrom, available_to AS availableTo, tonnage FROM trucks WHERE owner_id = ?`)
    .all(carrierUserId) as { id: string; availableFrom: string; availableTo: string; tonnage: number }[];
  const usable = trucks.filter((truck) => Number.isFinite(truck.tonnage) && truck.tonnage > 0 && chileDay(truck.availableFrom) && chileDay(truck.availableTo));
  if (!usable.length) {
    return { status: "sin_datos", reason: "Sin camión publicado con ventana y tonelaje.", truckId: null, tonnage: null, loadId: null };
  }
  const open = usable.find((truck) => {
    const from = chileDay(truck.availableFrom);
    const to = chileDay(truck.availableTo);
    return !!from && !!to && from <= day && day <= to;
  });
  if (!open) {
    return { status: "sin_datos", reason: "El camión está fuera de la ventana consultada.", truckId: null, tonnage: null, loadId: null };
  }
  if (!hasCurrentDocs(carrierUserId, day)) {
    return { status: "sin_datos", reason: "Sin documentos vigentes para confirmar disponibilidad.", truckId: null, tonnage: null, loadId: null };
  }
  return {
    status: "disponible",
    reason: "Camión en ventana, sin viaje en curso y con documentos vigentes.",
    truckId: open.id,
    tonnage: open.tonnage,
    loadId: null,
  };
}

function hasCurrentDocs(carrierUserId: string, day: string): boolean {
  const db = getDb();
  if (tableExists(db, "documents")) {
    const row = db
      .prepare(
        `SELECT 1 AS ok FROM documents WHERE user_id = ? AND verification_status = 'verificado' AND expiry >= ? LIMIT 1`,
      )
      .get(carrierUserId, day);
    if (row) return true;
  }
  if (tableExists(db, "documentos_acreditacion")) {
    const row = db
      .prepare(
        `SELECT 1 AS ok FROM documentos_acreditacion
         WHERE user_id = ? AND estado_admin = 'aprobado' AND vencimiento IS NOT NULL AND vencimiento >= ? LIMIT 1`,
      )
      .get(carrierUserId, day);
    if (row) return true;
  }
  return false;
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
