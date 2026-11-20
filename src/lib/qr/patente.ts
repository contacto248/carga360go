import { getDb } from "../db";
import { qrFase1Enabled } from "./flag";
import { normalizePatente } from "../security";

const SPEC_KEYS = ["patente", "placa", "plate", "patenteCamion", "patente_camion"];

export type PatenteOrigen = "columna" | "specs_json" | "documento" | null;

export type PatenteResuelta = { patente: string | null; origen: PatenteOrigen };

function fromSpecs(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of SPEC_KEYS) {
      const value = parsed[key];
      if (typeof value === "string") {
        const patente = normalizePatente(value);
        if (patente) return patente;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function fromHolder(holder: string | null | undefined): string | null {
  if (!holder) return null;
  const marked = holder.match(/patente\s*([a-z0-9-]{5,12})/i);
  if (marked) return normalizePatente(marked[1]);
  return normalizePatente(holder);
}

/**
 * La columna trucks.patente manda. Si está vacía, se reutiliza specs_json y,
 * si tampoco está, la patente ya guardada en el padrón (documents.holder_name).
 */
export function resolverPatente(truckId: string): PatenteResuelta {
  if (!qrFase1Enabled()) return { patente: null, origen: null };
  const db = getDb();
  const truck = db.prepare(`SELECT patente, specs_json, owner_id FROM trucks WHERE id = ?`).get(truckId) as
    | { patente: string | null; specs_json: string; owner_id: string }
    | undefined;
  if (!truck) return { patente: null, origen: null };
  const column = normalizePatente(truck.patente || "");
  if (column) return { patente: column, origen: "columna" };
  const specs = fromSpecs(truck.specs_json);
  if (specs) return { patente: specs, origen: "specs_json" };
  const docs = db
    .prepare(
      `SELECT holder_name FROM documents
       WHERE user_id = ? AND truck_id = ? AND type IN ('padron', 'revision', 'permiso', 'soap')
       ORDER BY created_at DESC`,
    )
    .all(truck.owner_id, truckId) as { holder_name: string | null }[];
  for (const doc of docs) {
    const patente = fromHolder(doc.holder_name);
    if (patente) return { patente, origen: "documento" };
  }
  return { patente: null, origen: null };
}

export function guardarPatente(truckId: string, patente: string) {
  if (!qrFase1Enabled()) return;
  getDb().prepare(`UPDATE trucks SET patente = ? WHERE id = ? AND (patente IS NULL OR patente = '')`).run(patente, truckId);
}

export function formatPatente(patente: string): string {
  if (/^[A-Z]{4}\d{2}$/.test(patente)) return `${patente.slice(0, 4)}-${patente.slice(4)}`;
  if (/^[A-Z]{2}\d{4}$/.test(patente)) return `${patente.slice(0, 2)}-${patente.slice(2)}`;
  return patente;
}
