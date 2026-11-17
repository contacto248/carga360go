import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { GET as getMembers, PATCH as patchMember, POST as postMember } from "../src/app/api/ops/organizaciones/[id]/miembros/route";
import { GET as getOrgs, POST as postOrg } from "../src/app/api/ops/organizaciones/route";
import { COOKIE_NAME, createSession, registerUser, upsertAdmin } from "../src/lib/auth";
import { MIGRATION_22_SQL, getDb } from "../src/lib/db";
import { rutDv } from "../src/lib/format";
import { OPS_FLAGS } from "../src/lib/ops/flags";
import { OPS_PERMISSIONS, OPS_ROLES, PERMISSIONS, can, type OpsPermission, type OpsRole } from "../src/lib/ops/permissions";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

const ctx = { params: Promise.resolve({ id: "" }) };

let seq = 81_000_000;

function rut() {
  seq += 1;
  const body = String(seq);
  return `${body}-${rutDv(body)}`;
}

function withOps(on: boolean) {
  for (const flag of OPS_FLAGS) delete process.env[flag];
  if (on) process.env.OPS_FEATURE_ENABLED = "true";
}

function person(role: "mandante" | "transportista", tag: string) {
  return registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: tag,
    email: `${tag}-${seq}@ops.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 6111 2345",
    city: "Santiago",
  }).user;
}

function admin(tag: string) {
  return upsertAdmin({
    email: `${tag}-${seq}@ops.test`,
    password: "Camino-Largo-2026",
    razonSocial: `Admin ${tag}`,
    rut: rut(),
    contactName: tag,
    whatsapp: "+56 9 4444 5555",
    city: "Santiago",
  });
}

function call(method: string, url: string, token: string | undefined, body?: unknown, sameOrigin = true) {
  const headers = new Headers({ host: "127.0.0.1:4317" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token && method !== "GET" && sameOrigin) headers.set("sec-fetch-site", "same-origin");
  if (token) headers.set("cookie", `${COOKIE_NAME}=${token}`);
  return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function membersCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

test("migración 022 coincide con el SQL, no toca users y la reversa está aparte", () => {
  const file = fs.readFileSync(path.join(process.cwd(), "docs/migrations/022-ops-organizaciones.sql"), "utf8");
  const body = file.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
  assert.equal(body, MIGRATION_22_SQL.replace(/\s+/g, " ").trim());
  assert.doesNotMatch(MIGRATION_22_SQL, /\b(ALTER\s+TABLE|DROP\s+TABLE|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/i);
  const rollback = fs.readFileSync(path.join(process.cwd(), "docs/migrations/022-ops-organizaciones-rollback.sql"), "utf8");
  assert.match(rollback, /DROP TABLE IF EXISTS ops_org_members/);
  assert.match(rollback, /DROP TABLE IF EXISTS ops_organizations/);
  assert.match(rollback, /DELETE FROM schema_migrations WHERE version = 22/);
  const usersSql = (getDb().prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get() as { sql: string }).sql;
  assert.match(usersSql, /CHECK \(role IN \('transportista', 'mandante', 'admin'\)\)/);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_organizations`).get() as { n: number }).n >= 0, true);
});

test("con el flag apagado las rutas OPS responden 404 y no escriben", async () => {
  withOps(false);
  const root = admin("off");
  const token = createSession(root.id, { mfa: true });
  const before = (getDb().prepare(`SELECT COUNT(*) AS n FROM ops_organizations`).get() as { n: number }).n;
  const audits = (getDb().prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'ops.%'`).get() as { n: number }).n;
  const listed = await getOrgs(call("GET", "http://127.0.0.1:4317/api/ops/organizaciones", token), ctx);
  const created = await postOrg(
    call("POST", "http://127.0.0.1:4317/api/ops/organizaciones", token, { kind: "mandante", razonSocial: "No debe", rut: rut() }, false),
    ctx,
  );
  const members = await getMembers(call("GET", "http://127.0.0.1:4317/api/ops/organizaciones/x/miembros", token), membersCtx("x"));
  assert.equal(listed.status, 404);
  assert.equal(created.status, 404);
  assert.equal(members.status, 404);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM ops_organizations`).get() as { n: number }).n, before);
  assert.equal((getDb().prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'ops.%'`).get() as { n: number }).n, audits);
});

test("solo el admin crea organizaciones y el creador queda org_admin", async () => {
  withOps(true);
  const root = admin("crea");
  const shipper = person("mandante", "manda");
  const token = createSession(root.id, { mfa: true });
  const denied = await postOrg(
    call("POST", "http://127.0.0.1:4317/api/ops/organizaciones", createSession(shipper.id), {
      kind: "mandante",
      razonSocial: "No admin",
      rut: rut(),
    }),
    ctx,
  );
  assert.equal(denied.status, 403);

  const companyRut = rut();
  const created = await postOrg(
    call("POST", "http://127.0.0.1:4317/api/ops/organizaciones", token, {
      kind: "mandante",
      razonSocial: "Minera Norte",
      rut: companyRut,
    }),
    ctx,
  );
  assert.equal(created.status, 201);
  const body = (await created.json()) as { organization: { id: string; kind: string; rutNorm: string } };
  assert.equal(body.organization.kind, "mandante");
  const members = await getMembers(call("GET", `http://127.0.0.1:4317/api/ops/organizaciones/${body.organization.id}/miembros`, token), membersCtx(body.organization.id));
  assert.equal(members.status, 200);
  const listed = (await members.json()) as { members: { userId: string; opsRole: string; status: string }[] };
  assert.deepEqual(listed.members.map((item) => ({ userId: item.userId, opsRole: item.opsRole, status: item.status })), [
    { userId: root.id, opsRole: "org_admin", status: "activo" },
  ]);
  const audit = getDb()
    .prepare(`SELECT actor_id, detail FROM audit_log WHERE action = 'ops.organizacion_creada' AND target_id = ?`)
    .get(body.organization.id) as { actor_id: string; detail: string };
  assert.equal(audit.actor_id, root.id);
  assert.equal(JSON.parse(audit.detail).kind, "mandante");
  assert.equal(audit.detail.includes(companyRut), false);

  const anon = await getOrgs(call("GET", "http://127.0.0.1:4317/api/ops/organizaciones", undefined), ctx);
  assert.equal(anon.status, 401);
  const own = await getOrgs(call("GET", "http://127.0.0.1:4317/api/ops/organizaciones", createSession(shipper.id)), ctx);
  assert.equal(own.status, 200);
  assert.deepEqual(await own.json(), { organizations: [] });
});

test("un usuario de otra organización recibe 403 y la matriz de permisos cubre cada rol", async () => {
  withOps(true);
  const root = admin("matriz");
  const token = createSession(root.id, { mfa: true });
  async function org(name: string) {
    const response = await postOrg(
      call("POST", "http://127.0.0.1:4317/api/ops/organizaciones", token, { kind: "mandante", razonSocial: name, rut: rut() }),
      ctx,
    );
    assert.equal(response.status, 201);
    return ((await response.json()) as { organization: { id: string } }).organization.id;
  }
  const orgA = await org("Org A");
  const orgB = await org("Org B");
  const outsider = person("mandante", "ajena");
  const added = await postMember(
    call("POST", `http://127.0.0.1:4317/api/ops/organizaciones/${orgA}/miembros`, token, { userId: outsider.id, opsRole: "org_admin", area: "Gerencia" }),
    membersCtx(orgA),
  );
  assert.equal(added.status, 201);

  const cross = await postMember(
    call("POST", `http://127.0.0.1:4317/api/ops/organizaciones/${orgB}/miembros`, createSession(outsider.id), {
      userId: person("transportista", "intruso").id,
      opsRole: "lectura",
    }),
    membersCtx(orgB),
  );
  assert.equal(cross.status, 403);
  const peek = await getMembers(call("GET", `http://127.0.0.1:4317/api/ops/organizaciones/${orgB}/miembros`, createSession(outsider.id)), membersCtx(orgB));
  assert.equal(peek.status, 403);

  const reader = person("transportista", "lee");
  assert.equal(
    (await postMember(call("POST", `http://127.0.0.1:4317/api/ops/organizaciones/${orgA}/miembros`, token, { userId: reader.id, opsRole: "lectura" }), membersCtx(orgA))).status,
    201,
  );
  const forbidden = await patchMember(
    call("PATCH", `http://127.0.0.1:4317/api/ops/organizaciones/${orgA}/miembros`, createSession(reader.id), { userId: reader.id, opsRole: "org_admin" }),
    membersCtx(orgA),
  );
  assert.equal(forbidden.status, 403);

  const suspended = await patchMember(
    call("PATCH", `http://127.0.0.1:4317/api/ops/organizaciones/${orgA}/miembros`, token, { userId: outsider.id, status: "suspendido" }),
    membersCtx(orgA),
  );
  assert.equal(suspended.status, 200);
  assert.equal(can(outsider, orgA, "miembros.editar"), false);

  for (const role of OPS_ROLES) {
    getDb().prepare(`UPDATE ops_org_members SET ops_role = ?, status = 'activo' WHERE org_id = ? AND user_id = ?`).run(role, orgA, reader.id);
    for (const permiso of OPS_PERMISSIONS) {
      const expected = PERMISSIONS[role].includes(permiso as OpsPermission);
      assert.equal(can(reader, orgA, permiso), expected, `${role} ${permiso}`);
      assert.equal(can(root, orgA, permiso), true, `admin ${permiso}`);
      assert.equal(can(outsider, orgB, permiso), false, `ajeno ${permiso}`);
    }
  }
  const restored = reader.role;
  assert.equal(restored, "transportista");
  assert.equal((OPS_ROLES as readonly OpsRole[]).includes("org_admin"), true);
});
