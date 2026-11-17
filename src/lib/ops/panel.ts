import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { readAllocationRuns, type AllocationRun } from "./allocation";
import { assertEnabled } from "./flags";
import { listOrganizations, type OpsOrganization } from "./organizations";
import { can } from "./permissions";
import { listContracts, listRateCards } from "./procurement";
import { listScores, type ScoreView } from "./scoring";
import { listShipments, type OpsShipment } from "./shipments";

export const OPS_PANEL_SECTIONS = ["contratos", "tarifas", "desempeno", "asignacion", "envios"] as const;
export type OpsPanelSection = (typeof OPS_PANEL_SECTIONS)[number];

export type OpsPanelData = {
  generatedAt: string;
  orgs: OpsOrganization[];
  contracts: ReturnType<typeof listContracts>;
  rateCards: ReturnType<typeof listRateCards>;
  scores: ScoreView[];
  runs: AllocationRun[];
  shipments: OpsShipment[];
  names: Record<string, string>;
};

export function panelSection(value: string | string[] | undefined): OpsPanelSection {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "tarifas" || raw === "desempeno" || raw === "asignacion" || raw === "envios") return raw;
  return "contratos";
}

function namesFor(ids: string[]): Record<string, string> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const rows = getDb()
    .prepare(`SELECT id, razon_social FROM users WHERE id IN (${unique.map(() => "?").join(", ")})`)
    .all(...unique) as { id: string; razon_social: string }[];
  return Object.fromEntries(rows.map((row) => [row.id, row.razon_social]));
}

/**
 * Vista del panel /admin/ops. Solo el admin de plataforma, y solo con el flag maestro.
 * No exige los flags hijos: muestra lo ya guardado. El motor de asignación sigue apagado
 * si OPS_ALLOCATION_ENABLED no es true.
 */
export function loadOpsPanel(user: PublicUser): OpsPanelData {
  if (user.role !== "admin") throw new AppError("No encontrado.", 404);
  assertEnabled("OPS_FEATURE_ENABLED");
  const orgs = listOrganizations(user).filter((org) => can(user, org.id, "tarifas.ver"));
  const contracts = orgs.flatMap((org) => listContracts(user, org.id));
  const rateCards = orgs.flatMap((org) => listRateCards(user, org.id));
  const scores = listScores();
  const runs = readAllocationRuns(user);
  const shipments = listShipments(user);
  const names = namesFor([
    ...scores.map((score) => score.carrierUserId),
    ...runs.flatMap((run) => run.candidates.map((candidate) => candidate.carrierUserId)),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    orgs,
    contracts,
    rateCards,
    scores,
    runs,
    shipments,
    names,
  };
}
