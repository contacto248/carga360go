/** Requisitos de calidad, seguridad y medio ambiente que un administrador revisa por cuenta (sin dependencias de servidor). */
export const REQUIREMENTS = [
  { key: "calidad", column: "req_calidad", label: "Requisitos de calidad" },
  { key: "seguridad", column: "req_seguridad", label: "Requisitos de seguridad" },
  { key: "medioambiente", column: "req_medioambiente", label: "Requisitos de medio ambiente" },
] as const;
export type RequirementKey = (typeof REQUIREMENTS)[number]["key"];
export const REQUIREMENT_STATUSES = ["pendiente", "cumple", "no_aplica", "no_cumple"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];
export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  pendiente: "Pendiente de revisión",
  cumple: "Cumple",
  no_aplica: "No aplica",
  no_cumple: "No cumple",
};
