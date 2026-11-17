import { getDb } from "../db";
import { todayChile } from "../format";

/**
 * Disponibilidad del transportista sin tabla nueva.
 * Usa trucks (ventana y tonelaje), loads.trip_status y documentos vigentes.
 */
export type CapacityStatus = "disponible" | "ocupado" | "sin_datos";

export type CapacityReasonCode = "SIN_CAMION" | "FUERA_VENTANA" | "SIN_DOCUMENTOS" | "OCUPADO";

export type CapacityResult = {
  status: CapacityStatus;
  reason: string;
  /** Null solo cuando el transportista está disponible. */
  reasonCode: CapacityReasonCode | null;
  truckId: string | null;
  tonnage: number | null;
  loadId: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Disponibilidad medida en la fecha de retiro.
 * Un string YYYY-MM-DD es ese día. Un Date es el día de Chile de ese instante
 * (lo usan las pruebas que ya pasaban una fecha). No sustituye el día de retiro por hoy.
 */
export function carrierCapacity(carrierUserId: string, pickupDate: string | Date = new Date()): CapacityResult {
  const db = getDb();
  const day = referenceDay(pickupDate);
  const busy = db
    .prepare(
      `SELECT l.id AS id FROM loads l
       JOIN offers o ON o.id = l.awarded_offer_id
       WHERE o.carrier_id = ? AND l.trip_status IS NOT NULL AND l.trip_status != '' AND l.trip_status != 'entregado'
       LIMIT 1`,
    )
    .get(carrierUserId) as { id: string } | undefined;
  if (busy) {
    return { status: "ocupado", reason: "Tiene un viaje en curso.", reasonCode: "OCUPADO", truckId: null, tonnage: null, loadId: busy.id };
  }

  const trucks = db
    .prepare(`SELECT id, available_from AS availableFrom, available_to AS availableTo, tonnage FROM trucks WHERE owner_id = ?`)
    .all(carrierUserId) as { id: string; availableFrom: string; availableTo: string; tonnage: number }[];
  const usable = trucks.filter((truck) => Number.isFinite(truck.tonnage) && truck.tonnage > 0 && chileDay(truck.availableFrom) && chileDay(truck.availableTo));
  if (!usable.length) {
    return { status: "sin_datos", reason: "Sin camión publicado con ventana y tonelaje.", reasonCode: "SIN_CAMION", truckId: null, tonnage: null, loadId: null };
  }
  const open = usable.find((truck) => {
    const from = chileDay(truck.availableFrom);
    const to = chileDay(truck.availableTo);
    return !!from && !!to && from <= day && day <= to;
  });
  if (!open) {
    return {
      status: "sin_datos",
      reason: "El camión está fuera de la ventana consultada.",
      reasonCode: "FUERA_VENTANA",
      truckId: null,
      tonnage: null,
      loadId: null,
    };
  }
  if (!hasCurrentDocs(carrierUserId, day)) {
    return {
      status: "sin_datos",
      reason: "Sin documentos vigentes para confirmar disponibilidad.",
      reasonCode: "SIN_DOCUMENTOS",
      truckId: null,
      tonnage: null,
      loadId: null,
    };
  }
  return {
    status: "disponible",
    reason: "Camión en ventana, sin viaje en curso y con documentos vigentes.",
    reasonCode: null,
    truckId: open.id,
    tonnage: open.tonnage,
    loadId: null,
  };
}

function referenceDay(pickupDate: string | Date): string {
  if (typeof pickupDate === "string" && DAY.test(pickupDate)) return pickupDate;
  return todayChile(pickupDate instanceof Date ? pickupDate : new Date());
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
