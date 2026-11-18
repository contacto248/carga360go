import { randomUUID } from "crypto";
import { isEquipmentId } from "../catalog";
import { getDb } from "../db";
import { matchLoadToTruck } from "../match";
import type { EquipmentId, LoadCore, MatchResult, Specs, TruckCore, VerificationStatus } from "../types";

/**
 * Sugerencias al publicar una carga.
 * El calce de ida reutiliza matchLoadToTruck. El retorno invierte el corredor del camión
 * y vuelve a usar el mismo calce: el matcher descarta la ruta exactamente inversa.
 * La geografía es la del catálogo y, en el costo de referencia, OSRM; aquí no se cotiza.
 */

const MAX_PER_KIND = 5;

export type SuggestLoad = LoadCore & { id: string; ownerId: string; isDemo: boolean };

export type SuggestTruck = TruckCore & {
  id: string;
  ownerId: string;
  isDemo: boolean;
  ownerVerification: VerificationStatus;
};

export type SuggestionKind = "compatible" | "retorno";

export type SuggestionDraft = {
  truck: SuggestTruck;
  kind: SuggestionKind;
  score: number;
  reasons: string[];
};

export type StoredSuggestion = {
  id: string;
  loadId: string;
  truckId: string;
  carrierId: string | null;
  carrierName: string | null;
  kind: SuggestionKind;
  score: number;
  reasons: string[];
  origin: string;
  destination: string;
  equipment: string;
  tonnage: number;
  createdAt: string;
};

function noPrice(reasons: string[]): string[] {
  return reasons.filter((reason) => !/\$\s?\d|\bCLP\b|\bpesos\b|d[ií]as gratis/i.test(reason)).slice(0, 8);
}

function withVerification(reasons: string[], truck: SuggestTruck): string[] {
  if (truck.ownerVerification === "verificado") return reasons;
  return [...reasons, "La cuenta del transportista no está verificada"];
}

export function suggestForLoad(load: SuggestLoad, trucks: SuggestTruck[]): SuggestionDraft[] {
  if (load.isDemo) return [];
  const compatible: SuggestionDraft[] = [];
  const retorno: SuggestionDraft[] = [];
  for (const truck of trucks) {
    if (truck.isDemo || truck.ownerId === load.ownerId) continue;
    const forward = matchLoadToTruck(load, truck);
    if (forward) {
      compatible.push({ truck, kind: "compatible", score: forward.score, reasons: noPrice(withVerification(forward.reasons, truck)) });
      continue;
    }
    const reversed: TruckCore = { ...truck, origin: truck.destination, destination: truck.origin };
    const back: MatchResult | null = matchLoadToTruck(load, reversed);
    if (!back) continue;
    const corridor = back.reasons.filter((reason) => !/^(Mismo origen|Mismo destino|Origen cercano|Destino cercano)/.test(reason));
    retorno.push({
      truck,
      kind: "retorno",
      score: back.score,
      reasons: noPrice(withVerification([`Corredor de retorno: camión ${truck.origin} → ${truck.destination}`, ...corridor], truck)),
    });
  }
  const top = (items: SuggestionDraft[]) => items.sort((a, b) => b.score - a.score).slice(0, MAX_PER_KIND);
  return [...top(compatible), ...top(retorno)];
}

function parseSpecs(raw: string): Specs {
  try {
    const value = JSON.parse(raw) as Specs;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function loadTrucks(): SuggestTruck[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.owner_id, t.origin, t.destination, t.available_from, t.available_to, t.equipment, t.tonnage,
              t.specs_json, t.is_demo, u.verification_status
       FROM trucks t JOIN users u ON u.id = t.owner_id
       WHERE t.is_demo = 0`,
    )
    .all() as {
    id: string;
    owner_id: string;
    origin: string;
    destination: string;
    available_from: string;
    available_to: string;
    equipment: string;
    tonnage: number;
    specs_json: string;
    is_demo: number;
    verification_status: VerificationStatus;
  }[];
  return rows.flatMap((row) => {
    if (!isEquipmentId(row.equipment)) return [];
    return [
      {
        id: row.id,
        ownerId: row.owner_id,
        origin: row.origin,
        destination: row.destination,
        availableFrom: row.available_from,
        availableTo: row.available_to,
        equipment: row.equipment,
        tonnage: row.tonnage,
        specs: parseSpecs(row.specs_json),
        isDemo: false,
        ownerVerification: row.verification_status,
      },
    ];
  });
}

export function recordLoadSuggestions(load: SuggestLoad): StoredSuggestion[] {
  if (load.isDemo) return [];
  const drafts = suggestForLoad(load, loadTrucks());
  const db = getDb();
  const stamp = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO load_suggestions (
      id, load_id, truck_id, carrier_id, kind, score, reasons_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const save = db.transaction(() => {
    for (const draft of drafts) {
      insert.run(randomUUID(), load.id, draft.truck.id, draft.truck.ownerId, draft.kind, draft.score, JSON.stringify(draft.reasons), stamp);
    }
  });
  save();
  return listLoadSuggestions(load.id);
}

export function listLoadSuggestions(loadId: string): StoredSuggestion[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.load_id, s.truck_id, s.carrier_id, s.kind, s.score, s.reasons_json, s.created_at,
              t.origin, t.destination, t.equipment, t.tonnage, u.razon_social AS carrier_name
       FROM load_suggestions s
       JOIN trucks t ON t.id = s.truck_id
       LEFT JOIN users u ON u.id = s.carrier_id
       WHERE s.load_id = ?
       ORDER BY s.kind, s.score DESC`,
    )
    .all(loadId) as {
    id: string;
    load_id: string;
    truck_id: string;
    carrier_id: string | null;
    kind: SuggestionKind;
    score: number;
    reasons_json: string;
    created_at: string;
    origin: string;
    destination: string;
    equipment: string;
    tonnage: number;
    carrier_name: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    loadId: row.load_id,
    truckId: row.truck_id,
    carrierId: row.carrier_id,
    carrierName: row.carrier_name,
    kind: row.kind,
    score: row.score,
    reasons: JSON.parse(row.reasons_json) as string[],
    origin: row.origin,
    destination: row.destination,
    equipment: row.equipment as EquipmentId,
    tonnage: row.tonnage,
    createdAt: row.created_at,
  }));
}

