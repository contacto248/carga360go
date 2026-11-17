import { getDb } from "../db";
import type { PublicUser } from "../types";

/**
 * Permisos del módulo operativo. No reemplazan users.role (transportista | mandante | admin).
 * Una cuenta sin fila en ops_org_members no gana permisos nuevos: can() responde false,
 * salvo el admin de plataforma, que puede todo.
 */
export const OPS_ROLES = ["org_admin", "procurement", "trafico", "finanzas", "auditor", "lectura"] as const;
export type OpsRole = (typeof OPS_ROLES)[number];

export const OPS_PERMISSIONS = [
  "tarifas.ver",
  "tarifas.editar",
  "asignacion.ver",
  "asignacion.ejecutar",
  "reglas.editar",
  "desempeno.ver",
  "miembros.editar",
] as const;
export type OpsPermission = (typeof OPS_PERMISSIONS)[number];

export const PERMISSIONS: Record<OpsRole, readonly OpsPermission[]> = {
  org_admin: OPS_PERMISSIONS,
  procurement: ["tarifas.ver", "tarifas.editar", "asignacion.ver"],
  trafico: ["asignacion.ver", "asignacion.ejecutar", "desempeno.ver"],
  finanzas: ["tarifas.ver"],
  auditor: ["tarifas.ver", "asignacion.ver", "desempeno.ver"],
  lectura: ["tarifas.ver", "asignacion.ver"],
};

export function isOpsRole(value: string): value is OpsRole {
  return (OPS_ROLES as readonly string[]).includes(value);
}

/** Admin de plataforma puede todo. El resto solo si tiene membresía activa y el rol incluye el permiso. */
export function can(user: Pick<PublicUser, "id" | "role">, orgId: string, permiso: OpsPermission): boolean {
  if (user.role === "admin") return true;
  const row = getDb()
    .prepare(`SELECT ops_role, status FROM ops_org_members WHERE org_id = ? AND user_id = ?`)
    .get(orgId, user.id) as { ops_role: string; status: string } | undefined;
  if (!row || row.status !== "activo" || !isOpsRole(row.ops_role)) return false;
  return PERMISSIONS[row.ops_role].includes(permiso);
}

export function isActiveMember(userId: string, orgId: string): boolean {
  return Boolean(
    getDb()
      .prepare(`SELECT 1 AS ok FROM ops_org_members WHERE org_id = ? AND user_id = ? AND status = 'activo'`)
      .get(orgId, userId),
  );
}
