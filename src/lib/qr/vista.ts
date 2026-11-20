import { equipmentById } from "../catalog";
import { getDb } from "../db";
import { AppError } from "../errors";
import { formatDateCL } from "../format";
import type { PublicUser } from "../types";
import { asignacionVigente } from "./assignment";
import { nombreCorto, retiroValidado, tratoDeCarga } from "./deal";
import { assertQrFase1, delegateLinkEnabled, qrFase1Enabled } from "./flag";
import { delegadoVigente, emitirQr } from "./handoff";
import { formatPatente, resolverPatente } from "./patente";

export type RolQr = "mandante" | "transportista" | "delegado" | "admin";

export type VistaQr = {
  loadId: string;
  rol: RolQr;
  estado: string;
  folio: string | null;
  origen: string;
  destino: string;
  retiro: string;
  qrSvg: string | null;
  segundos: number;
  codigo: string | null;
  chofer: { nombre: string; empresa: string; patente: string; iniciales: string; foto: boolean } | null;
  esperandoConfirmacion: boolean;
  retiroValidado: boolean;
  puedeConfirmarTrato: boolean;
  puedeAsignar: boolean;
  puedeReasignar: boolean;
  puedeEscanear: boolean;
  delegadoHabilitado: boolean;
  camiones: { id: string; label: string; patente: string | null }[];
  viaje: string | null;
};

function iniciales(nombre: string): string {
  const parts = nombre.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "C") + (parts[1]?.[0] || "")).toUpperCase();
}

function camionesDe(userId: string) {
  const rows = getDb()
    .prepare(`SELECT id, equipment, tonnage, origin, destination FROM trucks WHERE owner_id = ? ORDER BY updated_at DESC`)
    .all(userId) as { id: string; equipment: string; tonnage: number; origin: string; destination: string }[];
  return rows.map((row) => {
    const patente = resolverPatente(row.id).patente;
    const equipo = equipmentById(row.equipment).label;
    return {
      id: row.id,
      label: `${equipo} ${row.tonnage} t · ${row.origin} → ${row.destination}`,
      patente: patente ? formatPatente(patente) : null,
    };
  });
}

export async function vistaQr(loadId: string, user: PublicUser | null, delegadoToken?: string | null, now = new Date()): Promise<VistaQr> {
  assertQrFase1();
  const deal = tratoDeCarga(loadId);
  if (!deal) throw new AppError("Esta carga no tiene un trato con QR.", 404);
  const load = getDb()
    .prepare(
      `SELECT l.origin, l.destination, l.owner_id, l.trip_status, o.carrier_id, o.pickup_date
       FROM loads l JOIN offers o ON o.id = l.awarded_offer_id WHERE l.id = ?`,
    )
    .get(loadId) as
    | { origin: string; destination: string; owner_id: string; trip_status: string | null; carrier_id: string; pickup_date: string }
    | undefined;
  if (!load) throw new AppError("Carga no encontrada.", 404);
  const link = delegadoToken ? delegadoVigente(delegadoToken, now) : null;
  if (delegadoToken && !link) throw new AppError("El enlace no sirve.", 403);
  if (link && link.load_id !== loadId) throw new AppError("El enlace no sirve.", 403);

  let rol: RolQr | null = link ? "delegado" : null;
  if (!rol && user) {
    if (user.id === load.owner_id) rol = "mandante";
    else if (user.id === load.carrier_id) rol = "transportista";
    else if (user.role === "admin") rol = "admin";
  }
  if (!rol) throw new AppError("No tienes acceso a este comprobante.", 403);

  const assignment = asignacionVigente(loadId);
  const hand = getDb().prepare(`SELECT status FROM trip_handoffs WHERE load_id = ? AND kind = 'retiro'`).get(loadId) as
    | { status: string }
    | undefined;
  const holder = rol === "mandante" || rol === "delegado";
  let qrSvg: string | null = null;
  let segundos = 30;
  let codigo: string | null = null;
  if (holder && deal.status === "cerrado" && assignment && hand?.status === "pendiente") {
    try {
      const issued = await emitirQr(loadId, now);
      qrSvg = issued.svg;
      segundos = issued.segundos;
      codigo = issued.codigo;
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "qr_sin_clave") throw error;
    }
  }
  return {
    loadId,
    rol,
    estado: deal.status,
    folio: deal.folio,
    origen: load.origin,
    destino: load.destination,
    retiro: formatDateCL(load.pickup_date),
    qrSvg,
    segundos,
    codigo,
    chofer: assignment
      ? {
          nombre: nombreCorto(assignment.nombre),
          empresa: assignment.empresa,
          patente: formatPatente(assignment.patente),
          iniciales: iniciales(assignment.nombre),
          foto: Boolean(assignment.photoPath),
        }
      : null,
    esperandoConfirmacion: hand?.status === "escaneado",
    retiroValidado: retiroValidado(loadId),
    puedeConfirmarTrato: rol === "transportista" && deal.status === "pendiente_confirmacion",
    puedeAsignar: rol === "transportista" && deal.status === "cerrado" && !assignment && hand?.status !== "confirmado",
    puedeReasignar:
      rol === "transportista" && deal.status === "cerrado" && Boolean(assignment) && (hand?.status === "pendiente" || hand?.status === "rechazado"),
    puedeEscanear: rol === "transportista" && Boolean(assignment) && load.trip_status === "en_camino" && hand?.status === "pendiente",
    delegadoHabilitado: holder && delegateLinkEnabled() && deal.status === "cerrado",
    camiones: rol === "transportista" ? camionesDe(user!.id) : [],
    viaje: load.trip_status,
  };
}

export function comprobantesDe(userId: string) {
  if (!qrFase1Enabled()) return [];
  return getDb()
    .prepare(
      `SELECT d.load_id AS loadId, d.folio, d.status, l.origin, l.destination
       FROM trip_deals d JOIN loads l ON l.id = d.load_id
       WHERE l.owner_id = ? ORDER BY d.created_at DESC`,
    )
    .all(userId) as { loadId: string; folio: string | null; status: string; origin: string; destination: string }[];
}
