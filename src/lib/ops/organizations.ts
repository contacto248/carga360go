import { randomUUID } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import { isValidRut, rutBody } from "../format";
import type { PublicUser } from "../types";
import { can, isActiveMember, isOpsRole, OPS_ROLES, type OpsRole } from "./permissions";

const KINDS = ["mandante", "transportista", "plataforma"] as const;
export type OrgKind = (typeof KINDS)[number];

const createOrgSchema = z.object({
  kind: z.enum(KINDS),
  razonSocial: z.string().trim().min(2).max(160),
  rut: z.string().trim().min(3).max(20),
});

const memberFields = {
  userId: z.string().trim().min(8).max(80),
  opsRole: z.enum(OPS_ROLES).optional(),
  status: z.enum(["activo", "suspendido"]).optional(),
  area: z.string().trim().max(80).nullable().optional(),
};

const createMemberSchema = z.object({
  userId: memberFields.userId,
  opsRole: z.enum(OPS_ROLES),
  area: memberFields.area,
});

const patchMemberSchema = z
  .object(memberFields)
  .refine((value) => value.opsRole !== undefined || value.status !== undefined || value.area !== undefined, {
    message: "nada",
  });

export type OpsOrganization = {
  id: string;
  kind: OrgKind;
  razonSocial: string;
  rutNorm: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpsMember = {
  id: string;
  userId: string;
  area: string | null;
  opsRole: OpsRole;
  status: "activo" | "suspendido";
  createdAt: string;
};

type OrgRow = {
  id: string;
  kind: OrgKind;
  razon_social: string;
  rut_norm: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  id: string;
  user_id: string;
  area: string | null;
  ops_role: string;
  status: "activo" | "suspendido";
  created_at: string;
};

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  return parsed.data;
}

function toOrg(row: OrgRow): OpsOrganization {
  return {
    id: row.id,
    kind: row.kind,
    razonSocial: row.razon_social,
    rutNorm: row.rut_norm,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMember(row: MemberRow): OpsMember {
  if (!isOpsRole(row.ops_role)) throw new AppError("El rol operativo no es válido.");
  return {
    id: row.id,
    userId: row.user_id,
    area: row.area,
    opsRole: row.ops_role,
    status: row.status,
    createdAt: row.created_at,
  };
}

function requirePlatformAdmin(user: PublicUser) {
  if (user.role !== "admin") throw new AppError("No tienes permiso para esta acción.", 403);
}

function loadOrg(orgId: string): OrgRow | undefined {
  return getDb().prepare(`SELECT * FROM ops_organizations WHERE id = ?`).get(orgId) as OrgRow | undefined;
}

/** Quien no pertenece a la organización recibe 403, también si el id no existe (no se revela). El admin de plataforma recibe 404 si no existe. */
function assertCanRead(user: PublicUser, orgId: string): OrgRow {
  const org = loadOrg(orgId);
  if (user.role === "admin") {
    if (!org) throw new AppError("No encontrado.", 404);
    return org;
  }
  if (!org || !isActiveMember(user.id, orgId)) throw new AppError("No tienes permiso para esta acción.", 403);
  return org;
}

function assertCanEditMembers(user: PublicUser, orgId: string): OrgRow {
  const org = loadOrg(orgId);
  if (user.role === "admin") {
    if (!org) throw new AppError("No encontrado.", 404);
    return org;
  }
  if (!org || !can(user, orgId, "miembros.editar")) throw new AppError("No tienes permiso para esta acción.", 403);
  return org;
}

function requireUserRow(userId: string) {
  const row = getDb().prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
  if (!row) throw new AppError("Ese usuario no está registrado.", 404);
}

export function listOrganizations(user: PublicUser): OpsOrganization[] {
  const db = getDb();
  const rows =
    user.role === "admin"
      ? (db.prepare(`SELECT * FROM ops_organizations ORDER BY created_at, id`).all() as OrgRow[])
      : (db
          .prepare(
            `SELECT o.* FROM ops_organizations o
             JOIN ops_org_members m ON m.org_id = o.id
             WHERE m.user_id = ? AND m.status = 'activo'
             ORDER BY o.created_at, o.id`,
          )
          .all(user.id) as OrgRow[]);
  return rows.map(toOrg);
}

export function createOrganization(user: PublicUser, body: unknown, ip: string | null): OpsOrganization {
  requirePlatformAdmin(user);
  const input = parseBody(createOrgSchema, body);
  if (!isValidRut(input.rut)) throw new AppError("El RUT no es válido (revisa el dígito verificador).");
  const rutNorm = rutBody(input.rut);
  const db = getDb();
  if (db.prepare(`SELECT 1 FROM ops_organizations WHERE rut_norm = ?`).get(rutNorm)) {
    throw new AppError("Ya existe una organización con ese RUT.", 409);
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO ops_organizations (id, kind, razon_social, rut_norm, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.kind, input.razonSocial, rutNorm, user.id, now, now);
    db.prepare(
      `INSERT INTO ops_org_members (id, org_id, user_id, area, ops_role, status, created_at)
       VALUES (?, ?, ?, NULL, 'org_admin', 'activo', ?)`,
    ).run(randomUUID(), id, user.id, now);
    auditStrict(user, "ops.organizacion_creada", { type: "ops_organizacion", id }, { kind: input.kind }, ip);
  });
  save();
  const created = loadOrg(id);
  if (!created) throw new AppError("No se pudo crear la organización.", 500);
  return toOrg(created);
}

export function listMembers(user: PublicUser, orgId: string): OpsMember[] {
  assertCanRead(user, orgId);
  const rows = getDb()
    .prepare(
      `SELECT id, user_id, area, ops_role, status, created_at
       FROM ops_org_members WHERE org_id = ? ORDER BY created_at, id`,
    )
    .all(orgId) as MemberRow[];
  return rows.map(toMember);
}

export function addMember(user: PublicUser, orgId: string, body: unknown, ip: string | null): OpsMember {
  assertCanEditMembers(user, orgId);
  const input = parseBody(createMemberSchema, body);
  requireUserRow(input.userId);
  const db = getDb();
  if (db.prepare(`SELECT 1 FROM ops_org_members WHERE org_id = ? AND user_id = ?`).get(orgId, input.userId)) {
    throw new AppError("Esa persona ya pertenece a la organización.", 409);
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  const area = input.area ? input.area : null;
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO ops_org_members (id, org_id, user_id, area, ops_role, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'activo', ?)`,
    ).run(id, orgId, input.userId, area, input.opsRole, now);
    auditStrict(
      user,
      "ops.miembro_agregado",
      { type: "ops_organizacion", id: orgId },
      { opsRole: input.opsRole, memberId: id },
      ip,
    );
  });
  save();
  const row = db.prepare(`SELECT id, user_id, area, ops_role, status, created_at FROM ops_org_members WHERE id = ?`).get(id) as MemberRow;
  return toMember(row);
}

export function updateMember(user: PublicUser, orgId: string, body: unknown, ip: string | null): OpsMember {
  assertCanEditMembers(user, orgId);
  const input = parseBody(patchMemberSchema, body);
  const db = getDb();
  const current = db
    .prepare(`SELECT id, user_id, area, ops_role, status, created_at FROM ops_org_members WHERE org_id = ? AND user_id = ?`)
    .get(orgId, input.userId) as MemberRow | undefined;
  if (!current) throw new AppError("Esa persona no pertenece a la organización.", 404);
  const nextRole = input.opsRole ?? current.ops_role;
  const nextStatus = input.status ?? current.status;
  const nextArea = input.area !== undefined ? input.area || null : current.area;
  if (!isOpsRole(nextRole)) throw new AppError("El rol operativo no es válido.");
  const save = db.transaction(() => {
    db.prepare(`UPDATE ops_org_members SET area = ?, ops_role = ?, status = ? WHERE id = ?`).run(nextArea, nextRole, nextStatus, current.id);
    db.prepare(`UPDATE ops_organizations SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), orgId);
    auditStrict(
      user,
      "ops.miembro_actualizado",
      { type: "ops_organizacion", id: orgId },
      { opsRole: nextRole, status: nextStatus, memberId: current.id },
      ip,
    );
  });
  save();
  const row = db.prepare(`SELECT id, user_id, area, ops_role, status, created_at FROM ops_org_members WHERE id = ?`).get(current.id) as MemberRow;
  return toMember(row);
}
