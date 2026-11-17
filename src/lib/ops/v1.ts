import { z } from "zod";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { listOrganizations } from "./organizations";
import { can } from "./permissions";
import { listContracts, listRateCards } from "./procurement";

const orgIdSchema = z.string().uuid();

/** orgId opcional de la query. Vacío se ignora. Un valor que no es UUID es 400. */
export function optionalOrgId(request: Request): string | null {
  const raw = new URL(request.url).searchParams.get("orgId")?.trim() ?? "";
  if (!raw) return null;
  const parsed = orgIdSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  return parsed.data;
}

function visibleOrgs(user: PublicUser, orgId: string | null) {
  if (orgId) return [orgId];
  return listOrganizations(user)
    .filter((org) => can(user, org.id, "tarifas.ver"))
    .map((org) => org.id);
}

/** Contratos que la sesión puede ver (tarifas.ver). Un orgId ajeno responde 403. */
export function listContractsV1(user: PublicUser, orgId: string | null) {
  return visibleOrgs(user, orgId).flatMap((id) => listContracts(user, id));
}

/** Tarifarios que la sesión puede ver (tarifas.ver). Un orgId ajeno responde 403. */
export function listRateCardsV1(user: PublicUser, orgId: string | null) {
  return visibleOrgs(user, orgId).flatMap((id) => listRateCards(user, id));
}
