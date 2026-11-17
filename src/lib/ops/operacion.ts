import { createHash } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { assertEnabled } from "./flags";

const MAX_PESO_KG = 80_000;
/** Tope mensual del formato 360-YYMM-NNNN. No pasa a 5 dígitos. */
export const MAX_CORRELATIVO = 9999;
const ZONA_OPERACION = "America/Santiago";
const MENSAJE_TOPE =
  "No hay correlativo disponible para este mes. El tope es 9999 operaciones (360-YYMM-NNNN).";

/** Estados v1.1 de la operación. `bloqueada` es de la solicitud, no de esta tabla. */
export const ESTADOS_OPERACION = [
  "abierta",
  "documentacion_pendiente",
  "en_asignacion",
  "asignada",
  "en_curso",
  "entregada",
  "cerrada",
  "cancelada",
] as const;
export type EstadoOperacion = (typeof ESTADOS_OPERACION)[number];

/** PLAYBOOK §6. Cancelar desde documentacion_pendiente lo permite D-13, no esta tabla. */
export const TRANSICIONES_OPERACION: Readonly<Record<EstadoOperacion, readonly EstadoOperacion[]>> = {
  abierta: ["documentacion_pendiente", "en_asignacion", "cancelada"],
  documentacion_pendiente: ["abierta"],
  en_asignacion: ["asignada", "abierta", "cancelada"],
  asignada: ["en_curso", "cancelada"],
  en_curso: ["entregada", "cancelada"],
  entregada: ["cerrada"],
  cerrada: [],
  cancelada: [],
};

/** D-13: ningún agente puede cancelar. Lo ejecuta una persona. */
export const SHIPMENT_CANCEL_PARA_AGENTES = false;

const CANCELABLES_NIVEL_2 = ["abierta", "documentacion_pendiente", "en_asignacion"] as const;
const CANCELABLES_NIVEL_2B = ["asignada", "en_curso"] as const;

/** YY y MM en America/Santiago (UTC-3). */
const relojOperacion = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_OPERACION,
  year: "2-digit",
  month: "2-digit",
});

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
    estado: z.enum(ESTADOS_OPERACION).optional(),
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
  estado: EstadoOperacion;
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

/** YYMM en America/Santiago. El cliente no elige el periodo. */
export function periodoOperacion(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new AppError("Fecha de operación no válida.");
  const parts = relojOperacion.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  if (!/^\d{2}$/.test(year) || !/^\d{2}$/.test(month)) throw new AppError("Fecha de operación no válida.");
  return `${year}${month}`;
}

/** Identificador público 360-YYMM-NNNN. NNNN es el correlativo del mes, de 0001 a 9999. */
export function codigoOperacion(periodo: string, correlativo: number): string {
  if (!/^\d{4}$/.test(periodo)) throw new AppError("Periodo de operación no válido.");
  const serial = String(correlativo).padStart(4, "0");
  if (!Number.isInteger(correlativo) || correlativo < 1 || correlativo > MAX_CORRELATIVO || !/^\d{4}$/.test(serial)) {
    throw new AppError(MENSAJE_TOPE, 409, "CORRELATIVO_AGOTADO");
  }
  return `360-${periodo}-${serial}`;
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

export function esEstadoOperacion(estado: string): estado is EstadoOperacion {
  return (ESTADOS_OPERACION as readonly string[]).includes(estado);
}

export function transicionOperacionPermitida(desde: string, hacia: string): boolean {
  if (!esEstadoOperacion(desde) || !esEstadoOperacion(hacia)) return false;
  return TRANSICIONES_OPERACION[desde].includes(hacia);
}

/**
 * D-13. Nivel 2 en abierta, documentacion_pendiente y en_asignacion.
 * Nivel 2b en asignada y en_curso. Con cobros, Nivel 3.
 * entregada, cerrada y cancelada no se cancelan.
 */
export function decidirCancelacion(
  desde: string,
  hayCobros: boolean,
): { ok: true; nivel: "2" | "2b" | "3" } | { ok: false; regla: "transicion_no_permitida" } {
  const nivel2 = (CANCELABLES_NIVEL_2 as readonly string[]).includes(desde);
  const nivel2b = (CANCELABLES_NIVEL_2B as readonly string[]).includes(desde);
  if (!nivel2 && !nivel2b) return { ok: false, regla: "transicion_no_permitida" };
  if (hayCobros) return { ok: true, nivel: "3" };
  if (nivel2b) return { ok: true, nivel: "2b" };
  return { ok: true, nivel: "2" };
}

function mapOperacion(row: OperacionRow): Operacion {
  if (!esEstadoOperacion(row.estado)) throw new AppError("La operación no es válida.", 500);
  return {
    id: row.id,
    cliente: row.cliente,
    origen: row.origen,
    destino: row.destino,
    tipoCarga: row.tipo_carga,
    pesoKg: row.peso_kg,
    estado: row.estado,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rechazarEstado(
  user: PublicUser,
  targetId: string,
  detail: Record<string, unknown>,
  message: string,
  regla: string,
  ip: string | null,
  code = "POLICY_RECHAZA",
  status = 403,
): never {
  auditStrict(user, "ops.operacion_estado_rechazado", { type: "operacion", id: targetId }, { ...detail, regla_policy: regla }, ip);
  throw new AppError(message, status, code, regla);
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
 * Valida de nuevo el cuerpo. El cliente no elige el identificador ni la versión.
 * Si manda estado, solo se acepta abierta: el alta no salta transiciones.
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
  if (input.estado && input.estado !== "abierta") {
    rechazarEstado(
      user,
      input.idempotencyKey,
      { desde: null, hacia: input.estado },
      "Al crear, la operación nace en abierta. Ese estado no es una transición válida desde el alta.",
      "transicion_no_permitida",
      ip,
    );
  }
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
         WHERE ultimo < ?
         RETURNING ultimo`,
      )
      .get(periodo, MAX_CORRELATIVO) as { ultimo: number } | undefined;
    if (!counter) throw new AppError(MENSAJE_TOPE, 409, "CORRELATIVO_AGOTADO");
    const id = codigoOperacion(periodo, counter.ultimo);
    db.prepare(
      `INSERT INTO ops_operations (
        id, cliente, origen, destino, tipo_carga, peso_kg, estado, version, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'abierta', 1, ?, ?, ?)`,
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

  let saved: { id: string; replayed: boolean };
  try {
    saved = save();
  } catch (error) {
    if (error instanceof AppError && error.code === "CORRELATIVO_AGOTADO") {
      auditStrict(
        user,
        "ops.operacion_correlativo_agotado",
        { type: "operacion", id: periodo },
        { periodo, tope: MAX_CORRELATIVO, formato: "360-YYMM-NNNN", mensaje: error.message },
        ip,
      );
    }
    throw error;
  }
  return { operacion: loadOperacion(saved.id), replayed: saved.replayed };
}

export type ActualizarEstadoOpciones = {
  /** Confirmación previa de una persona. La exige el Nivel 2b (asignada o en_curso). */
  confirmacionPrevia?: boolean;
  /** Si hay cobros, cancelar es Nivel 3 y no se ejecuta en este paso. Core no consulta pagos. */
  hayCobros?: boolean;
};

/** Cambia el estado si la transición está permitida. Cancelar sigue D-13. */
export function actualizarEstadoOperacion(
  user: PublicUser,
  id: string,
  hacia: string,
  ip: string | null,
  opciones: ActualizarEstadoOpciones = {},
  now = new Date(),
): Operacion {
  assertEnabled("OPS_OPERACION_ENABLED");
  requireAdmin(user);
  const row = getDb().prepare(`${SELECT_OPERACION} WHERE id = ?`).get(id) as OperacionRow | undefined;
  if (!row) throw new AppError("No encontramos esa operación.", 404);
  if (!esEstadoOperacion(row.estado)) throw new AppError("La operación no es válida.", 500);
  const desde = row.estado;
  const hayCobros = opciones.hayCobros === true;
  let nivel: "2" | "2b" | "3" | null = null;

  if (hacia === "cancelada") {
    const decision = decidirCancelacion(desde, hayCobros);
    if (!decision.ok) {
      rechazarEstado(
        user,
        id,
        { desde, hacia, hayCobros },
        "Esa transición de estado no está permitida.",
        decision.regla,
        ip,
      );
    }
    nivel = decision.nivel;
    if (decision.nivel === "3") {
      rechazarEstado(
        user,
        id,
        { desde, hacia, hayCobros, nivel: "3" },
        "Cancelar con cobros es Nivel 3 y exige aprobación. La operación no cambió.",
        "requiere_aprobacion",
        ip,
        "REQUIERE_APROBACION",
      );
    }
    if (decision.nivel === "2b" && opciones.confirmacionPrevia !== true) {
      rechazarEstado(
        user,
        id,
        { desde, hacia, hayCobros, nivel: "2b" },
        "Cancelar una operación asignada o en curso exige la confirmación previa de una persona. La operación no cambió.",
        "confirmacion_previa",
        ip,
      );
    }
  } else if (!transicionOperacionPermitida(desde, hacia)) {
    rechazarEstado(
      user,
      id,
      { desde, hacia },
      "Esa transición de estado no está permitida.",
      "transicion_no_permitida",
      ip,
    );
  }

  const destino = hacia as EstadoOperacion;
  const stamp = now.toISOString();
  const db = getDb();
  const apply = db.transaction(() => {
    const changed = db
      .prepare(`UPDATE ops_operations SET estado = ?, version = version + 1, updated_at = ? WHERE id = ? AND estado = ?`)
      .run(destino, stamp, id, desde);
    if (changed.changes !== 1) throw new AppError("La operación cambió. Vuelve a intentar.", 409);
    auditStrict(
      user,
      "ops.operacion_estado",
      { type: "operacion", id },
      { desde, hacia: destino, nivel, hayCobros, confirmacionPrevia: opciones.confirmacionPrevia === true },
      ip,
    );
  });
  apply();
  return loadOperacion(id);
}

/** Listado para la pantalla de alta. No es el panel /admin/ops. */
export function listOperaciones(user: PublicUser): Operacion[] {
  assertEnabled("OPS_OPERACION_ENABLED");
  requireAdmin(user);
  const rows = getDb().prepare(`${SELECT_OPERACION} ORDER BY created_at, id`).all() as OperacionRow[];
  return rows.map(mapOperacion);
}
