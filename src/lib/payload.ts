import type { LoadInput, TruckInput } from "./listings";
import type { Specs } from "./types";

function specsOf(value: unknown): Specs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Specs;
}

export function loadFromPayload(body: Record<string, unknown>): LoadInput {
  const budget = body.budgetClp;
  return {
    origin: String(body.origin ?? ""),
    destination: String(body.destination ?? ""),
    pickupDate: String(body.pickupDate ?? ""),
    equipment: String(body.equipment ?? ""),
    description: String(body.description ?? ""),
    weightT: Number(body.weightT),
    specs: specsOf(body.specs),
    budgetClp: budget === null || budget === undefined || budget === "" ? null : Number(budget),
    notes: body.notes == null ? null : String(body.notes),
    soloVerificados: body.soloVerificados === true || body.soloVerificados === "true" || body.soloVerificados === 1,
    offerHours: body.offerHours === null || body.offerHours === undefined || body.offerHours === "" ? null : Number(body.offerHours),
    allowImprove: typeof body.allowImprove === "boolean" ? body.allowImprove : null,
  };
}

export function truckFromPayload(body: Record<string, unknown>): TruckInput {
  return {
    origin: String(body.origin ?? ""),
    destination: String(body.destination ?? ""),
    availableFrom: String(body.availableFrom ?? ""),
    availableTo: String(body.availableTo ?? ""),
    equipment: String(body.equipment ?? ""),
    tonnage: Number(body.tonnage),
    specs: specsOf(body.specs),
    notes: body.notes == null ? null : String(body.notes),
  };
}
