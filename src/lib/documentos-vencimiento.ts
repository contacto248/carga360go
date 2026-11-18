import { randomUUID } from "crypto";
import { audit, auditStrict } from "./audit";
import { getDb } from "./db";
import { AppError } from "./errors";
import { daysBetween, todayChile } from "./format";
import type { PublicUser } from "./types";

/**
 * Vencimiento de documentos de conductor y vehículo.
 * Solo el texto exacto "true" enciende el flag. Apagado: no hay bloqueo y la página responde 404.
 * No envía correo ni WhatsApp. El aviso es una alerta ops de un solo kind: aviso_vencimiento.
 */
export const DOCS_VENCIMIENTO_FLAG = "DOCS_VENCIMIENTO_ENABLED";

/** Un kind nuevo. No reemplaza atraso, detencion ni sin_senal. */
export const AVISO_VENCIMIENTO_KIND = "aviso_vencimiento";

export const AVISO_DIAS = [30, 15, 7] as const;

export const TIPOS_CONDUCTOR = ["licencia", "curso_seguridad"] as const;
export const TIPOS_VEHICULO = ["revision_tecnica", "seguro", "permiso_circulacion", "soap"] as const;

const ETIQUETA: Record<string, string> = {
  licencia: "licencia",
  curso_seguridad: "cursos de seguridad",
  revision_tecnica: "revisión técnica",
  seguro: "seguro",
  permiso_circulacion: "permiso de circulación",
  soap: "SOAP",
};

type FlagEnv = Record<string, string | undefined>;
type Actor = Pick<PublicUser, "id" | "email">;

export function docsVencimientoEnabled(env: FlagEnv = process.env): boolean {
  return env[DOCS_VENCIMIENTO_FLAG] === "true";
}

/** true solo para la página nueva, y solo cuando el flag no es el texto "true". */
export function documentosPageHidden(pathname: string, env: FlagEnv = process.env): boolean {
  const path = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (path !== "/admin/documentos-vencimiento") return false;
  return !docsVencimientoEnabled(env);
}

export type DocumentoVencimiento = {
  id: string;
  sujeto: "conductor" | "vehiculo";
  sujetoId: string;
  tipo: string;
  numero: string | null;
  venceEl: string;
  verificacion: "pendiente" | "verificado" | "rechazado";
  verificadoPor: string | null;
};

type DocRow = {
  id: string;
  sujeto: "conductor" | "vehiculo";
  sujeto_id: string;
  tipo: string;
  numero: string | null;
  vence_el: string;
  verificacion: "pendiente" | "verificado" | "rechazado";
  verificado_por: string | null;
};

function mapDoc(row: DocRow): DocumentoVencimiento {
  return {
    id: row.id,
    sujeto: row.sujeto,
    sujetoId: row.sujeto_id,
    tipo: row.tipo,
    numero: row.numero,
    venceEl: row.vence_el,
    verificacion: row.verificacion,
    verificadoPor: row.verificado_por,
  };
}

export function listarDocumentos(): DocumentoVencimiento[] {
  const rows = getDb()
    .prepare(
      `SELECT id, sujeto, sujeto_id, tipo, numero, vence_el, verificacion, verificado_por
       FROM documentos_vencimiento ORDER BY vence_el, tipo, id`,
    )
    .all() as DocRow[];
  return rows.map(mapDoc);
}

export type RequisitoFaena = { faena: string; tipo: string };

/** Lee la lista configurable. No inserta filas y no exige documentos que no estén cargados. */
export function requisitosPorFaena(faena?: string): RequisitoFaena[] {
  if (faena?.trim()) {
    return getDb()
      .prepare(`SELECT faena, tipo FROM documentos_faena WHERE faena = ? ORDER BY tipo`)
      .all(faena.trim()) as RequisitoFaena[];
  }
  return getDb().prepare(`SELECT faena, tipo FROM documentos_faena ORDER BY faena, tipo`).all() as RequisitoFaena[];
}

/** Vencido si la fecha es anterior al día de hoy en America/Santiago. Vence hoy sigue vigente. */
export function documentoVencido(venceEl: string, now = new Date()): boolean {
  return venceEl < todayChile(now);
}

/**
 * Bloqueo de asignación y de aceptación. Con el flag apagado no corre.
 * Mira documentos ya cargados del conductor (la cuenta transportista) y del vehículo de la oferta.
 * No consulta requisitos por faena: esa lista puede estar vacía y no inventa faltantes.
 */
export function assertDocumentosParaCarga(input: {
  accion: "asignar" | "aceptar";
  carrierId: string;
  truckId: string | null;
  actor: Actor;
  loadId: string;
  now?: Date;
}): void {
  if (!docsVencimientoEnabled()) return;
  const now = input.now ?? new Date();
  const today = todayChile(now);
  const rows = (
    input.truckId
      ? getDb()
          .prepare(
            `SELECT id, sujeto, sujeto_id, tipo, numero, vence_el, verificacion, verificado_por
             FROM documentos_vencimiento
             WHERE (sujeto = 'conductor' AND sujeto_id = ?) OR (sujeto = 'vehiculo' AND sujeto_id = ?)`,
          )
          .all(input.carrierId, input.truckId)
      : getDb()
          .prepare(
            `SELECT id, sujeto, sujeto_id, tipo, numero, vence_el, verificacion, verificado_por
             FROM documentos_vencimiento
             WHERE sujeto = 'conductor' AND sujeto_id = ?`,
          )
          .all(input.carrierId)
  ) as DocRow[];
  const malos = rows.filter((row) => row.verificacion !== "verificado" || documentoVencido(row.vence_el, now));
  if (malos.length === 0) return;
  const detalle = malos.map((row) => {
    const causas: string[] = [];
    if (row.verificacion !== "verificado") causas.push("sin verificar");
    if (documentoVencido(row.vence_el, now)) causas.push("vencido");
    const quien = row.sujeto === "conductor" ? "conductor" : "vehículo";
    return `${quien} ${ETIQUETA[row.tipo] ?? row.tipo} (${causas.join(" y ")}, vence ${row.vence_el})`;
  });
  audit(
    input.actor,
    "carga.documento_bloquea",
    { type: "carga", id: input.loadId },
    {
      accion: input.accion,
      hoy: today,
      documentos: malos.map((row) => ({
        id: row.id,
        sujeto: row.sujeto,
        tipo: row.tipo,
        venceEl: row.vence_el,
        verificacion: row.verificacion,
      })),
    },
  );
  const verbo = input.accion === "asignar" ? "asignar" : "aceptar";
  throw new AppError(
    `No se puede ${verbo} la carga: el conductor o el vehículo tiene un documento vencido o sin verificar: ${detalle.join("; ")}.`,
    409,
    "documento_no_vigente",
  );
}

type Aviso = {
  documentoId: string;
  sujeto: string;
  tipo: string;
  venceEl: string;
  dias: number;
  transportistaId: string;
  clienteId: string;
};

type ShipmentHit = { shipment_id: string; cliente_id: string; transportista_id: string };

function shipmentsDe(doc: DocRow): ShipmentHit[] {
  const filtro = doc.sujeto === "vehiculo" ? "o.truck_id = ?" : "o.carrier_id = ?";
  return getDb()
    .prepare(
      `SELECT DISTINCT s.id AS shipment_id, l.owner_id AS cliente_id, o.carrier_id AS transportista_id
       FROM ops_shipments s
       JOIN loads l ON l.id = s.load_id
       JOIN offers o ON o.load_id = l.id AND o.status IN ('activa', 'aceptada')
       WHERE ${filtro}`,
    )
    .all(doc.sujeto_id) as ShipmentHit[];
}

/**
 * Abre o cierra aviso_vencimiento en el envío del transportista y del cliente.
 * Solo a 30, 15 y 7 días. No envía correo ni WhatsApp. Con el flag apagado no corre.
 */
export function evaluateAvisosVencimiento(now = new Date(), actor: Actor | null = null): { reviewed: number; opened: number; closed: number } {
  if (!docsVencimientoEnabled()) return { reviewed: 0, opened: 0, closed: 0 };
  const today = todayChile(now);
  const docs = getDb()
    .prepare(`SELECT id, sujeto, sujeto_id, tipo, numero, vence_el, verificacion, verificado_por FROM documentos_vencimiento`)
    .all() as DocRow[];
  const due = docs.filter((doc) => {
    const dias = daysBetween(today, doc.vence_el);
    return (AVISO_DIAS as readonly number[]).includes(dias);
  });
  const byShipment = new Map<string, Aviso[]>();
  for (const doc of due) {
    const dias = daysBetween(today, doc.vence_el);
    for (const hit of shipmentsDe(doc)) {
      const list = byShipment.get(hit.shipment_id) ?? [];
      list.push({
        documentoId: doc.id,
        sujeto: doc.sujeto,
        tipo: doc.tipo,
        venceEl: doc.vence_el,
        dias,
        transportistaId: hit.transportista_id,
        clienteId: hit.cliente_id,
      });
      byShipment.set(hit.shipment_id, list);
    }
  }
  const db = getDb();
  let opened = 0;
  let closed = 0;
  const stamp = now.toISOString();
  const save = db.transaction(() => {
    for (const [shipmentId, avisos] of byShipment) {
      const evidence = JSON.stringify({ audiencia: ["transportista", "cliente"], canal: "ops_alerta", avisos });
      const current = db
        .prepare(`SELECT id FROM ops_alerts WHERE shipment_id = ? AND kind = ? AND status = 'abierta'`)
        .get(shipmentId, AVISO_VENCIMIENTO_KIND) as { id: string } | undefined;
      if (current) {
        db.prepare(`UPDATE ops_alerts SET evidence_json = ?, updated_at = ? WHERE id = ?`).run(evidence, stamp, current.id);
        continue;
      }
      const id = randomUUID();
      db.prepare(
        `INSERT INTO ops_alerts (id, shipment_id, kind, status, severity, evidence_json, opened_at, updated_at)
         VALUES (?, ?, ?, 'abierta', 'media', ?, ?, ?)`,
      ).run(id, shipmentId, AVISO_VENCIMIENTO_KIND, evidence, stamp, stamp);
      auditStrict(actor, "ops.alerta_abierta", { type: "envio", id: shipmentId }, { kind: AVISO_VENCIMIENTO_KIND, alertaId: id, avisos: avisos.length });
      opened += 1;
    }
    const abiertas = db
      .prepare(`SELECT id, shipment_id FROM ops_alerts WHERE kind = ? AND status = 'abierta'`)
      .all(AVISO_VENCIMIENTO_KIND) as { id: string; shipment_id: string }[];
    for (const row of abiertas) {
      if (byShipment.has(row.shipment_id)) continue;
      db.prepare(`UPDATE ops_alerts SET status = 'cerrada', updated_at = ? WHERE id = ?`).run(stamp, row.id);
      closed += 1;
    }
  });
  save();
  return { reviewed: due.length, opened, closed };
}
