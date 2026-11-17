import { AppError } from "../errors";

/**
 * Flags del núcleo operativo. Apagados por defecto.
 * Solo el texto exacto "true" enciende un flag: "TRUE", "1", "yes", vacío o con espacios quedan apagados.
 * Un flag hijo solo vale si el maestro OPS_FEATURE_ENABLED también es "true".
 * No cambia cómo leen sus flags los módulos que ya existen (pagos, KYC, chat, WhatsApp).
 *
 * OPS_ALLOCATION_AUTO se lee igual que el resto, pero esta etapa no adjudica sola:
 * allocationMode() queda siempre en "propuesta".
 */
export const OPS_FLAGS = [
  "OPS_FEATURE_ENABLED",
  "OPS_PROCUREMENT_ENABLED",
  "OPS_ALLOCATION_ENABLED",
  "OPS_ALLOCATION_AUTO",
  "OPS_API_V1_ENABLED",
  "OPS_OPERACION_ENABLED",
] as const;

export type OpsFlag = (typeof OPS_FLAGS)[number];

export const OPS_MASTER_FLAG = "OPS_FEATURE_ENABLED" as const;

const OPS_CHILD_FLAGS = [
  "OPS_PROCUREMENT_ENABLED",
  "OPS_ALLOCATION_ENABLED",
  "OPS_ALLOCATION_AUTO",
  "OPS_API_V1_ENABLED",
  "OPS_OPERACION_ENABLED",
] as const satisfies readonly OpsFlag[];

export function opsChildFlags(): readonly OpsFlag[] {
  return OPS_CHILD_FLAGS;
}

function rawOn(name: string): boolean {
  return process.env[name] === "true";
}

/** true solo con el texto exacto "true". Un hijo exige además el maestro. */
export function isEnabled(flag: OpsFlag): boolean {
  if (!rawOn(flag)) return false;
  if (flag === OPS_MASTER_FLAG) return true;
  return rawOn(OPS_MASTER_FLAG);
}

/** 404: con el flag apagado la ruta no existe para quien llama. */
export function assertEnabled(flag: OpsFlag): void {
  if (!isEnabled(flag)) throw new AppError("No encontrado.", 404);
}

/** Esta etapa ignora OPS_ALLOCATION_AUTO. La asignación, cuando exista, queda en propuesta. */
export function allocationMode(): "propuesta" {
  return "propuesta";
}
