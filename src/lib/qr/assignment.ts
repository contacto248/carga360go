import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { audit } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import { todayChile } from "../format";
import { normalizePatente } from "../security";
import type { PublicUser } from "../types";
import { prepararCadena, escribirEvento } from "./chain";
import { nombreCorto, tratoDeCarga } from "./deal";
import { assertQrFase1, qrFase1Enabled } from "./flag";
import { guardarPatente, resolverPatente } from "./patente";

const REQUIRED = ["licencia", "padron", "revision", "soap", "permiso"] as const;

type DocRow = {
  type: string;
  holder_name: string | null;
  expiry: string;
  verification_status: string;
  truck_id: string | null;
};

function assertDocumentos(carrierId: string, truckId: string, patente: string) {
  const docs = getDb()
    .prepare(
      `SELECT type, holder_name, expiry, verification_status, truck_id FROM documents WHERE user_id = ? AND type IN ('licencia','padron','revision','soap','permiso')`,
    )
    .all(carrierId) as DocRow[];
  const today = todayChile();
  const missing: string[] = [];
  for (const type of REQUIRED) {
    const candidates = docs.filter((doc) => doc.type === type && doc.verification_status === "verificado" && doc.expiry >= today);
    const usable = candidates.filter((doc) => {
      if (type === "licencia") return true;
      if (doc.truck_id && doc.truck_id !== truckId) return false;
      if (!doc.holder_name) return true;
      const marked = doc.holder_name.match(/patente\s*([a-z0-9-]{5,12})/i);
      if (!marked) return true;
      return normalizePatente(marked[1]) === patente;
    });
    if (!usable.length) missing.push(type);
  }
  if (missing.length) {
    throw new AppError(`No se puede asignar: documentos vencidos o que no calzan (${missing.join(", ")}).`, 409, "documentos");
  }
}

function savePhoto(driverId: string, dataUrl: string): string {
  const match = /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl.replace(/\s/g, ""));
  if (!match) throw new AppError("La foto debe ser JPG, PNG o WebP.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 32 || bytes.length > 400_000) throw new AppError("La foto debe pesar entre 1 KB y 400 KB.");
  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const dir = path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"), "choferes");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${driverId}.${ext}`);
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  return file;
}

export function asignarChofer(
  user: PublicUser,
  loadId: string,
  input: { nombre: string; truckId: string; patente?: string | null; foto?: string | null },
  now = new Date(),
) {
  assertQrFase1();
  const deal = tratoDeCarga(loadId);
  if (!deal || deal.status !== "cerrado") throw new AppError("Primero hay que cerrar el trato.", 409);
  const load = getDb()
    .prepare(
      `SELECT l.owner_id, l.trip_status, o.carrier_id FROM loads l JOIN offers o ON o.id = l.awarded_offer_id WHERE l.id = ?`,
    )
    .get(loadId) as { owner_id: string; trip_status: string | null; carrier_id: string } | undefined;
  if (!load || load.carrier_id !== user.id) throw new AppError("Solo el transportista del trato asigna chofer y camión.", 403);
  if (load.trip_status === "retirado" || load.trip_status === "en_transito" || load.trip_status === "entregado") {
    throw new AppError("Este viaje ya pasó el retiro.", 409);
  }
  const truck = getDb().prepare(`SELECT id, owner_id FROM trucks WHERE id = ?`).get(input.truckId) as
    | { id: string; owner_id: string }
    | undefined;
  if (!truck || truck.owner_id !== user.id) throw new AppError("Elige un camión de tu flota.", 400);
  const nombre = nombreCorto(input.nombre);
  if (nombre.length < 2) throw new AppError("Indica el nombre del chofer.");
  if (/\d{7,}/.test(input.nombre) || /[0-9]{1,2}\.[0-9]{3}/.test(input.nombre)) {
    throw new AppError("El nombre del chofer no puede incluir RUT ni teléfono.");
  }
  const resolved = resolverPatente(truck.id);
  const typed = input.patente ? normalizePatente(input.patente) : null;
  if (input.patente && !typed) throw new AppError("La patente no tiene formato chileno.");
  const patente = resolved.patente || typed;
  if (!patente) throw new AppError("Indica la patente del camión.");
  if (resolved.patente && typed && resolved.patente !== typed) {
    throw new AppError("La patente no coincide con la que ya está registrada en el camión.");
  }
  assertDocumentos(user.id, truck.id, patente);
  if (!resolved.patente) guardarPatente(truck.id, patente);
  else if (resolved.origen !== "columna") guardarPatente(truck.id, resolved.patente);

  const stamp = now.toISOString();
  const shipment = prepararCadena(loadId, user);
  const db = getDb();
  const saved = db.transaction(() => {
    const current = db.prepare(`SELECT id, epoch FROM trip_assignments WHERE load_id = ? AND status = 'vigente'`).get(loadId) as
      | { id: string; epoch: number }
      | undefined;
    const epoch = (current?.epoch ?? 0) + 1;
    if (current) {
      db.prepare(`UPDATE trip_assignments SET status = 'reemplazada', replaced_at = ? WHERE id = ?`).run(stamp, current.id);
    }
    const driverId = randomUUID();
    const photo = input.foto ? savePhoto(driverId, input.foto) : null;
    db.prepare(
      `INSERT INTO drivers (id, carrier_id, user_id, display_name, photo_path, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pendiente', ?)`,
    ).run(driverId, user.id, user.id, nombre, photo, stamp);
    const assignmentId = randomUUID();
    db.prepare(
      `INSERT INTO trip_assignments (id, load_id, driver_id, truck_id, patente_snapshot, epoch, status, assigned_by, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, 'vigente', ?, ?)`,
    ).run(assignmentId, loadId, driverId, truck.id, patente, epoch, user.id, stamp);
    db.prepare(
      `UPDATE trip_handoffs
       SET epoch = ?, status = 'pendiente', validated_at = NULL, validated_by = NULL, method = NULL,
           holder_confirmed_at = NULL, locked_until = NULL, revoked_at = NULL, sync_state = 'en_linea'
       WHERE load_id = ? AND kind = 'retiro'`,
    ).run(epoch, loadId);
    escribirEvento(
      db,
      shipment.id,
      current ? "qr.chofer_reasignado" : "qr.chofer_asignado",
      { patente, choferId: driverId, epoch },
      user.id,
      stamp,
    );
    return { driverId, epoch, reassigned: Boolean(current) };
  })();
  audit(user, "trato.chofer_asignado", { type: "carga", id: loadId }, { patente, epoch: saved.epoch });
  return { nombre, patente, epoch: saved.epoch, reassigned: saved.reassigned };
}

export function asignacionVigente(loadId: string) {
  if (!qrFase1Enabled()) return undefined;
  return (
    getDb()
      .prepare(
        `SELECT a.id, a.driver_id AS driverId, a.truck_id AS truckId, a.patente_snapshot AS patente, a.epoch,
              d.display_name AS nombre, d.photo_path AS photoPath, d.user_id AS driverUserId, d.carrier_id AS carrierId,
              u.razon_social AS empresa
       FROM trip_assignments a
       JOIN drivers d ON d.id = a.driver_id
       JOIN users u ON u.id = d.carrier_id
       WHERE a.load_id = ? AND a.status = 'vigente'`,
      )
      .get(loadId) as
      | {
          id: string;
          driverId: string;
          truckId: string;
          patente: string;
          epoch: number;
          nombre: string;
          photoPath: string | null;
          driverUserId: string | null;
          carrierId: string;
          empresa: string;
        }
      | undefined
  );
}

export function fotoChofer(loadId: string): { path: string; mime: string } | null {
  assertQrFase1();
  const row = asignacionVigente(loadId);
  if (!row?.photoPath || !fs.existsSync(row.photoPath)) return null;
  const root = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"));
  const file = path.resolve(row.photoPath);
  if (!file.startsWith(root + path.sep)) return null;
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { path: file, mime };
}
