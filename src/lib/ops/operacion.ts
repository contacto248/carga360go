import { createHash } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { assertEnabled } from "./flags";

const MAX_PESO_KG = 80_000;
const MAX_CORRELATIVO = 9999;

const createSchema = z
  .object({
    cliente: z.string().trim().min(2).max(160),
    origen: z.string().trim().min(2).max(120),
    destino: z.string().trim().min(2).max(120),
    tipoCarga: z.string().trim().min(2).max(80),
    pesoKg: z.number().finite().positive().max(MAX_PESO_KG),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  })
  .strict()
  .refine((value) => value.origen.localeCompare(value.destino, "es-CL", { sensitivity: "base" }) !== 0, {
    message: "origen",
  });

export type OperacionInput = z.infer<typeof createSchema>;

export type Operacion = {
  id: string;
  cliente: string;
  origen: string;
  destino: string;
  tipoCarga: string;
  pesoKg: number;
  estado: "planificada";
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type OperacionRow = {
  id: string;
  cliente: string;
  origen: string;
  destino: string;
  tipo_carga: string;
  peso_kg: number;
  estado: string;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_OPERACION = `SELECT id, cliente, origen, destino, tipo_carga, peso_kg, estado, version, created_by, created_at, updated_at
  FROM ops_operations`;

/** YYMM en UTC. El cliente no elige el periodo. */
export function periodoOperacion(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new AppError("Fecha de operación no válida.");
  const year = String(date.getUTCFullYear()).slice(-2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

/** Identificador público 360-YYMM-NNNN. NNNN es el correlativo del mes, de 0001 a 9999. */
export function codigoOperacion(periodo: string, correlativo: number): string {
  if (!/^\d{4}$/.test(periodo)) throw new AppError("Periodo de operación no válido.");
  if (!Number.isInteger(correlativo) || correlativo < 1 || correlativo > MAX_CORRELATIVO) {
    throw new AppError("No hay correlativo disponible para este mes.", 409);
  }
  return `360-${periodo}-${String(correlativo).padStart(4, "0")}`;
}

function parseBody(body: unknown): OperacionInput {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  return parsed.data;
}

function requestHash(input: Pick<OperacionInput, "cliente" | "origen" | "destino" | "tipoCarga" | "pesoKg">): string {
  const material = JSON.stringify({
    cliente: input.cliente,
    destino: input.destino,
    origen: input.origen,
    pesoKg: input.pesoKg,
    tipoCarga: input.tipoCarga,
  });
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function mapOperacion(row: OperacionRow): Operacion {
  if (row.estado !== "planificada") throw new AppError("La operación no es válida.", 500);
  return {
    id: row.id,
    cliente: row.cliente,
    origen: row.origen,
    destino: row.destino,
    tipoCarga: row.tipo_carga,
    pesoKg: row.peso_kg,
    estado: "planificada",
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadOperacion(id: string): Operacion {
  const row = getDb().prepare(`${SELECT_OPERACION} WHERE id = ?`).get(id) as OperacionRow | undefined;
  if (!row) throw new AppError("No se pudo crear la operación.", 500);
  return mapOperacion(row);
}

function requireAdmin(user: PublicUser) {
  if (user.role !== "admin") throw new AppError("No tienes permiso para esta acción.", 403);
}

/**
 * Valida de nuevo el cuerpo. Ignora cualquier identificador, estado o versión que mande el cliente:
 * el esquema es estricto y esos campos no existen en la entrada.
 */
export function createOperacion(
  user: PublicUser,
  body: unknown,
  ip: string | null,
  now = new Date(),
): { operacion: Operacion; replayed: boolean } {
  assertEnabled("OPS_OPERACION_ENABLED");
  requireAdmin(user);
  const input = parseBody(body);
  const hash = requestHash(input);
  const periodo = periodoOperacion(now);
  const stamp = now.toISOString();
  const db = getDb();

  const save = db.transaction((): { id: string; replayed: boolean } => {
    const existing = db
      .prepare(`SELECT operation_id, request_hash FROM ops_operation_keys WHERE idempotency_key = ?`)
      .get(input.idempotencyKey) as { operation_id: string; request_hash: string } | undefined;
    if (existing) {
      if (existing.request_hash !== hash) throw new AppError("La clave de idempotencia ya se usó con otros datos.", 409);
      return { id: existing.operation_id, replayed: true };
    }

    const counter = db
      .prepare(
        `INSERT INTO ops_operation_counters (periodo, ultimo) VALUES (?, 1)
         ON CONFLICT(periodo) DO UPDATE SET ultimo = ultimo + 1
         RETURNING ultimo`,
      )
      .get(periodo) as { ultimo: number };
    const id = codigoOperacion(periodo, counter.ultimo);
    db.prepare(
      `INSERT INTO ops_operations (
        id, cliente, origen, destino, tipo_carga, peso_kg, estado, version, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'planificada', 1, ?, ?, ?)`,
    ).run(id, input.cliente, input.origen, input.destino, input.tipoCarga, input.pesoKg, user.id, stamp, stamp);
    db.prepare(
      `INSERT INTO ops_operation_keys (idempotency_key, operation_id, request_hash, created_at) VALUES (?, ?, ?, ?)`,
    ).run(input.idempotencyKey, id, hash, stamp);
    auditStrict(
      user,
      "ops.operacion_creada",
      { type: "operacion", id },
      {
        cliente: input.cliente,
        origen: input.origen,
        destino: input.destino,
        tipoCarga: input.tipoCarga,
        pesoKg: input.pesoKg,
        idempotencyKey: input.idempotencyKey,
      },
      ip,
    );
    return { id, replayed: false };
  });

  const saved = save();
  return { operacion: loadOperacion(saved.id), replayed: saved.replayed };
}

/** Listado para la pantalla de alta. No es el panel /admin/ops. */
export function listOperaciones(user: PublicUser): Operacion[] {
  assertEnabled("OPS_OPERACION_ENABLED");
  requireAdmin(user);
  const rows = getDb().prepare(`${SELECT_OPERACION} ORDER BY created_at, id`).all() as OperacionRow[];
  return rows.map(mapOperacion);
}
