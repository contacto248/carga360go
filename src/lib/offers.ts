import { assertAccredited, isAccredited } from "./accreditation";
import { stripContacts } from "./contact-filter";
import { randomUUID } from "crypto";
import { audit } from "./audit";
import { equipmentById } from "./catalog";
import { getDb } from "./db";
import { AppError } from "./errors";
import { formatClp, formatDateCL, todayChile } from "./format";
import { appUrl } from "./mail";
import { sendEmail } from "./notify";
import { cleanClp } from "./security";
import { getSettings } from "./settings";
import { assertNotManualReadonly } from "./manual-readonly";
import { dealMailLines, insertPendingDeal } from "./qr/deal";
import { qrFase1Enabled } from "./qr/flag";
import type { PublicUser } from "./types";

/**
 * Fase 1 del flujo tipo inDrive: el mandante publica una solicitud (carga), los transportistas APROBADOS
 * envían una oferta (precio, fecha de retiro, camión y comentario) y el mandante elige una.
 */
export type OfferStatus = "activa" | "aceptada" | "rechazada" | "retirada";

export type Offer = {
  id: string;
  loadId: string;
  carrierId: string;
  carrierName: string;
  carrierContact: string;
  carrierWhatsapp: string;
  carrierEmail: string;
  carrierVerified: boolean;
  carrierCity: string;
  truckId: string | null;
  truckLabel: string | null;
  priceClp: number;
  pickupDate: string;
  note: string | null;
  status: OfferStatus;
  revisions: number;
  createdAt: string;
  updatedAt: string;
};

export type OfferWithLoad = Offer & {
  loadRoute: string;
  loadStatus: string;
  loadOwnerName: string;
};

type OfferRow = {
  id: string;
  load_id: string;
  carrier_id: string;
  truck_id: string | null;
  price_clp: number;
  pickup_date: string;
  note: string | null;
  status: OfferStatus;
  revisions: number;
  created_at: string;
  updated_at: string;
  carrier_name: string;
  carrier_contact: string;
  carrier_whatsapp: string;
  carrier_email: string;
  carrier_status: string;
  carrier_city: string;
  truck_equipment: string | null;
  truck_origin: string | null;
  truck_destination: string | null;
  truck_tonnage: number | null;
  load_origin?: string;
  load_destination?: string;
  load_status?: string;
  load_owner_name?: string;
};

type LoadState = {
  id: string;
  owner_id: string;
  origin: string;
  destination: string;
  equipment: string;
  weight_t: number;
  pickup_date: string;
  status: string | null;
  offers_until: string | null;
  allow_improve: number | null;
  awarded_offer_id: string | null;
  is_demo: number;
};

const OFFER_SELECT = `
  SELECT o.*, u.razon_social AS carrier_name, u.contact_name AS carrier_contact, u.whatsapp AS carrier_whatsapp,
    u.email AS carrier_email, u.verification_status AS carrier_status, u.city AS carrier_city,
    t.equipment AS truck_equipment, t.origin AS truck_origin, t.destination AS truck_destination, t.tonnage AS truck_tonnage,
    l.origin AS load_origin, l.destination AS load_destination, l.status AS load_status, ow.razon_social AS load_owner_name
  FROM offers o
  JOIN users u ON u.id = o.carrier_id
  JOIN loads l ON l.id = o.load_id
  JOIN users ow ON ow.id = l.owner_id
  LEFT JOIN trucks t ON t.id = o.truck_id
`;

function mapOffer(row: OfferRow): OfferWithLoad {
  return {
    id: row.id,
    loadId: row.load_id,
    carrierId: row.carrier_id,
    carrierName: row.carrier_name,
    carrierContact: row.carrier_contact,
    carrierWhatsapp: row.carrier_whatsapp,
    carrierEmail: row.carrier_email,
    carrierVerified: row.carrier_status === "verificado",
    carrierCity: row.carrier_city,
    truckId: row.truck_id,
    truckLabel: row.truck_equipment
      ? `${equipmentById(row.truck_equipment).label} ${row.truck_tonnage ?? ""} t (${row.truck_origin} → ${row.truck_destination})`
      : null,
    priceClp: row.price_clp,
    pickupDate: row.pickup_date,
    note: row.note,
    status: row.status,
    revisions: row.revisions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    loadRoute: `${row.load_origin ?? ""} → ${row.load_destination ?? ""}`,
    loadStatus: row.load_status ?? "abierta",
    loadOwnerName: row.load_owner_name ?? "",
  };
}

function loadState(loadId: string): LoadState {
  const row = getDb()
    .prepare(
      `SELECT id, owner_id, origin, destination, equipment, weight_t, pickup_date, status, offers_until, allow_improve, awarded_offer_id, is_demo
       FROM loads WHERE id = ?`,
    )
    .get(loadId) as LoadState | undefined;
  if (!row) throw new AppError("Carga no encontrada.", 404);
  return row;
}

export function effectiveAllowImprove(load: { allow_improve: number | null } | { allowImprove: boolean | null }): boolean {
  const value = "allow_improve" in load ? (load.allow_improve === null ? null : load.allow_improve === 1) : load.allowImprove;
  return value ?? getSettings().allowImprove;
}

export function offersOpen(load: { status: string | null; offersUntil?: string | null; offers_until?: string | null }, now = new Date()): boolean {
  const until = load.offersUntil ?? load.offers_until ?? null;
  if ((load.status ?? "abierta") !== "abierta") return false;
  return !until || until > now.toISOString();
}

/** Puede ofertar: transportista aprobado por el administrador (documentos y cédula) y con correo confirmado. */
export function canOffer(user: PublicUser | null | undefined): boolean {
  return Boolean(user && user.role === "transportista" && user.verificationStatus === "verificado" && user.emailVerifiedAt && isAccredited(user));
}

export function assertCanOffer(user: PublicUser | null | undefined): asserts user is PublicUser {
  if (!user) throw new AppError("Ingresa con tu cuenta de transportista para ofertar.", 401);
  if (user.role !== "transportista") throw new AppError("Solo los transportistas pueden ofertar.", 403);
  // Verificación manual (solo lectura 30 días): puede ver la carga, pero no ofertar ni tomarla.
  assertNotManualReadonly(user, "ofertar o tomar cargas");
  if (user.verificationStatus !== "verificado") {
    throw new AppError("Tu cuenta debe estar aprobada (documentos y cédula) para ofertar.", 403, "no_aprobado");
  }
  if (!user.emailVerifiedAt) throw new AppError("Confirma tu correo antes de ofertar.", 403, "correo_sin_verificar");
  assertAccredited(user, "ofertar");
}

export type OfferInput = { priceClp: unknown; pickupDate: unknown; truckId?: unknown; note?: unknown };

function cleanOffer(input: OfferInput, carrierId: string) {
  const priceClp = cleanClp(input.priceClp, "El precio de tu oferta", true) as number;
  const pickupDate = String(input.pickupDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) throw new AppError("Indica una fecha de retiro válida.");
  if (pickupDate < todayChile()) throw new AppError("La fecha de retiro no puede ser anterior a hoy.");
  const note = input.note == null ? null : String(input.note).trim().slice(0, 600) || null;
  let truckId: string | null = null;
  if (input.truckId) {
    truckId = String(input.truckId);
    const truck = getDb().prepare(`SELECT owner_id FROM trucks WHERE id = ?`).get(truckId) as { owner_id: string } | undefined;
    if (!truck || truck.owner_id !== carrierId) throw new AppError("Elige uno de tus camiones publicados.");
  }
  return { priceClp, pickupDate, note, truckId };
}

function getOfferRow(id: string): OfferWithLoad | null {
  const row = getDb().prepare(`${OFFER_SELECT} WHERE o.id = ?`).get(id) as OfferRow | undefined;
  return row ? mapOffer(row) : null;
}

export function getOffer(id: string): OfferWithLoad | null {
  return getOfferRow(id);
}

export function listOffersForLoad(loadId: string): OfferWithLoad[] {
  const rows = getDb()
    .prepare(`${OFFER_SELECT} WHERE o.load_id = ? ORDER BY CASE o.status WHEN 'aceptada' THEN 0 WHEN 'activa' THEN 1 ELSE 2 END, o.price_clp ASC, o.updated_at ASC`)
    .all(loadId) as OfferRow[];
  return rows.map(mapOffer);
}

export function myOfferForLoad(loadId: string, carrierId: string): OfferWithLoad | null {
  const row = getDb().prepare(`${OFFER_SELECT} WHERE o.load_id = ? AND o.carrier_id = ?`).get(loadId, carrierId) as OfferRow | undefined;
  return row ? mapOffer(row) : null;
}

export function listOffersByCarrier(carrierId: string): OfferWithLoad[] {
  const rows = getDb().prepare(`${OFFER_SELECT} WHERE o.carrier_id = ? ORDER BY o.updated_at DESC LIMIT 200`).all(carrierId) as OfferRow[];
  return rows.map(mapOffer);
}

export function listAllOffers(limit = 300): OfferWithLoad[] {
  const rows = getDb().prepare(`${OFFER_SELECT} ORDER BY o.updated_at DESC LIMIT ?`).all(limit) as OfferRow[];
  return rows.map(mapOffer);
}

/** Lo que ve cada persona: el dueño y el admin ven todas; un transportista solo la suya. */
export function offersVisibleTo(loadId: string, viewer: PublicUser | null): OfferWithLoad[] {
  if (!viewer) return [];
  const load = loadState(loadId);
  if (viewer.role === "admin") return listOffersForLoad(loadId);
  // El mandante ve el contacto del transportista solo cuando elige su oferta.
  if (viewer.id === load.owner_id) {
    return listOffersForLoad(loadId).map((offer) =>
      offer.status === "aceptada" ? offer : { ...offer, carrierWhatsapp: "", carrierEmail: "", carrierContact: "", note: offer.note ? stripContacts(offer.note) : offer.note },
    );
  }
  const mine = myOfferForLoad(loadId, viewer.id);
  return mine ? [mine] : [];
}

function routeText(load: LoadState) {
  return `${load.origin} → ${load.destination} (${equipmentById(load.equipment).label}, ${load.weight_t} t, retiro ${formatDateCL(load.pickup_date)})`;
}

function ownerOf(load: LoadState) {
  return getDb().prepare(`SELECT id, email, contact_name, razon_social, whatsapp FROM users WHERE id = ?`).get(load.owner_id) as
    | { id: string; email: string; contact_name: string; razon_social: string; whatsapp: string }
    | undefined;
}

function background(task: () => Promise<unknown>) {
  task().catch((error) => console.error("[carga360go] Error enviando aviso de oferta", error));
}

/** Crea la oferta o, si ya existe y la carga lo permite, la mejora (precio menor o igual, nueva fecha o comentario). */
export async function submitOffer(user: PublicUser | null, loadId: string, input: OfferInput, opts: { notify?: boolean } = {}) {
  assertCanOffer(user);
  const load = loadState(loadId);
  if (load.owner_id === user.id) throw new AppError("No puedes ofertar en tu propia carga.");
  if (!offersOpen(load)) {
    throw new AppError(load.status === "adjudicada" ? "Esta carga ya fue adjudicada." : "El plazo para ofertar en esta carga terminó.", 409, "cerrada");
  }
  if (load.is_demo) throw new AppError("Esta carga es de demostración y no recibe ofertas.");
  const data = cleanOffer(input, user.id);
  const db = getDb();
  const stamp = new Date().toISOString();
  const existing = db.prepare(`SELECT id, status, price_clp FROM offers WHERE load_id = ? AND carrier_id = ?`).get(loadId, user.id) as
    | { id: string; status: OfferStatus; price_clp: number }
    | undefined;
  let offerId: string;
  let improved = false;
  if (existing && existing.status === "activa") {
    if (!effectiveAllowImprove(load)) throw new AppError("En esta carga no se pueden modificar las ofertas. Tu oferta ya fue enviada.", 409, "sin_mejora");
    if (data.priceClp > existing.price_clp) throw new AppError(`Para mejorar tu oferta el precio debe ser igual o menor a $${formatClp(existing.price_clp)}.`);
    db.prepare(`UPDATE offers SET price_clp = ?, pickup_date = ?, note = ?, truck_id = ?, revisions = revisions + 1, updated_at = ? WHERE id = ?`).run(
      data.priceClp,
      data.pickupDate,
      data.note,
      data.truckId,
      stamp,
      existing.id,
    );
    offerId = existing.id;
    improved = true;
  } else if (existing && existing.status === "retirada") {
    db.prepare(`UPDATE offers SET price_clp = ?, pickup_date = ?, note = ?, truck_id = ?, status = 'activa', updated_at = ? WHERE id = ?`).run(
      data.priceClp,
      data.pickupDate,
      data.note,
      data.truckId,
      stamp,
      existing.id,
    );
    offerId = existing.id;
  } else if (existing) {
    throw new AppError("Tu oferta en esta carga ya fue resuelta.", 409);
  } else {
    offerId = randomUUID();
    db.prepare(
      `INSERT INTO offers (id, load_id, carrier_id, truck_id, price_clp, pickup_date, note, status, revisions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'activa', 0, ?, ?)`,
    ).run(offerId, loadId, user.id, data.truckId, data.priceClp, data.pickupDate, data.note, stamp, stamp);
  }
  audit(user, improved ? "oferta.mejorada" : "oferta.creada", { type: "carga", id: loadId }, { offerId, priceClp: data.priceClp });
  const owner = ownerOf(load);
  const send = async () => {
    if (!owner) return;
    await sendEmail(
      owner.email,
      improved ? `Oferta mejorada en tu carga ${load.origin} → ${load.destination}` : `Nueva oferta en tu carga ${load.origin} → ${load.destination}`,
      [
        `Hola ${owner.contact_name},`,
        "",
        `${user.razonSocial} (transportista verificado) ${improved ? "mejoró su oferta" : "ofertó"} para tu carga ${routeText(load)}:`,
        `Precio: $${formatClp(data.priceClp)} CLP · Retiro: ${formatDateCL(data.pickupDate)}`,
        data.note ? `Comentario: ${stripContacts(data.note)}` : "",
        "",
        `Revisa y compara las ofertas, y elige la que prefieras: ${appUrl()}/cargas/${loadId}#ofertas`,
        "",
        "Carga360go — el costo de referencia desglosado del flete, calculado de forma automática, con trazabilidad de cada viaje.",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );
  };
  if (opts.notify === false) await Promise.resolve();
  else background(send);
  const offer = getOfferRow(offerId);
  if (!offer) throw new AppError("No se pudo guardar la oferta.", 500);
  return { offer, improved };
}

export function withdrawOffer(user: PublicUser, offerId: string) {
  const offer = getOfferRow(offerId);
  if (!offer || offer.carrierId !== user.id) throw new AppError("Oferta no encontrada.", 404);
  if (offer.status !== "activa") throw new AppError("Esta oferta ya no se puede retirar.", 409);
  getDb().prepare(`UPDATE offers SET status = 'retirada', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), offerId);
  audit(user, "oferta.retirada", { type: "oferta", id: offerId });
  return getOfferRow(offerId);
}

/** El mandante (o un admin) elige una oferta: la carga queda adjudicada y las demás se cierran. */
export async function acceptOffer(user: PublicUser, offerId: string, opts: { notify?: boolean } = {}) {
  const offer = getOfferRow(offerId);
  if (!offer) throw new AppError("Oferta no encontrada.", 404);
  const load = loadState(offer.loadId);
  if (load.owner_id !== user.id && user.role !== "admin") throw new AppError("Solo quien publicó la carga puede elegir una oferta.", 403);
  if (user.role !== "admin") assertNotManualReadonly(user, "adjudicar cargas");
  if ((load.status ?? "abierta") !== "abierta") throw new AppError("Esta carga ya fue adjudicada o cerrada.", 409);
  if (offer.status !== "activa") throw new AppError("Esa oferta ya no está activa.", 409);
  const db = getDb();
  const stamp = new Date().toISOString();
  const losers = listOffersForLoad(load.id).filter((item) => item.id !== offerId && item.status === "activa");
  const qrOn = qrFase1Enabled();
  let confirmCode: string | null = null;
  const apply = db.transaction(() => {
    const changed = db
      .prepare(`UPDATE loads SET status = 'adjudicada', awarded_offer_id = ?, trip_status = 'asignado', updated_at = ? WHERE id = ? AND COALESCE(status, 'abierta') = 'abierta'`)
      .run(offerId, stamp, load.id);
    db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, 'asignado', NULL, ?)`).run(randomUUID(), load.id, user.id, stamp);
    if (changed.changes !== 1) throw new AppError("Esta carga ya fue adjudicada.", 409);
    db.prepare(`UPDATE offers SET status = 'aceptada', updated_at = ? WHERE id = ?`).run(stamp, offerId);
    db.prepare(`UPDATE offers SET status = 'rechazada', updated_at = ? WHERE load_id = ? AND id <> ? AND status = 'activa'`).run(stamp, load.id, offerId);
    confirmCode = insertPendingDeal(load.id, offerId, user.id, stamp)?.code ?? null;
  });
  apply();
  audit(user, "oferta.aceptada", { type: "carga", id: load.id }, { offerId, carrier: offer.carrierName, priceClp: offer.priceClp });
  const owner = ownerOf(load);
  const lines = qrOn ? dealMailLines(load.id, confirmCode) : null;
  const send = async () => {
    if (owner) {
      await sendEmail(
        offer.carrierEmail,
        `¡Tu oferta fue aceptada! ${load.origin} → ${load.destination}`,
        [
          `Hola ${offer.carrierContact},`,
          "",
          `${owner.razon_social} aceptó tu oferta de $${formatClp(offer.priceClp)} CLP para la carga ${routeText(load)}.`,
          "",
          `Contacto del mandante: ${owner.contact_name} · WhatsApp +${owner.whatsapp} · ${owner.email}`,
          `Detalle: ${appUrl()}/cargas/${load.id}`,
          "",
          lines ? lines.carrier : "Coordinen el retiro directamente.",
        ].join("\n"),
      );
      await sendEmail(
        owner.email,
        `Adjudicaste tu carga ${load.origin} → ${load.destination}`,
        [
          `Hola ${owner.contact_name},`,
          "",
          `Elegiste la oferta de ${offer.carrierName} por $${formatClp(offer.priceClp)} CLP (retiro ${formatDateCL(offer.pickupDate)}).`,
          `Contacto del transportista: ${offer.carrierContact} · WhatsApp +${offer.carrierWhatsapp} · ${offer.carrierEmail}`,
          `Detalle: ${appUrl()}/cargas/${load.id}`,
          ...(lines ? [lines.owner] : []),
          "",
          "Carga360go",
        ].join("\n"),
      );
    }
    for (const loser of losers) {
      await sendEmail(
        loser.carrierEmail,
        `La carga ${load.origin} → ${load.destination} fue adjudicada`,
        [
          `Hola ${loser.carrierContact},`,
          "",
          `El mandante eligió otra oferta para la carga ${routeText(load)}. Gracias por ofertar.`,
          `Busca más cargas disponibles: ${appUrl()}/cargas`,
          "",
          "Carga360go",
        ].join("\n"),
      );
    }
  };
  if (opts.notify === false) await Promise.resolve();
  else background(send);
  return getOfferRow(offerId);
}

/** El mandante deja de recibir ofertas sin elegir ninguna (por ejemplo, si resolvió el transporte por otro medio). */
export function closeLoad(user: PublicUser, loadId: string) {
  const load = loadState(loadId);
  if (load.owner_id !== user.id && user.role !== "admin") throw new AppError("Solo quien publicó la carga puede cerrarla.", 403);
  if ((load.status ?? "abierta") !== "abierta") throw new AppError("La carga ya está cerrada.", 409);
  const stamp = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare(`UPDATE loads SET status = 'cerrada', updated_at = ? WHERE id = ?`).run(stamp, loadId);
    db.prepare(`UPDATE offers SET status = 'rechazada', updated_at = ? WHERE load_id = ? AND status = 'activa'`).run(stamp, loadId);
  })();
  audit(user, "carga.cerrada", { type: "carga", id: loadId });
}

/** Al adjudicar se libera el contacto: el transportista ganador ve el del mandante y viceversa. */
export function awardedContact(loadId: string, viewer: PublicUser | null) {
  if (!viewer) return null;
  const load = loadState(loadId);
  if (load.status !== "adjudicada" || !load.awarded_offer_id) return null;
  const offer = getOfferRow(load.awarded_offer_id);
  if (!offer) return null;
  if (viewer.id === offer.carrierId || viewer.role === "admin") {
    const owner = ownerOf(load);
    return owner ? { name: owner.razon_social, contact: owner.contact_name, whatsapp: owner.whatsapp, email: owner.email } : null;
  }
  return null;
}
