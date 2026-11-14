/**
 * Máquina de estados del pago de un flete (spec §8). Funciones puras, sin base de datos.
 * Las transiciones solo se disparan desde: webhook verificado + GET del pago, jobs internos
 * o acciones autenticadas con rol y auditoría. Nunca desde un parámetro del navegador.
 */

export const FREIGHT_STATUSES = [
  "adjudicada",
  "anticipo_pagado",
  "en_transito",
  "entregada_POD",
  "en_disputa",
  "saldo_liberado",
  "cancelada",
  "reembolsada",
  "reembolso_parcial",
  "reembolso_fallido",
] as const;
export type FreightStatus = (typeof FREIGHT_STATUSES)[number];

export const INSTALLMENT_STATUSES = ["pendiente", "preferencia_creada", "pendiente_mp", "approved", "rejected", "refunded", "charged_back"] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];
export type InstallmentKind = "anticipo" | "saldo";

/** Quién puede provocar cada transición. */
export type Actor = "webhook" | "job" | "transportista" | "mandante" | "admin";

type Edge = { to: FreightStatus; by: Actor[] };

const EDGES: Record<FreightStatus, Edge[]> = {
  adjudicada: [
    { to: "anticipo_pagado", by: ["webhook"] },
    { to: "cancelada", by: ["admin", "mandante", "job"] },
  ],
  anticipo_pagado: [
    { to: "en_transito", by: ["transportista"] },
    { to: "entregada_POD", by: ["transportista"] },
    { to: "cancelada", by: ["admin"] },
    { to: "en_disputa", by: ["webhook", "admin"] },
  ],
  en_transito: [
    { to: "entregada_POD", by: ["transportista"] },
    { to: "en_disputa", by: ["mandante", "transportista", "admin", "webhook"] },
    { to: "cancelada", by: ["admin"] },
  ],
  entregada_POD: [
    { to: "saldo_liberado", by: ["job", "admin"] },
    { to: "en_disputa", by: ["mandante", "transportista", "admin", "webhook"] },
  ],
  en_disputa: [
    { to: "saldo_liberado", by: ["admin"] },
    { to: "reembolsada", by: ["admin", "webhook"] },
    { to: "reembolso_parcial", by: ["admin", "webhook"] },
    { to: "reembolso_fallido", by: ["admin"] },
  ],
  // Reintento del administrador después de que el transportista repuso saldo.
  reembolso_fallido: [
    { to: "reembolsada", by: ["admin", "webhook"] },
    { to: "reembolso_parcial", by: ["admin", "webhook"] },
    { to: "saldo_liberado", by: ["admin"] },
  ],
  reembolso_parcial: [],
  saldo_liberado: [],
  cancelada: [],
  reembolsada: [],
};

export const TERMINAL: ReadonlySet<FreightStatus> = new Set(["saldo_liberado", "cancelada", "reembolsada", "reembolso_parcial"]);

export function isFreightStatus(value: unknown): value is FreightStatus {
  return typeof value === "string" && (FREIGHT_STATUSES as readonly string[]).includes(value);
}

export function nextStatuses(from: FreightStatus, actor?: Actor): FreightStatus[] {
  return EDGES[from].filter((edge) => !actor || edge.by.includes(actor)).map((edge) => edge.to);
}

export function canTransition(from: FreightStatus, to: FreightStatus, actor: Actor): boolean {
  return EDGES[from].some((edge) => edge.to === to && edge.by.includes(actor));
}

export class TransitionError extends Error {
  constructor(
    public from: FreightStatus,
    public to: FreightStatus,
    public actor: Actor,
  ) {
    super(`Transición no permitida: ${from} → ${to} (${actor}).`);
    this.name = "TransitionError";
  }
}

export function assertTransition(from: FreightStatus, to: FreightStatus, actor: Actor) {
  if (!canTransition(from, to, actor)) throw new TransitionError(from, to, actor);
}

/** Traducción del status crudo de Mercado Pago (GET /v1/payments/{id}) al estado de la cuota. */
export function installmentStatusFromMp(mpStatus: string): InstallmentStatus | null {
  switch (mpStatus) {
    case "approved":
      return "approved";
    case "pending":
    case "in_process":
    case "in_mediation":
    case "authorized":
      return "pendiente_mp";
    case "rejected":
    case "cancelled":
      return "rejected";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "charged_back";
    default:
      return null;
  }
}

/** Una cuota pagada no retrocede por un evento viejo que llega fuera de orden. */
const INSTALLMENT_RANK: Record<InstallmentStatus, number> = {
  pendiente: 0,
  preferencia_creada: 1,
  rejected: 2,
  pendiente_mp: 3,
  approved: 4,
  refunded: 5,
  charged_back: 6,
};

export function shouldApplyInstallment(current: InstallmentStatus, incoming: InstallmentStatus): boolean {
  if (current === incoming) return false;
  // Un reintento después de un rechazo puede volver a "pendiente_mp" o "approved".
  return INSTALLMENT_RANK[incoming] > INSTALLMENT_RANK[current];
}

/** ¿Se puede abrir el checkout de esta cuota en este estado del flete? (spec §7) */
export function checkoutAllowed(status: FreightStatus, kind: InstallmentKind, installment: InstallmentStatus): boolean {
  if (installment === "approved" || installment === "pendiente_mp" || installment === "refunded" || installment === "charged_back") return false;
  if (kind === "anticipo") return status === "adjudicada";
  return status === "entregada_POD";
}

export const FREIGHT_STATUS_LABEL: Record<FreightStatus, string> = {
  adjudicada: "Adjudicada (anticipo pendiente)",
  anticipo_pagado: "Anticipo pagado",
  en_transito: "En tránsito",
  entregada_POD: "Entregada (POD)",
  en_disputa: "En disputa",
  saldo_liberado: "Saldo liberado",
  cancelada: "Cancelada",
  reembolsada: "Reembolsada",
  reembolso_parcial: "Reembolso parcial",
  reembolso_fallido: "Reembolso fallido",
};

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  pendiente: "Pendiente",
  preferencia_creada: "Checkout creado",
  pendiente_mp: "Pendiente en Mercado Pago",
  approved: "Aprobado",
  rejected: "Rechazado",
  refunded: "Reembolsado",
  charged_back: "Contracargo",
};
