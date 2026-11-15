export const COMPANIES = ["carga360go", "bassam"] as const;
export type Company = typeof COMPANIES[number];
export const COMPANY_NAMES: Record<Company, string> = { carga360go: "CARGA360GO", bassam: "BASSAM SPA" };
export const TASK_STATES = ["pendiente", "en_curso", "bloqueada", "terminada", "archivada"] as const;
export const SERVICE_STATES = ["nuevo", "cotizado", "confirmado", "en_curso", "finalizado", "cancelado"] as const;
export const LABELS: Record<string, string> = { pendiente: "Pendiente", en_curso: "En curso", bloqueada: "Bloqueada", terminada: "Terminada", archivada: "Archivada", nuevo: "Nuevo", cotizado: "Cotizado", confirmado: "Confirmado", finalizado: "Finalizado", cancelado: "Cancelado" };
export type Task = { id: string; company: Company; title: string; owner: string; due: string; status: typeof TASK_STATES[number]; priority: "alta" | "media" | "baja"; evidence: string; revision: number; updatedAt: string };
export type Service = { id: string; company: Company; title: string; customer: string; equipment: string; origin: string; destination: string; due: string; owner: string; status: typeof SERVICE_STATES[number]; notes: string; revision: number; updatedAt: string };
export type Integration = { name: string; state: string; detail: string; href?: string };
export type Snapshot = {
  company: Company; generatedAt: string; tasks: Task[]; services: Service[];
  metrics: { label: string; value: number; detail: string }[];
  corridors: { name: string; loads: number; trucks: number }[];
  integrations: Integration[];
  activity: { action: string; actor: string; at: string }[];
};
