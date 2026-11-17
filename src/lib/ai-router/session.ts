const TENANT = /^[A-Za-z0-9_-]{1,80}$/;

export type SessionActor = { userId: string; tenantId: string | null };

/** Tenant y usuario salen de la sesión. Si no hay tenant, queda vacío. */
export function sessionActor(user: { id: string; tenantId?: string | null }): SessionActor {
  const raw = user.tenantId;
  const tenantId = typeof raw === "string" && TENANT.test(raw) ? raw : null;
  return { userId: user.id, tenantId };
}
