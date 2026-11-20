import { randomUUID } from "crypto";
import { cityByName, equipmentById, isEquipmentId, isKnownCity } from "./catalog";
import { getDb } from "./db";
import { AppError } from "./errors";
import { todayChile } from "./format";
import { publicVerifiedSeal } from "./public-trust";
import { offersOpen } from "./offers";
import { matchLoadsForTruck, matchTrucksForLoad } from "./match";
import { canPublishLoad, canPublishTruck } from "./roles";
import { cleanClp, normalizePatente } from "./security";
import { getSettings } from "./settings";
import { assertNotManualReadonly } from "./manual-readonly";
import type {
  LoadFilters,
  LoadListItem,
  LoadPublic,
  PublicUser,
  Specs,
  TruckFilters,
  TruckListItem,
  TruckPublic,
  VerificationStatus,
} from "./types";

type LoadRow = {
  id: string;
  owner_id: string;
  origin: string;
  destination: string;
  pickup_date: string;
  equipment: string;
  description: string;
  weight_t: number;
  specs_json: string;
  budget_clp: number | null;
  notes: string | null;
  solo_verificados: number;
  inmediata: number;
  trip_status: string | null;
  is_demo: number;
  status: string | null;
  offers_until: string | null;
  allow_improve: number | null;
  awarded_offer_id: string | null;
  offer_count: number | null;
  created_at: string;
  updated_at: string;
  owner_name: string;
  whatsapp: string;
  owner_verification: VerificationStatus;
  owner_docs_ok: number;
};

type TruckRow = {
  id: string;
  owner_id: string;
  origin: string;
  destination: string;
  available_from: string;
  available_to: string;
  equipment: string;
  tonnage: number;
  specs_json: string;
  notes: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
  owner_name: string;
  whatsapp: string;
  owner_verification: VerificationStatus;
  owner_docs_ok: number;
};

const LOAD_SELECT = `
  SELECT l.*, u.razon_social AS owner_name, u.whatsapp, u.verification_status AS owner_verification,
    (SELECT CASE WHEN COUNT(*) > 0 AND SUM(CASE WHEN d.expiry < date('now') THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END
     FROM documents d WHERE d.user_id = u.id AND d.verification_status = 'verificado') AS owner_docs_ok,
    (SELECT COUNT(*) FROM offers o WHERE o.load_id = l.id AND o.status IN ('activa', 'aceptada')) AS offer_count
  FROM loads l JOIN users u ON u.id = l.owner_id
`;
const TRUCK_SELECT = `
  SELECT t.*, u.razon_social AS owner_name, u.whatsapp, u.verification_status AS owner_verification,
    (SELECT CASE WHEN COUNT(*) > 0 AND SUM(CASE WHEN d.expiry < date('now') THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END
     FROM documents d WHERE d.user_id = u.id AND d.verification_status = 'verificado') AS owner_docs_ok
  FROM trucks t JOIN users u ON u.id = t.owner_id
`;

function parseSpecs(raw: string): Specs {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Specs;
  } catch {
    return {};
  }
}

function mapLoad(row: LoadRow): LoadPublic {
  if (!isEquipmentId(row.equipment)) throw new AppError("Equipo desconocido en la base.", 500);
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerVerification: row.owner_verification,
    ownerDocsOk: row.owner_docs_ok === 1,
    whatsapp: row.whatsapp,
    origin: row.origin,
    destination: row.destination,
    pickupDate: row.pickup_date,
    equipment: row.equipment,
    description: row.description,
    weightT: row.weight_t,
    specs: parseSpecs(row.specs_json),
    budgetClp: row.budget_clp,
    notes: row.notes,
    soloVerificados: row.solo_verificados === 1,
    inmediata: row.inmediata === 1,
    tripStatus: row.trip_status === "asignado" || row.trip_status === "en_camino" || row.trip_status === "retirado" || row.trip_status === "en_transito" || row.trip_status === "incidencia" || row.trip_status === "entregado" ? row.trip_status : null,
    isDemo: row.is_demo === 1,
    status: row.status === "adjudicada" || row.status === "cerrada" ? row.status : "abierta",
    offersUntil: row.offers_until,
    allowImprove: row.allow_improve === null || row.allow_improve === undefined ? null : row.allow_improve === 1,
    awardedOfferId: row.awarded_offer_id,
    offerCount: row.offer_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTruck(row: TruckRow): TruckPublic {
  if (!isEquipmentId(row.equipment)) throw new AppError("Equipo desconocido en la base.", 500);
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerVerification: row.owner_verification,
    ownerDocsOk: row.owner_docs_ok === 1,
    whatsapp: row.whatsapp,
    origin: row.origin,
    destination: row.destination,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    equipment: row.equipment,
    tonnage: row.tonnage,
    specs: parseSpecs(row.specs_json),
    notes: row.notes,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertRoute(origin: string, destination: string) {
  if (!isKnownCity(origin) || !isKnownCity(destination)) throw new AppError("Elige origen y destino de la lista.");
  if (origin === destination) throw new AppError("El origen y el destino no pueden ser iguales.");
}

function assertDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(`${label} no es una fecha válida.`);
}

function cleanSpecs(equipment: string, side: "load" | "truck", input: Specs): Specs {
  const def = equipmentById(equipment);
  if (def.id !== equipment) throw new AppError("Elige un tipo de equipo.");
  const fields = side === "load" ? def.loadFields : def.truckFields;
  const clean: Specs = {};
  for (const field of fields) {
    const value = input[field.key];
    if (value === undefined || value === "" || value === false) {
      if (field.required) throw new AppError(`Falta: ${field.label}`);
      continue;
    }
    if (field.kind === "bool") {
      if (value === true) clean[field.key] = true;
      continue;
    }
    if (field.kind === "number") {
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(parsed)) throw new AppError(`Revisa el campo ${field.label}.`);
      const temp = field.key.startsWith("temp");
      if (!temp && parsed < 0) throw new AppError(`${field.label} no puede ser negativo.`);
      if (temp && (parsed < -80 || parsed > 60)) throw new AppError(`${field.label} está fuera de rango.`);
      if (field.key === "clase" && (parsed < 1 || parsed > 9 || !Number.isInteger(parsed))) {
        throw new AppError("La clase de peligro debe ser un número del 1 al 9.");
      }
      clean[field.key] = parsed;
      continue;
    }
    const text = String(value).trim();
    if (!text) {
      if (field.required) throw new AppError(`Falta: ${field.label}`);
      continue;
    }
    if (text.length > 200) throw new AppError(`${field.label} es demasiado largo.`);
    if (field.kind === "select" && field.options && !field.options.includes(text)) {
      throw new AppError(`Opción no válida en ${field.label}.`);
    }
    clean[field.key] = text;
  }
  if (equipment === "refrigerado" && side === "truck") {
    const min = Number(clean.tempMin);
    const max = Number(clean.tempMax);
    if (min > max) throw new AppError("La temperatura mínima no puede ser mayor que la máxima.");
  }
  return clean;
}

export type LoadInput = {
  origin: string;
  destination: string;
  pickupDate: string;
  equipment: string;
  description: string;
  weightT: number;
  specs: Specs;
  budgetClp?: number | null;
  notes?: string | null;
  soloVerificados?: boolean;
  inmediata?: boolean;
  /** Plazo para ofertar en horas (si no viene, se usa el valor por defecto del administrador). */
  offerHours?: number | null;
  /** Si los transportistas pueden mejorar su oferta (null = valor por defecto del administrador). */
  allowImprove?: boolean | null;
};

export type TruckInput = {
  origin: string;
  destination: string;
  availableFrom: string;
  availableTo: string;
  equipment: string;
  tonnage: number;
  specs: Specs;
  notes?: string | null;
  patente?: string | null;
};

function patenteInput(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const patente = normalizePatente(value);
  if (!patente) throw new AppError("La patente no tiene formato chileno (ej: BBCD12 o AB1234).");
  return patente;
}

function normalizeLoad(input: LoadInput) {
  assertRoute(input.origin, input.destination);
  assertDate(input.pickupDate, "La fecha de retiro");
  if (input.pickupDate < todayChile()) throw new AppError("La fecha de retiro no puede ser anterior a hoy.");
  if (input.pickupDate > maxFutureDate()) throw new AppError("La fecha de retiro no puede ser a más de un año.");
  if (!isEquipmentId(input.equipment)) throw new AppError("Elige un tipo de equipo.");
  const description = input.description.trim();
  if (description.length < 3 || description.length > 500) throw new AppError("Describe la carga.");
  const weightT = Number(input.weightT);
  if (!Number.isFinite(weightT) || weightT <= 0 || weightT > 500) {
    throw new AppError("Indica el peso de la carga en toneladas.");
  }
  const budgetClp = input.budgetClp === 0 ? null : cleanClp(input.budgetClp, "El precio ofrecido", false);
  let offerHours: number | null = null;
  if (input.offerHours !== undefined && input.offerHours !== null) {
    const hours = Number(input.offerHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new AppError("El plazo para recibir ofertas debe ser de 1 a 720 horas.");
    offerHours = hours;
  }
  const allowImprove = typeof input.allowImprove === "boolean" ? input.allowImprove : null;
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 2000) throw new AppError("Las observaciones son demasiado largas.");
  return {
    origin: input.origin,
    destination: input.destination,
    pickupDate: input.pickupDate,
    equipment: input.equipment,
    description,
    weightT,
    specs: cleanSpecs(input.equipment, "load", input.specs || {}),
    budgetClp,
    notes,
    soloVerificados: input.soloVerificados === true,
    inmediata: input.inmediata === true,
    offerHours,
    allowImprove,
  };
}

function maxFutureDate(): string {
  const [year, month, day] = todayChile().split("-");
  return `${Number(year) + 1}-${month}-${day}`;
}

function offersUntilFrom(hours: number | null): string {
  const value = hours ?? getSettings().offerHours;
  return new Date(Date.now() + value * 3600_000).toISOString();
}

function normalizeTruck(input: TruckInput) {
  assertRoute(input.origin, input.destination);
  assertDate(input.availableFrom, "La fecha inicial");
  assertDate(input.availableTo, "La fecha final");
  if (input.availableTo < input.availableFrom) {
    throw new AppError("La fecha final no puede ser anterior a la inicial.");
  }
  if (input.availableFrom < todayChile()) throw new AppError("La disponibilidad no puede empezar antes de hoy.");
  if (!isEquipmentId(input.equipment)) throw new AppError("Elige un tipo de equipo.");
  const tonnage = Number(input.tonnage);
  if (!Number.isFinite(tonnage) || tonnage <= 0 || tonnage > 500) {
    throw new AppError("Indica la capacidad en toneladas.");
  }
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 2000) throw new AppError("Las observaciones son demasiado largas.");
  return {
    origin: input.origin,
    destination: input.destination,
    availableFrom: input.availableFrom,
    availableTo: input.availableTo,
    equipment: input.equipment,
    tonnage,
    specs: cleanSpecs(input.equipment, "truck", input.specs || {}),
    notes,
  };
}

function allLoads(): LoadPublic[] {
  const rows = getDb().prepare(`${LOAD_SELECT} ORDER BY l.created_at DESC`).all() as LoadRow[];
  return rows.map(mapLoad);
}

function allTrucks(): TruckPublic[] {
  const rows = getDb().prepare(`${TRUCK_SELECT} ORDER BY t.created_at DESC`).all() as TruckRow[];
  return rows.map(mapTruck);
}

function carrierFitsLoad(load: LoadPublic, truck: TruckPublic): boolean {
  if (truck.ownerId === load.ownerId) return false;
  // Misma regla que el sello público: verificado + documentos al día (T-008 residual).
  if (load.soloVerificados && !publicVerifiedSeal(truck.ownerVerification, truck.ownerDocsOk)) return false;
  return true;
}

function withLoadMatches(loads: LoadPublic[], trucks: TruckPublic[]): LoadListItem[] {
  return loads.map((load) => ({
    ...load,
    matches: matchTrucksForLoad(
      load,
      trucks.filter((truck) => carrierFitsLoad(load, truck)),
    ).map(({ truck, match }) => ({
      ...match,
      truck: {
        id: truck.id,
        origin: truck.origin,
        destination: truck.destination,
        tonnage: truck.tonnage,
        availableFrom: truck.availableFrom,
        availableTo: truck.availableTo,
        ownerName: truck.ownerName,
        whatsapp: truck.whatsapp,
        isDemo: truck.isDemo,
        equipment: truck.equipment,
        ownerVerification: truck.ownerVerification,
      },
    })),
  }));
}

function withTruckMatches(trucks: TruckPublic[], loads: LoadPublic[]): TruckListItem[] {
  return trucks.map((truck) => ({
    ...truck,
    matches: matchLoadsForTruck(
      truck,
      loads.filter((load) => carrierFitsLoad(load, truck)),
    ).map(({ load, match }) => ({
      ...match,
      load: {
        id: load.id,
        origin: load.origin,
        destination: load.destination,
        weightT: load.weightT,
        pickupDate: load.pickupDate,
        description: load.description,
        ownerName: load.ownerName,
        whatsapp: load.whatsapp,
        isDemo: load.isDemo,
        equipment: load.equipment,
        soloVerificados: load.soloVerificados,
      },
    })),
  }));
}

/** El filtro de equipo acepta uno o varios ids separados por coma ("sider,furgon_seco"). */
export function equipmentList(value: string | undefined): string[] {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

/** Listado público y portada: abierta, con plazo de ofertas vigente y fecha de retiro no vencida. */
export function isLoadListedPublicly(
  load: Pick<LoadPublic, "status" | "offersUntil" | "pickupDate">,
  now = new Date(),
  today = todayChile(),
): boolean {
  if (load.status !== "abierta") return false;
  if (load.pickupDate < today) return false;
  return offersOpen(load, now);
}

export function loadPassesFilters(load: LoadPublic, filters: LoadFilters): boolean {
  const equipos = equipmentList(filters.equipo);
  if (equipos.length && !equipos.includes(load.equipment)) return false;
  if (filters.regionOrigen && cityByName(load.origin)?.regionId !== filters.regionOrigen) return false;
  if (filters.regionDestino && cityByName(load.destination)?.regionId !== filters.regionDestino) return false;
  if (filters.origen && load.origin !== filters.origen) return false;
  if (filters.destino && load.destination !== filters.destino) return false;
  if (filters.desde && load.pickupDate < filters.desde) return false;
  if (filters.pesoMin && load.weightT < Number(filters.pesoMin)) return false;
  if (filters.verificados === "1" && !publicVerifiedSeal(load.ownerVerification, load.ownerDocsOk)) return false;
  if (filters.inmediata === "1" && !load.inmediata) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const hay = `${load.description} ${load.ownerName}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function truckPassesFilters(truck: TruckPublic, filters: TruckFilters): boolean {
  const equipos = equipmentList(filters.equipo);
  if (equipos.length && !equipos.includes(truck.equipment)) return false;
  if (filters.regionOrigen && cityByName(truck.origin)?.regionId !== filters.regionOrigen) return false;
  if (filters.regionDestino && cityByName(truck.destination)?.regionId !== filters.regionDestino) return false;
  if (filters.origen && truck.origin !== filters.origen) return false;
  if (filters.destino && truck.destination !== filters.destino) return false;
  if (filters.dia && (truck.availableFrom > filters.dia || truck.availableTo < filters.dia)) return false;
  if (filters.capacidadMin && truck.tonnage < Number(filters.capacidadMin)) return false;
  if (filters.verificados === "1" && !publicVerifiedSeal(truck.ownerVerification, truck.ownerDocsOk)) return false;
  return true;
}

function sortItems<T extends { createdAt: string; matches: unknown[] }>(items: T[], orden: string | undefined, dateOf: (item: T) => string): T[] {
  const copy = [...items];
  if (orden === "fecha") copy.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  else if (orden === "compatibles") copy.sort((a, b) => b.matches.length - a.matches.length || b.createdAt.localeCompare(a.createdAt));
  return copy;
}

export function listLoads(filters: LoadFilters = {}): LoadListItem[] {
  // Las solicitudes ya adjudicadas o cerradas salen del listado público (siguen visibles en el panel y por enlace).
  const loads = allLoads().filter((load) => isLoadListedPublicly(load) && loadPassesFilters(load, filters));
  return sortItems(withLoadMatches(loads, allTrucks()), filters.orden, (load) => load.pickupDate);
}

export function listTrucks(filters: TruckFilters = {}): TruckListItem[] {
  const trucks = allTrucks().filter((truck) => truckPassesFilters(truck, filters));
  // El listado público solo empareja con cargas abiertas (las adjudicadas o cerradas no se revelan aquí).
  const openLoads = allLoads().filter((load) => isLoadListedPublicly(load));
  return sortItems(withTruckMatches(trucks, openLoads), filters.orden, (truck) => truck.availableFrom);
}

/** Todas las publicaciones (para estadísticas y alertas). */
export function allListings(): { loads: LoadPublic[]; trucks: TruckPublic[] } {
  return { loads: allLoads(), trucks: allTrucks() };
}

export function getLoad(id: string): LoadListItem | null {
  const row = getDb().prepare(`${LOAD_SELECT} WHERE l.id = ?`).get(id) as LoadRow | undefined;
  if (!row) return null;
  return withLoadMatches([mapLoad(row)], allTrucks())[0] ?? null;
}

export function getTruck(id: string): TruckListItem | null {
  const row = getDb().prepare(`${TRUCK_SELECT} WHERE t.id = ?`).get(id) as TruckRow | undefined;
  if (!row) return null;
  const openLoads = allLoads().filter((load) => isLoadListedPublicly(load));
  return withTruckMatches([mapTruck(row)], openLoads)[0] ?? null;
}

function assertOwner(ownerId: string, user: PublicUser) {
  if (ownerId !== user.id) throw new AppError("Solo puedes modificar tus publicaciones.", 403);
}

export function createLoad(user: PublicUser, input: LoadInput, isDemo = false): LoadListItem {
  // Defensa en profundidad: con solo lectura manual vigente no se publica ni edita, venga de la web, la app o la API.
  if (user.role !== "admin") assertNotManualReadonly(user, "publicar cargas");
  if (!canPublishLoad(user.role)) {
    throw new AppError("Solo un mandante o un administrador puede publicar cargas.", 403);
  }
  const data = normalizeLoad(input);
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO loads (
        id, owner_id, origin, destination, pickup_date, equipment, description, weight_t, specs_json,
        budget_clp, notes, is_demo, solo_verificados, inmediata, status, offers_until, allow_improve, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'abierta', ?, ?, ?, ?)`,
    )
    .run(
      id,
      user.id,
      data.origin,
      data.destination,
      data.pickupDate,
      data.equipment,
      data.description,
      data.weightT,
      JSON.stringify(data.specs),
      data.budgetClp,
      data.notes,
      isDemo ? 1 : 0,
      data.soloVerificados ? 1 : 0,
      data.inmediata ? 1 : 0,
      offersUntilFrom(data.offerHours),
      data.allowImprove === null ? null : data.allowImprove ? 1 : 0,
      stamp,
      stamp,
    );
  const created = getLoad(id);
  if (!created) throw new AppError("No se pudo publicar la carga.", 500);
  return created;
}

export function updateLoad(user: PublicUser, id: string, input: LoadInput): LoadListItem {
  // Defensa en profundidad: con solo lectura manual vigente no se publica ni edita, venga de la web, la app o la API.
  if (user.role !== "admin") assertNotManualReadonly(user, "editar publicaciones");
  const current = getDb().prepare(`SELECT owner_id, status, offers_until FROM loads WHERE id = ?`).get(id) as
    | { owner_id: string; status: string | null; offers_until: string | null }
    | undefined;
  if (!current) throw new AppError("Carga no encontrada.", 404);
  assertOwner(current.owner_id, user);
  const data = normalizeLoad(input);
  // El plazo solo se recalcula si la solicitud sigue abierta y el mandante eligió un plazo.
  const offersUntil =
    current.status === "abierta" || !current.status
      ? data.offerHours !== null
        ? offersUntilFrom(data.offerHours)
        : current.offers_until
      : current.offers_until;
  getDb()
    .prepare(
      `UPDATE loads SET origin = ?, destination = ?, pickup_date = ?, equipment = ?, description = ?, weight_t = ?,
        specs_json = ?, budget_clp = ?, notes = ?, solo_verificados = ?, inmediata = ?, offers_until = ?, allow_improve = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      data.origin,
      data.destination,
      data.pickupDate,
      data.equipment,
      data.description,
      data.weightT,
      JSON.stringify(data.specs),
      data.budgetClp,
      data.notes,
      data.soloVerificados ? 1 : 0,
      data.inmediata ? 1 : 0,
      offersUntil,
      data.allowImprove === null ? null : data.allowImprove ? 1 : 0,
      new Date().toISOString(),
      id,
    );
  const updated = getLoad(id);
  if (!updated) throw new AppError("Carga no encontrada.", 404);
  return updated;
}

export function deleteLoad(user: PublicUser, id: string) {
  const current = getDb().prepare(`SELECT owner_id FROM loads WHERE id = ?`).get(id) as { owner_id: string } | undefined;
  if (!current) throw new AppError("Carga no encontrada.", 404);
  assertOwner(current.owner_id, user);
  getDb().prepare(`DELETE FROM loads WHERE id = ?`).run(id);
}

export function createTruck(user: PublicUser, input: TruckInput, isDemo = false): TruckListItem {
  // Defensa en profundidad: con solo lectura manual vigente no se publica ni edita, venga de la web, la app o la API.
  if (user.role !== "admin") assertNotManualReadonly(user, "publicar camiones");
  if (!canPublishTruck(user.role)) {
    throw new AppError("Solo un transportista o un administrador puede publicar camiones.", 403);
  }
  const patente = patenteInput(input.patente);
  const data = normalizeTruck(input);
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO trucks (
        id, owner_id, origin, destination, available_from, available_to, equipment, tonnage, specs_json,
        notes, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      user.id,
      data.origin,
      data.destination,
      data.availableFrom,
      data.availableTo,
      data.equipment,
      data.tonnage,
      JSON.stringify(data.specs),
      data.notes,
      isDemo ? 1 : 0,
      stamp,
      stamp,
    );
  if (patente) getDb().prepare(`UPDATE trucks SET patente = ? WHERE id = ?`).run(patente, id);
  const created = getTruck(id);
  if (!created) throw new AppError("No se pudo publicar el camión.", 500);
  return created;
}

export function updateTruck(user: PublicUser, id: string, input: TruckInput): TruckListItem {
  // Defensa en profundidad: con solo lectura manual vigente no se publica ni edita, venga de la web, la app o la API.
  if (user.role !== "admin") assertNotManualReadonly(user, "editar publicaciones");
  const current = getDb().prepare(`SELECT owner_id FROM trucks WHERE id = ?`).get(id) as { owner_id: string } | undefined;
  if (!current) throw new AppError("Camión no encontrado.", 404);
  assertOwner(current.owner_id, user);
  const patente = input.patente !== undefined ? patenteInput(input.patente) : undefined;
  const data = normalizeTruck(input);
  getDb()
    .prepare(
      `UPDATE trucks SET origin = ?, destination = ?, available_from = ?, available_to = ?, equipment = ?, tonnage = ?,
        specs_json = ?, notes = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      data.origin,
      data.destination,
      data.availableFrom,
      data.availableTo,
      data.equipment,
      data.tonnage,
      JSON.stringify(data.specs),
      data.notes,
      new Date().toISOString(),
      id,
    );
  if (patente !== undefined) getDb().prepare(`UPDATE trucks SET patente = ? WHERE id = ?`).run(patente, id);
  const updated = getTruck(id);
  if (!updated) throw new AppError("Camión no encontrado.", 404);
  return updated;
}

export function deleteTruck(user: PublicUser, id: string) {
  const current = getDb().prepare(`SELECT owner_id FROM trucks WHERE id = ?`).get(id) as { owner_id: string } | undefined;
  if (!current) throw new AppError("Camión no encontrado.", 404);
  assertOwner(current.owner_id, user);
  getDb().prepare(`DELETE FROM trucks WHERE id = ?`).run(id);
}

export function listOwn(userId: string): { loads: LoadListItem[]; trucks: TruckListItem[] } {
  const loads = allLoads().filter((load) => load.ownerId === userId);
  const trucks = allTrucks().filter((truck) => truck.ownerId === userId);
  return {
    loads: withLoadMatches(loads, allTrucks()),
    trucks: withTruckMatches(trucks, allLoads()),
  };
}
