import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getDb } from "../db";
import { AppError } from "../errors";
import { daysBetween, formatDateCL } from "../format";
import type { PublicUser } from "../types";
import type { EventoTimeline, FilaAcreditacion, PanelAcreditacion, PendingDocument } from "./types";
import { prefijoRevision, tiposDe, type TipoCliente } from "./tipos-cliente";

export type { PendingDocument };

export const AGENT_TABLES = ["solicitudes_carga", "transportistas", "documentos_acreditacion"] as const;
export type AgentTable = (typeof AGENT_TABLES)[number];

export const HUMAN_ACTIONS = ["aprobar", "rechazar", "pedir_renovacion", "pedir_correccion"] as const;
export type HumanAction = (typeof HUMAN_ACTIONS)[number];

export const ALERT_DAYS = [30, 15, 7] as const;
export type AlertDay = (typeof ALERT_DAYS)[number];

const TABLE_SQL: Record<AgentTable, string> = {
  solicitudes_carga: "solicitudes_carga",
  transportistas: "transportistas",
  documentos_acreditacion: "documentos_acreditacion",
};

function assertAdmin(user: PublicUser | null | undefined): asserts user is PublicUser {
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  if (user.role !== "admin") throw new AppError("Acceso exclusivo de administración.", 403);
}

function parseTable(value: string): AgentTable {
  if ((AGENT_TABLES as readonly string[]).includes(value)) return value as AgentTable;
  throw new AppError("Tabla no válida.");
}

const RUT_RE = /\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/;
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const CL_RE = /\b(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\b/;

export type UploadInput = {
  transportistaId?: string | null;
  userId?: string | null;
  rutCuenta?: string;
  tipoCliente: TipoCliente;
  tipo: string;
  filename: string;
  bytes: Buffer;
  mime: string;
};

export type UploadDeps = {
  fetchImpl?: typeof fetch;
  today?: string;
};

function uploadRoot(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

function visionKey(): string | null {
  const key = process.env.GOOGLE_VISION_KEY?.trim();
  return key || null;
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return iso;
}

export function readRutAndDate(text: string): { rut: string | null; fecha: string | null } {
  const rut = text.match(RUT_RE)?.[1] ?? null;
  const iso = text.match(ISO_RE);
  if (iso) {
    const fecha = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (fecha) return { rut, fecha };
  }
  const cl = text.match(CL_RE);
  if (cl) return { rut, fecha: isoDate(Number(cl[3]), Number(cl[2]), Number(cl[1])) };
  return { rut, fecha: null };
}

function localText(bytes: Buffer, mime: string): string | null {
  if (mime !== "text/plain") return null;
  const text = bytes.toString("utf8").replace(/\u0000/g, "").trim();
  if (!text || text.length > 200_000) return null;
  return text;
}

async function visionText(bytes: Buffer, fetchImpl: typeof fetch): Promise<string | null> {
  const key = visionKey();
  if (!key) return null;
  let response: Response;
  try {
    response = await fetchImpl("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        requests: [{ image: { content: bytes.toString("base64") }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }],
      }),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const data = (await response.json()) as { responses?: { fullTextAnnotation?: { text?: string } }[] };
  const text = data.responses?.[0]?.fullTextAnnotation?.text?.trim();
  return text || null;
}

function rutKey(value: string): string {
  return value.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
}

export function reviewText(text: string, carrierRut: string, today: string, cliente: TipoCliente = "transportista"): { comentario: string; estadoIa: string; fecha: string | null; rut: string | null } {
  const found = readRutAndDate(text);
  const rutLine = !found.rut ? "RUT sin datos." : rutKey(found.rut) === rutKey(carrierRut) ? "RUT coincide." : "RUT no coincide.";
  let vigencia = "Vigencia sin datos.";
  let estadoIa = "sin_vigencia";
  if (found.fecha) {
    const days = daysBetween(today, found.fecha);
    if (days < 0) {
      vigencia = `Vencido (${found.fecha}).`;
      estadoIa = "vencido";
    } else if (days <= 30) {
      vigencia = `Por vencer (${found.fecha}).`;
      estadoIa = "por_vencer";
    } else {
      vigencia = `Vigente hasta ${found.fecha}.`;
      estadoIa = "vigente";
    }
  }
  if (found.rut && rutKey(found.rut) !== rutKey(carrierRut)) estadoIa = "rut_no_coincide";
  return { comentario: `${prefijoRevision(cliente)}: ${rutLine} ${vigencia}`, estadoIa, fecha: found.fecha, rut: found.rut };
}

/** Guarda el archivo fuera de la web. No aprueba. Sin clave de Vision marca ILEGIBLE y no llama a Google. */
export async function storeAccreditationUpload(input: UploadInput, deps: UploadDeps = {}) {
  const tipo = input.tipo.trim();
  const cliente = input.tipoCliente;
  if (cliente !== "transportista" && cliente !== "mandante") throw new AppError("Tipo de cliente no válido.");
  if (!tiposDe(cliente).includes(tipo)) throw new AppError("Ese documento no corresponde a este tipo de cuenta.");
  if (!input.bytes.length || input.bytes.length > 10 * 1024 * 1024) throw new AppError("El archivo no es válido o supera 10 MB.");
  const allowed = new Map([
    ["application/pdf", ".pdf"],
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["text/plain", ".txt"],
  ]);
  const ext = allowed.get(input.mime);
  if (!ext) throw new AppError("Solo se aceptan PDF, JPG, PNG o texto.");
  const db = getDb();
  let rutCuenta = "";
  if (cliente === "transportista") {
    const carrier = db.prepare(`SELECT id, rut FROM transportistas WHERE id = ?`).get(input.transportistaId) as { id: string; rut: string | null } | undefined;
    if (!carrier) throw new AppError("Transportista no encontrado.", 404);
    rutCuenta = carrier.rut ?? "";
  } else {
    rutCuenta = input.rutCuenta ?? "";
  }
  const id = randomUUID();
  const relative = path.join("acreditacion", `${id}${ext}`);
  const full = path.join(uploadRoot(), relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, input.bytes, { mode: 0o600 });
  const stamp = new Date().toISOString();
  let text = localText(input.bytes, input.mime);
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (!text && input.mime !== "text/plain") {
    if (!visionKey()) {
      text = null;
    } else {
      text = await visionText(input.bytes, fetchImpl);
    }
  }
  const today = deps.today ?? new Date().toISOString().slice(0, 10);
  const reading = text
    ? reviewText(text, rutCuenta, today, cliente)
    : { comentario: `${prefijoRevision(cliente)}: ILEGIBLE.`, estadoIa: "ILEGIBLE", fecha: null as string | null, rut: null as string | null };
  db.transaction(() => {
    db.prepare(
      `INSERT INTO documentos_acreditacion (
         id, tipo_cliente, transportista_id, user_id, tipo, archivo, vencimiento, rut_extraido, estado_admin, estado_ia, comentario_ia, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente_ok', ?, ?, ?, ?)`,
    ).run(id, cliente, cliente === "transportista" ? input.transportistaId : null, input.userId ?? null, tipo, relative, reading.fecha, reading.rut, reading.estadoIa, reading.comentario, stamp, stamp);
    db.prepare(
      `INSERT INTO admin_bassam_360 (id, created_at, origen, tabla, registro_id, comentario, accion, estado_ia, actor_id)
       VALUES (?, ?, 'agente', 'documentos_acreditacion', ?, ?, 'lectura', ?, NULL)`,
    ).run(randomUUID(), stamp, id, reading.comentario, reading.estadoIa);
  })();
  const saved = db.prepare(`SELECT estado_admin AS estadoAdmin FROM documentos_acreditacion WHERE id = ?`).get(id) as { estadoAdmin: string };
  return { id, estadoAdmin: saved.estadoAdmin, estadoIa: reading.estadoIa, comentarioIa: reading.comentario, archivo: relative };
}

/** Subida desde la cuenta del transportista. Usa sus datos reales y no aprueba el documento. */
export async function uploadAccountDocument(user: PublicUser, input: Omit<UploadInput, "transportistaId" | "tipoCliente" | "userId" | "rutCuenta">, deps: UploadDeps = {}) {
  if (!input.bytes.length) throw new AppError("Adjunta el documento.");
  if (user.role !== "transportista" && user.role !== "mandante") throw new AppError("Esta cuenta no sube acreditación.", 403);
  const cliente: TipoCliente = user.role === "mandante" ? "mandante" : "transportista";
  const db = getDb();
  const stamp = new Date().toISOString();
  let carrierId: string | null = null;
  if (cliente === "transportista") {
    let row = db.prepare(`SELECT id FROM transportistas WHERE user_id = ?`).get(user.id) as { id: string } | undefined;
    if (!row && user.rut) row = db.prepare(`SELECT id FROM transportistas WHERE rut = ?`).get(user.rut) as { id: string } | undefined;
    carrierId = row?.id ?? null;
    if (!carrierId) {
      carrierId = randomUUID();
      db.prepare(
        `INSERT INTO transportistas (id, user_id, nombre, rut, telefono, correo, ciudad, mensaje, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).run(carrierId, user.id, user.razonSocial || user.contactName, user.rut, user.whatsapp, user.email, user.city, stamp, stamp);
    } else {
      db.prepare(`UPDATE transportistas SET user_id = COALESCE(user_id, ?) WHERE id = ?`).run(user.id, carrierId);
    }
  }
  return storeAccreditationUpload({ ...input, tipoCliente: cliente, transportistaId: carrierId, userId: user.id, rutCuenta: user.rut }, deps);
}

function fechaVisible(value: string | null | undefined): string {
  if (!value) return "sin datos";
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "sin datos";
  return formatDateCL(day);
}

function estadoVisible(estado: string): "pendiente" | "aprobado" | "rechazado" | "renovacion" {
  if (estado === "aprobado" || estado === "rechazado" || estado === "renovacion") return estado;
  return "pendiente";
}

export type ConteoControl = {
  cargas: string;
  camiones: string;
  documentos: string;
  agente: string;
};

function tablaExiste(nombre: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nombre));
}

function conteoTabla(tabla: "loads" | "trucks" | "documentos_acreditacion" | "admin_bassam_360", where?: string): string {
  if (!tablaExiste(tabla)) return "sin datos";
  try {
    const n = (getDb().prepare(`SELECT COUNT(*) AS n FROM ${tabla}${where ? ` WHERE ${where}` : ""}`).get() as { n: number }).n;
    if (!Number.isInteger(n) || n < 0) return "sin datos";
    return String(n);
  } catch {
    return "sin datos";
  }
}

/** Conteos leídos de la base. Cero es un conteo real. Si la tabla no está, «sin datos». */
export function conteosControl(): ConteoControl {
  return {
    cargas: conteoTabla("loads", "is_demo = 0"),
    camiones: conteoTabla("trucks", "is_demo = 0"),
    documentos: conteoTabla("documentos_acreditacion"),
    agente: conteoTabla("admin_bassam_360", "origen = 'agente'"),
  };
}

export function conteoRegistrados(n: number): string {
  if (!Number.isInteger(n) || n < 0) return "sin datos";
  return n === 0 ? "0 registrados" : String(n);
}

function kycLine(): string {
  return "Sin datos";
}

export type EstadoCuenta = "Sin datos" | "En revisión" | "Acreditado";

export type VistaCuenta = {
  estado: EstadoCuenta;
  transportistas: FilaAcreditacion[];
  mandantes: FilaAcreditacion[];
  timeline: EventoTimeline[] | "sin datos";
};

type FilaGuardada = {
  id: string;
  tipoCliente: TipoCliente;
  tipo: string;
  createdAt: string;
  vencimiento: string | null;
  rutExtraido: string | null;
  comentarioIa: string | null;
  estadoAdmin: string;
};

function filaGuardada(row: FilaGuardada): FilaAcreditacion {
  return {
    id: row.id,
    tipoCliente: row.tipoCliente,
    fecha: fechaVisible(row.createdAt),
    tipo: row.tipo,
    rut: row.rutExtraido?.trim() || "sin datos",
    vencimiento: row.vencimiento ? fechaVisible(row.vencimiento) : "sin datos",
    comentarioIa: row.comentarioIa?.trim() || "sin datos",
    estado: estadoVisible(row.estadoAdmin),
    estadoAdmin: row.estadoAdmin,
  };
}

function estadoCuenta(rows: FilaGuardada[]): EstadoCuenta {
  if (rows.length === 0) return "Sin datos";
  const grupos = (["transportista", "mandante"] as const).filter((cliente) => rows.some((row) => row.tipoCliente === cliente));
  const acreditado = grupos.every((cliente) => tiposDe(cliente).every((tipo) => rows.some((row) => row.tipoCliente === cliente && row.tipo === tipo && row.estadoAdmin === "aprobado")));
  return acreditado ? "Acreditado" : "En revisión";
}

/** Documentos y eventos de una cuenta. Solo lee. */
export function vistaCuenta(userId: string): VistaCuenta {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, tipo_cliente AS tipoCliente, tipo, created_at AS createdAt, vencimiento, rut_extraido AS rutExtraido,
              comentario_ia AS comentarioIa, estado_admin AS estadoAdmin
       FROM documentos_acreditacion
       WHERE user_id = ? OR transportista_id IN (SELECT id FROM transportistas WHERE user_id = ?)
       ORDER BY created_at DESC`,
    )
    .all(userId, userId) as FilaGuardada[];
  const transportistas = rows.filter((row) => row.tipoCliente === "transportista").map(filaGuardada);
  const mandantes = rows.filter((row) => row.tipoCliente === "mandante").map(filaGuardada);
  if (rows.length === 0) return { estado: "Sin datos", transportistas, mandantes, timeline: "sin datos" };
  const marks = rows.map(() => "?").join(", ");
  const events = db
    .prepare(
      `SELECT id, created_at AS createdAt, origen, accion, comentario
       FROM admin_bassam_360
       WHERE tabla = 'documentos_acreditacion' AND registro_id IN (${marks})
       ORDER BY created_at DESC`,
    )
    .all(...rows.map((row) => row.id)) as { id: string; createdAt: string; origen: string; accion: string; comentario: string }[];
  return {
    estado: estadoCuenta(rows),
    transportistas,
    mandantes,
    timeline: events.length
      ? events.map((event) => ({ id: event.id, fecha: fechaVisible(event.createdAt), origen: event.origen, accion: event.accion, comentario: event.comentario }))
      : "sin datos",
  };
}

/** Listas y timeline armados solo con filas guardadas. */
export function panelAcreditacion(): PanelAcreditacion {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, tipo_cliente AS tipoCliente, tipo, created_at AS createdAt, vencimiento, rut_extraido AS rutExtraido,
              comentario_ia AS comentarioIa, estado_admin AS estadoAdmin
       FROM documentos_acreditacion ORDER BY created_at DESC`,
    )
    .all() as { id: string; tipoCliente: TipoCliente; tipo: string; createdAt: string; vencimiento: string | null; rutExtraido: string | null; comentarioIa: string | null; estadoAdmin: string }[];
  const filas = (cliente: TipoCliente): FilaAcreditacion[] =>
    rows
      .filter((row) => row.tipoCliente === cliente)
      .map((row) => ({
        id: row.id,
        tipoCliente: row.tipoCliente,
        fecha: fechaVisible(row.createdAt),
        tipo: row.tipo,
        rut: row.rutExtraido?.trim() || "sin datos",
        vencimiento: row.vencimiento ? fechaVisible(row.vencimiento) : "sin datos",
        comentarioIa: row.comentarioIa?.trim() || "sin datos",
        estado: estadoVisible(row.estadoAdmin),
        estadoAdmin: row.estadoAdmin,
      }));
  const transportista = filas("transportista");
  const mandante = filas("mandante");
  const events = db
    .prepare(`SELECT id, created_at AS createdAt, origen, accion, comentario FROM admin_bassam_360 ORDER BY created_at DESC LIMIT 80`)
    .all() as { id: string; createdAt: string; origen: string; accion: string; comentario: string }[];
  return {
    transportistas: { conteo: conteoRegistrados(transportista.length), filas: transportista },
    mandantes: { conteo: conteoRegistrados(mandante.length), filas: mandante },
    timeline: events.length
      ? events.map((event) => ({ id: event.id, fecha: fechaVisible(event.createdAt), origen: event.origen, accion: event.accion, comentario: event.comentario }))
      : "sin datos",
    kyc: kycLine(),
  };
}

export function alertWindow(days: number): AlertDay | null {
  if (days === 30 || days === 15 || days === 7) return days;
  return null;
}

/** El agente solo escribe comentario_ia y estado_ia. No toca estado_admin. */
export function recordAgentComment(input: { table: AgentTable; id: string; comentarioIa: string; estadoIa: string }) {
  const table = parseTable(input.table);
  const comentario = input.comentarioIa.trim();
  const estadoIa = input.estadoIa.trim();
  if (!comentario) throw new AppError("El comentario es obligatorio.");
  if (!estadoIa) throw new AppError("El estado de la IA es obligatorio.");
  if (comentario.length > 2000 || estadoIa.length > 80) throw new AppError("El comentario o el estado es demasiado largo.");
  const db = getDb();
  const exists = db.prepare(`SELECT id FROM ${TABLE_SQL[table]} WHERE id = ?`).get(input.id);
  if (!exists) throw new AppError("Registro no encontrado.", 404);
  const stamp = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE ${TABLE_SQL[table]} SET comentario_ia = ?, estado_ia = ?, updated_at = ? WHERE id = ?`).run(comentario, estadoIa, stamp, input.id);
    db.prepare(
      `INSERT INTO admin_bassam_360 (id, created_at, origen, tabla, registro_id, comentario, accion, estado_ia, actor_id)
       VALUES (?, ?, 'agente', ?, ?, ?, 'comentario', ?, NULL)`,
    ).run(randomUUID(), stamp, table, input.id, comentario, estadoIa);
  })();
}

function comentarioHumano(action: HumanAction): string {
  switch (action) {
    case "aprobar":
      return "Aprobado por una persona.";
    case "rechazar":
      return "Rechazado por una persona.";
    case "pedir_renovacion":
      return "Se pidió renovación.";
    case "pedir_correccion":
      return "Se solicitó revisión.";
    default: {
      const desconocida: never = action;
      return desconocida;
    }
  }
}

export function reviewDocument(user: PublicUser, documentId: string, action: HumanAction) {
  assertAdmin(user);
  if (!(HUMAN_ACTIONS as readonly string[]).includes(action)) throw new AppError("Acción no válida.");
  const db = getDb();
  const doc = db
    .prepare(`SELECT id, transportista_id AS transportistaId, estado_admin AS estadoAdmin FROM documentos_acreditacion WHERE id = ?`)
    .get(documentId) as { id: string; transportistaId: string; estadoAdmin: string } | undefined;
  if (!doc) throw new AppError("Documento no encontrado.", 404);
  const stamp = new Date().toISOString();
  const next = action === "aprobar" ? "aprobado" : action === "rechazar" ? "rechazado" : "renovacion";
  const comment = comentarioHumano(action);
  db.transaction(() => {
    db.prepare(`UPDATE documentos_acreditacion SET estado_admin = ?, updated_at = ? WHERE id = ?`).run(next, stamp, doc.id);
    if (action === "aprobar" && doc.transportistaId) {
      db.prepare(`UPDATE transportistas SET estado = 'activo', updated_at = ? WHERE id = ?`).run(stamp, doc.transportistaId);
    }
    db.prepare(
      `INSERT INTO admin_bassam_360 (id, created_at, origen, tabla, registro_id, comentario, accion, estado_ia, actor_id)
       VALUES (?, ?, 'humano', 'documentos_acreditacion', ?, ?, ?, NULL, ?)`,
    ).run(randomUUID(), stamp, doc.id, comment, action, user.id);
  })();
  return { id: doc.id, estadoAdmin: next, transportistaActivo: action === "aprobar" && Boolean(doc.transportistaId) };
}

export function listPendingDocuments(tipoCliente?: TipoCliente): PendingDocument[] {
  const sql = tipoCliente
    ? `SELECT d.id, d.tipo, d.tipo_cliente AS tipoCliente, d.vencimiento, d.comentario_ia AS comentarioIa, d.estado_ia AS estadoIa, d.estado_admin AS estadoAdmin,
              d.transportista_id AS transportistaId, COALESCE(t.nombre, u.razon_social) AS transportistaNombre, COALESCE(t.estado, '') AS transportistaEstado
       FROM documentos_acreditacion d
       LEFT JOIN transportistas t ON t.id = d.transportista_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.estado_admin = 'pendiente_ok' AND d.tipo_cliente = ?
       ORDER BY d.vencimiento IS NULL, d.vencimiento, d.created_at`
    : `SELECT d.id, d.tipo, d.tipo_cliente AS tipoCliente, d.vencimiento, d.comentario_ia AS comentarioIa, d.estado_ia AS estadoIa, d.estado_admin AS estadoAdmin,
              d.transportista_id AS transportistaId, COALESCE(t.nombre, u.razon_social) AS transportistaNombre, COALESCE(t.estado, '') AS transportistaEstado
       FROM documentos_acreditacion d
       LEFT JOIN transportistas t ON t.id = d.transportista_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.estado_admin = 'pendiente_ok'
       ORDER BY d.tipo_cliente, d.vencimiento IS NULL, d.vencimiento, d.created_at`;
  const rows = tipoCliente ? getDb().prepare(sql).all(tipoCliente) : getDb().prepare(sql).all();
  return (rows as PendingDocument[]).map((item) => ({ ...item, transportistaNombre: item.transportistaNombre?.trim() || "sin datos" }));
}

/** Avisa a 30, 15 y 7 días. Solo comentario y fila de historial. No aprueba ni avisa por correo o WhatsApp. */
export function runExpiryAlerts(today: string): { written: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new AppError("Fecha no válida.");
  const db = getDb();
  const docs = db
    .prepare(
      `SELECT d.id, d.vencimiento, d.tipo
       FROM documentos_acreditacion d
       LEFT JOIN transportistas t ON t.id = d.transportista_id
       WHERE d.vencimiento IS NOT NULL AND (d.tipo_cliente = 'mandante' OR t.id IS NOT NULL)`,
    )
    .all() as { id: string; vencimiento: string; tipo: string }[];
  let written = 0;
  const stamp = new Date().toISOString();
  db.transaction(() => {
    for (const doc of docs) {
      const days = daysBetween(today, doc.vencimiento);
      const window = alertWindow(days);
      if (!window) continue;
      const accion = `alerta_${window}`;
      const already = db.prepare(`SELECT 1 FROM admin_bassam_360 WHERE tabla = 'documentos_acreditacion' AND registro_id = ? AND accion = ?`).get(doc.id, accion);
      if (already) continue;
      const comentario = `Vence en ${window} días.`;
      const estadoIa = accion;
      db.prepare(`UPDATE documentos_acreditacion SET comentario_ia = ?, estado_ia = ?, updated_at = ? WHERE id = ?`).run(comentario, estadoIa, stamp, doc.id);
      db.prepare(
        `INSERT INTO admin_bassam_360 (id, created_at, origen, tabla, registro_id, comentario, accion, estado_ia, actor_id)
         VALUES (?, ?, 'alerta', 'documentos_acreditacion', ?, ?, ?, ?, NULL)`,
      ).run(randomUUID(), stamp, doc.id, comentario, accion, estadoIa);
      written += 1;
    }
  })();
  return { written };
}
