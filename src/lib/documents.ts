import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { docTypeById } from "./catalog";
import { getDb } from "./db";
import { AppError } from "./errors";
import { normalizePatente } from "./security";
import type { DocAudience, DocumentRecord, PublicUser, VerificationStatus } from "./types";

const ALLOWED = new Map<string, string>([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
]);

/** Revisa la firma real del archivo (no basta con el tipo que declara el navegador). */
function magicMatches(buffer: Buffer, mime: string): boolean {
  if (mime === "application/pdf") return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  if (mime === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

type DocRow = {
  id: string;
  user_id: string;
  truck_id: string | null;
  audience: string;
  type: string;
  detail: string | null;
  holder_name: string | null;
  expiry: string;
  file_name: string | null;
  stored_path: string | null;
  mime: string | null;
  size_bytes: number | null;
  verification_status: VerificationStatus;
  verification_note: string | null;
  created_at: string;
};

export type StoredFile = {
  buffer: Buffer;
  originalName: string;
  mime: string;
};

function mapDoc(row: DocRow): DocumentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    truckId: row.truck_id,
    audience: row.audience === "camion" ? "camion" : "personal",
    type: row.type,
    detail: row.detail,
    holderName: row.holder_name,
    expiry: row.expiry,
    fileName: row.file_name,
    storedPath: row.stored_path,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note,
    createdAt: row.created_at,
  };
}

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
}

export function maxUploadBytes(): number {
  const parsed = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10 * 1024 * 1024;
}

export function resolveStored(relativePath: string): string {
  const root = path.resolve(uploadDir());
  const full = path.resolve(root, relativePath);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) throw new AppError("Ruta de archivo inválida.", 400);
  return full;
}

function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/g, "_").slice(0, 120);
  return base || "documento";
}

function cleanNote(note: string | null, required: boolean): string | null {
  const clean = note?.trim() || null;
  if (required && !clean) throw new AppError("Indica el motivo del rechazo.");
  if (clean && clean.length > 500) throw new AppError("El motivo es demasiado largo.");
  return clean;
}

export function addDocument(
  user: PublicUser,
  input: {
    type: string;
    expiry: string;
    truckId?: string | null;
    holderName?: string | null;
    detail?: string | null;
    file?: StoredFile | null;
  },
): DocumentRecord {
  const def = docTypeById(input.type);
  if (!def) throw new AppError("Elige un tipo de documento.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiry) || Number.isNaN(Date.parse(input.expiry))) throw new AppError("Indica la fecha de vencimiento.");
  if (input.expiry > "2100-01-01") throw new AppError("Revisa la fecha de vencimiento.");
  const audience: DocAudience = def.audience;
  let truckId: string | null = input.truckId || null;
  let holderName: string | null = input.holderName?.trim() || null;
  let detail: string | null = input.detail?.trim() || null;
  if (audience === "camion") {
    if (truckId) {
      const truck = getDb().prepare(`SELECT owner_id FROM trucks WHERE id = ?`).get(truckId) as
        | { owner_id: string }
        | undefined;
      if (!truck || truck.owner_id !== user.id) throw new AppError("Ese camión no está en tu cuenta.", 403);
      holderName = null;
    } else {
      // Sin camión publicado: se identifica el vehículo por su patente (se guarda en holder_name).
      const patente = normalizePatente(holderName || "");
      if (!patente) {
        throw new AppError("Elige el camión o indica una patente chilena válida (ej: BBCD12 o AB1234).");
      }
      holderName = `Patente ${patente}`;
    }
  } else {
    truckId = null;
    if (!holderName || holderName.length < 2) throw new AppError("Indica el nombre del conductor o de la persona.");
  }
  if (def.details) {
    if (def.detailsOptional && !detail) detail = null;
    else if (!detail || !def.details.includes(detail)) {
      throw new AppError(`Elige ${(def.detailLabel || "el detalle").toLowerCase()}: ${def.details.join(", ")}.`);
    }
  } else {
    detail = null;
  }
  const id = randomUUID();
  let storedPath: string | null = null;
  let fileName: string | null = null;
  let mime: string | null = null;
  let size: number | null = null;
  if (input.file && input.file.buffer.length > 0) {
    const ext = ALLOWED.get(input.file.mime);
    if (!ext) throw new AppError("Solo se aceptan archivos PDF, JPG o PNG.");
    if (!magicMatches(input.file.buffer, input.file.mime)) throw new AppError("El archivo está dañado o no es realmente un PDF, JPG o PNG.");
    if (input.file.buffer.length > maxUploadBytes()) {
      throw new AppError("El archivo supera el tamaño máximo permitido (10 MB).");
    }
    const originalExt = path.extname(input.file.originalName).toLowerCase();
    const extOk =
      originalExt === ext || (ext === ".jpg" && (originalExt === ".jpeg" || originalExt === ".jpg")) || originalExt === "";
    if (!extOk) throw new AppError("La extensión del archivo no coincide con su tipo.");
    storedPath = path.join(user.id, `${id}${ext}`);
    const full = resolveStored(storedPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, input.file.buffer, { mode: 0o640 });
    fileName = safeFileName(input.file.originalName);
    mime = input.file.mime;
    size = input.file.buffer.length;
  }
  try {
    getDb()
      .prepare(
        `INSERT INTO documents (
          id, user_id, truck_id, audience, type, detail, holder_name, expiry, file_name, stored_path, mime, size_bytes,
          verification_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
      )
      .run(
        id,
        user.id,
        truckId,
        audience,
        input.type,
        detail,
        holderName,
        input.expiry,
        fileName,
        storedPath,
        mime,
        size,
        new Date().toISOString(),
      );
  } catch (error) {
    if (storedPath) fs.rmSync(resolveStored(storedPath), { force: true });
    throw error;
  }
  return getDocument(id)!;
}

export function getDocument(id: string): DocumentRecord | null {
  const row = getDb().prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocRow | undefined;
  return row ? mapDoc(row) : null;
}

export function listDocuments(userId: string): DocumentRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM documents WHERE user_id = ? ORDER BY expiry ASC`)
    .all(userId) as DocRow[];
  return rows.map(mapDoc);
}

export function listAllDocuments(): (DocumentRecord & { ownerName: string; ownerEmail: string })[] {
  const rows = getDb()
    .prepare(
      `SELECT d.*, u.razon_social AS owner_name, u.email AS owner_email
       FROM documents d JOIN users u ON u.id = d.user_id
       ORDER BY d.created_at DESC`,
    )
    .all() as (DocRow & { owner_name: string; owner_email: string })[];
  return rows.map((row) => ({ ...mapDoc(row), ownerName: row.owner_name, ownerEmail: row.owner_email }));
}

export function removeDocument(user: PublicUser, id: string) {
  const doc = getDocument(id);
  if (!doc) throw new AppError("Documento no encontrado.", 404);
  if (doc.userId !== user.id && user.role !== "admin") throw new AppError("No puedes quitar este documento.", 403);
  if (doc.storedPath) fs.rmSync(resolveStored(doc.storedPath), { force: true });
  getDb().prepare(`DELETE FROM documents WHERE id = ?`).run(id);
}

export function setDocumentVerification(id: string, status: VerificationStatus, note: string | null): DocumentRecord {
  const doc = getDocument(id);
  if (!doc) throw new AppError("Documento no encontrado.", 404);
  const clean = cleanNote(note, status === "rechazado");
  getDb()
    .prepare(`UPDATE documents SET verification_status = ?, verification_note = ? WHERE id = ?`)
    .run(status, clean, id);
  return getDocument(id)!;
}

export function readDocumentFile(user: PublicUser, id: string): { filePath: string; mime: string; fileName: string } {
  const doc = getDocument(id);
  if (!doc || !doc.storedPath) throw new AppError("Este documento no tiene archivo.", 404);
  if (doc.userId !== user.id && user.role !== "admin") throw new AppError("No puedes ver este archivo.", 403);
  return {
    filePath: resolveStored(doc.storedPath),
    mime: doc.mime || "application/octet-stream",
    fileName: doc.fileName || "documento",
  };
}
