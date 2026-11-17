import { AppError } from "../errors";

/** Permiso RBAC del catálogo IAM. La sesión sola no lo concede. */
export const AI_EXECUTE = "ai.execute";

/**
 * Roles internos de plataforma y los permisos que tienen.
 * Mandante y transportista no están: una sesión de esos roles no autoriza el orquestador.
 */
const INTERNAL_PERMISSIONS: Record<string, readonly string[]> = {
  admin: [AI_EXECUTE],
};

export function roleHasAiExecute(role: string): boolean {
  return INTERNAL_PERMISSIONS[role]?.includes(AI_EXECUTE) ?? false;
}

export function assertAiExecute(user: { role: string }): void {
  if (!roleHasAiExecute(user.role)) throw new AppError("No tienes permiso para esta acción.", 403);
}
