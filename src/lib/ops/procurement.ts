import { randomUUID } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { quoteFromCache } from "../costos/engine";
import { lastDiesel, type DieselZone } from "../costos/diesel";
import { isVehicleClassId, type VehicleClassId } from "../costos/vehicles";
import { getDb } from "../db";
import { getDocument } from "../documents";
import { AppError } from "../errors";
import { EQUIPMENT_IDS, type EquipmentId, type PublicUser } from "../types";
import { can } from "./permissions";

const KINDS = ["contrato_marco", "licitacion", "spot"] as const;
const RATE_KINDS = ["por_viaje", "por_tonelada", "por_km"] as const;
const SLA_METRICS = ["retiro_a_tiempo", "entrega_a_tiempo", "tiempo_aceptacion", "pod_en_plazo", "documentos_al_dia"] as const;
const VEHICLE_CLASS_IDS = ["camion_2_ejes", "camion_3_ejes", "tracto_semirremolque_5_ejes", "tracto_semirremolque_6_ejes"] as const;
const DIESEL_ZONE_IDS = ["Zona Norte", "Zona Centro", "Metropolitana", "Zona Sur"] as const;

const idSchema = z.string().trim().min(8).max(80);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "fecha");

const dieselClauseSchema = z.object({
  zone: z.enum(DIESEL_ZONE_IDS),
  basePrice: z.number().positive().max(100_000),
  liters: z.number().positive().max(100_000),
});

const lineSchema = z.object({
  laneId: idSchema,
  equipment: z.enum(EQUIPMENT_IDS),
  vehicleClass: z.enum(VEHICLE_CLASS_IDS).nullable().optional(),
  rateKind: z.enum(RATE_KINDS),
  amountClp: z.number().int().positive().max(1_000_000_000),
  minChargeClp: z.number().int().positive().max(1_000_000_000).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const termsSchema = z.object({
  paymentDays: z.number().int().min(0).max(365),
  dieselClause: dieselClauseSchema.nullable().optional(),
  detentionFreeHours: z.number().min(0).max(240).nullable().optional(),
  detentionRateClp: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  insuranceRequired: z.boolean(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const zoneSchema = z.object({
  orgId: idSchema,
  name: z.string().trim().min(2).max(80),
  comunas: z.array(z.string().trim().min(2).max(80)).max(40).optional(),
  region: z.string().trim().max(80).nullable().optional(),
});

const laneSchema = z.object({
  orgId: idSchema,
  originZoneId: idSchema,
  destinationZoneId: idSchema,
  distanceKm: z.number().positive().max(10_000).nullable().optional(),
});

const contractSchema = z.object({
  shipperOrgId: idSchema,
  carrierOrgId: idSchema.nullable().optional(),
  kind: z.enum(KINDS),
  title: z.string().trim().min(2).max(160),
  validFrom: isoDate,
  validTo: isoDate,
  documentId: idSchema.nullable().optional(),
});

const contractPatchSchema = z.object({
  carrierOrgId: idSchema.nullable().optional(),
  title: z.string().trim().min(2).max(160).optional(),
  validFrom: isoDate.optional(),
  validTo: isoDate.optional(),
  documentId: idSchema.nullable().optional(),
});

const rateSchema = z.object({
  shipperOrgId: idSchema,
  carrierOrgId: idSchema.nullable().optional(),
  contractId: idSchema.nullable().optional(),
  name: z.string().trim().min(2).max(160),
  validFrom: isoDate,
  validTo: isoDate,
  lines: z.array(lineSchema).min(1).max(2000),
  terms: termsSchema.nullable().optional(),
});

const ratePatchSchema = z.object({
  carrierOrgId: idSchema.nullable().optional(),
  contractId: idSchema.nullable().optional(),
  name: z.string().trim().min(2).max(160).optional(),
  validFrom: isoDate.optional(),
  validTo: isoDate.optional(),
  lines: z.array(lineSchema).min(1).max(2000).optional(),
  terms: termsSchema.nullable().optional(),
});

const slaSchema = z.object({
  contractId: idSchema,
  metric: z.enum(SLA_METRICS),
  target: z.number().finite(),
  unit: z.string().trim().min(1).max(20),
  tolerance: z.number().finite().nullable().optional(),
  penaltyNote: z.string().trim().max(500).nullable().optional(),
});

const slaPatchSchema = slaSchema.omit({ contractId: true }).partial();

const importSchema = z.object({
  shipperOrgId: idSchema,
  carrierOrgId: idSchema.nullable().optional(),
  contractId: idSchema.nullable().optional(),
  name: z.string().trim().min(2).max(160),
  validFrom: isoDate,
  validTo: isoDate,
  csv: z.string().min(1).max(2_000_000),
});

const resolveSchema = z.object({
  shipperOrgId: idSchema,
  carrierOrgId: z.string().trim().max(80).nullable().optional(),
  origin: z.string().trim().min(1).max(80),
  destination: z.string().trim().min(1).max(80),
  equipment: z.enum(EQUIPMENT_IDS),
  date: isoDate,
});

type LineInput = z.infer<typeof lineSchema>;
type TermsInput = z.infer<typeof termsSchema>;
type ContractStatus = "borrador" | "en_revision" | "vigente" | "vencido" | "terminado";
type RateStatus = "borrador" | "vigente" | "vencida" | "anulada";

type OrgRow = { id: string; kind: string };
type ZoneRow = { id: string; org_id: string; name: string; comunas_json: string; region: string | null; created_at: string };
type LaneRow = {
  id: string;
  org_id: string;
  origin_zone_id: string;
  destination_zone_id: string;
  distance_km: number | null;
  created_at: string;
};
type ContractRow = {
  id: string;
  shipper_org_id: string;
  carrier_org_id: string | null;
  kind: (typeof KINDS)[number];
  title: string;
  status: ContractStatus;
  valid_from: string;
  valid_to: string;
  version: number;
  parent_id: string | null;
  document_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};
type RateRow = {
  id: string;
  contract_id: string | null;
  shipper_org_id: string;
  carrier_org_id: string | null;
  name: string;
  status: RateStatus;
  valid_from: string;
  valid_to: string;
  version: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};
type LineRow = {
  id: string;
  rate_card_id: string;
  lane_id: string;
  equipment: string;
  vehicle_class: string | null;
  rate_kind: (typeof RATE_KINDS)[number];
  amount_clp: number;
  min_charge_clp: number | null;
  notes: string | null;
};
type TermsRow = {
  id: string;
  rate_card_id: string;
  payment_days: number;
  diesel_clause_json: string | null;
  detention_free_hours: number | null;
  detention_rate_clp: number | null;
  insurance_required: number;
  notes: string | null;
};
type SlaRow = {
  id: string;
  contract_id: string;
  metric: (typeof SLA_METRICS)[number];
  target: number;
  unit: string;
  tolerance: number | null;
  penalty_note: string | null;
};

export type CsvRowError = { row: number; message: string };

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  return parsed.data;
}

function nowIso() {
  return new Date().toISOString();
}

function assertRange(validFrom: string, validTo: string) {
  if (validFrom >= validTo) throw new AppError("La fecha de inicio debe ser anterior a la de término.");
}

function assertPercent(unit: string, target: number) {
  const normalized = unit.trim().toLowerCase();
  if ((normalized === "%" || normalized === "porcentaje") && (target < 0 || target > 100)) {
    throw new AppError("La meta del SLA debe estar entre 0 y 100 cuando la unidad es %.");
  }
  if (target < 0) throw new AppError("La meta del SLA no puede ser negativa.");
}

function assertEquipment(value: string): EquipmentId {
  if (!(EQUIPMENT_IDS as readonly string[]).includes(value)) throw new AppError("El equipo no es válido.");
  return value as EquipmentId;
}

function assertVehicle(value: string | null | undefined): VehicleClassId | null {
  if (value == null || value === "") return null;
  if (!isVehicleClassId(value)) throw new AppError("La clase de vehículo no es válida.");
  return value;
}

function loadOrg(orgId: string): OrgRow | undefined {
  return getDb().prepare(`SELECT id, kind FROM ops_organizations WHERE id = ?`).get(orgId) as OrgRow | undefined;
}

/** Admin de plataforma puede todo. El resto necesita el permiso en la organización mandante. Aprobar exige org_admin. */
function assertShipper(user: PublicUser, orgId: string, mode: "ver" | "editar" | "aprobar"): OrgRow {
  const org = loadOrg(orgId);
  if (user.role === "admin") {
    if (!org) throw new AppError("No encontrado.", 404);
    return org;
  }
  if (!org) throw new AppError("No tienes permiso para esta acción.", 403);
  if (mode === "aprobar") {
    const member = getDb()
      .prepare(`SELECT ops_role, status FROM ops_org_members WHERE org_id = ? AND user_id = ?`)
      .get(orgId, user.id) as { ops_role: string; status: string } | undefined;
    if (!member || member.status !== "activo" || member.ops_role !== "org_admin") {
      throw new AppError("Solo un administrador de la organización puede aprobar.", 403);
    }
    return org;
  }
  if (!can(user, orgId, mode === "ver" ? "tarifas.ver" : "tarifas.editar")) {
    throw new AppError("No tienes permiso para esta acción.", 403);
  }
  return org;
}

function assertCarrier(carrierOrgId: string | null | undefined) {
  if (!carrierOrgId) return null;
  const org = loadOrg(carrierOrgId);
  if (!org) throw new AppError("El transportista indicado no existe.", 404);
  if (org.kind !== "transportista") throw new AppError("La organización del transportista no corresponde.");
  return carrierOrgId;
}

function assertDocument(documentId: string | null | undefined) {
  if (!documentId) return null;
  if (!getDocument(documentId)) throw new AppError("El documento del contrato no está cargado.", 404);
  return documentId;
}

function toZone(row: ZoneRow) {
  let comunas: string[] = [];
  try {
    const parsed = JSON.parse(row.comunas_json) as unknown;
    if (Array.isArray(parsed)) comunas = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    comunas = [];
  }
  return { id: row.id, orgId: row.org_id, name: row.name, comunas, region: row.region, createdAt: row.created_at };
}

function toLane(row: LaneRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    originZoneId: row.origin_zone_id,
    destinationZoneId: row.destination_zone_id,
    distanceKm: row.distance_km,
    createdAt: row.created_at,
  };
}

function toLine(row: LineRow) {
  return {
    id: row.id,
    laneId: row.lane_id,
    equipment: row.equipment,
    vehicleClass: row.vehicle_class,
    rateKind: row.rate_kind,
    amountClp: row.amount_clp,
    minChargeClp: row.min_charge_clp,
    notes: row.notes,
  };
}

function parseDiesel(raw: string | null): z.infer<typeof dieselClauseSchema> | null {
  if (!raw) return null;
  try {
    const parsed = dieselClauseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function toTerms(row: TermsRow) {
  return {
    id: row.id,
    paymentDays: row.payment_days,
    dieselClause: parseDiesel(row.diesel_clause_json),
    detentionFreeHours: row.detention_free_hours,
    detentionRateClp: row.detention_rate_clp,
    insuranceRequired: row.insurance_required === 1,
    notes: row.notes,
  };
}

function toSla(row: SlaRow) {
  return {
    id: row.id,
    contractId: row.contract_id,
    metric: row.metric,
    target: row.target,
    unit: row.unit,
    tolerance: row.tolerance,
    penaltyNote: row.penalty_note,
  };
}

function toContract(row: ContractRow) {
  return {
    id: row.id,
    shipperOrgId: row.shipper_org_id,
    carrierOrgId: row.carrier_org_id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    version: row.version,
    parentId: row.parent_id,
    documentId: row.document_id,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slas: listSlaRows(row.id).map(toSla),
  };
}

function loadContract(id: string): ContractRow | undefined {
  return getDb().prepare(`SELECT * FROM ops_contracts WHERE id = ?`).get(id) as ContractRow | undefined;
}

function loadRate(id: string): RateRow | undefined {
  return getDb().prepare(`SELECT * FROM ops_rate_cards WHERE id = ?`).get(id) as RateRow | undefined;
}

function listLineRows(rateCardId: string): LineRow[] {
  return getDb().prepare(`SELECT * FROM ops_rate_card_lines WHERE rate_card_id = ? ORDER BY id`).all(rateCardId) as LineRow[];
}

function loadTerms(rateCardId: string): TermsRow | undefined {
  return getDb().prepare(`SELECT * FROM ops_commercial_terms WHERE rate_card_id = ? ORDER BY id LIMIT 1`).get(rateCardId) as TermsRow | undefined;
}

function listSlaRows(contractId: string): SlaRow[] {
  return getDb().prepare(`SELECT * FROM ops_slas WHERE contract_id = ? ORDER BY id`).all(contractId) as SlaRow[];
}

function toRate(row: RateRow) {
  const terms = loadTerms(row.id);
  return {
    id: row.id,
    contractId: row.contract_id,
    shipperOrgId: row.shipper_org_id,
    carrierOrgId: row.carrier_org_id,
    name: row.name,
    status: row.status,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    version: row.version,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines: listLineRows(row.id).map(toLine),
    terms: terms ? toTerms(terms) : null,
  };
}

function requireContract(user: PublicUser, id: string, mode: "ver" | "editar" | "aprobar"): ContractRow {
  const row = loadContract(id);
  if (!row) {
    if (user.role === "admin") throw new AppError("No encontrado.", 404);
    throw new AppError("No tienes permiso para esta acción.", 403);
  }
  assertShipper(user, row.shipper_org_id, mode);
  return row;
}

function requireRate(user: PublicUser, id: string, mode: "ver" | "editar" | "aprobar"): RateRow {
  const row = loadRate(id);
  if (!row) {
    if (user.role === "admin") throw new AppError("No encontrado.", 404);
    throw new AppError("No tienes permiso para esta acción.", 403);
  }
  assertShipper(user, row.shipper_org_id, mode);
  return row;
}

function zoneInOrg(orgId: string, zoneId: string): ZoneRow {
  const zone = getDb().prepare(`SELECT * FROM ops_zones WHERE id = ? AND org_id = ?`).get(zoneId, orgId) as ZoneRow | undefined;
  if (!zone) throw new AppError("La zona no pertenece a la organización.");
  return zone;
}

function assertLines(orgId: string, lines: { laneId: string; equipment: string; vehicleClass?: string | null }[]) {
  const seen = new Set<string>();
  for (const line of lines) {
    assertEquipment(line.equipment);
    assertVehicle(line.vehicleClass);
    const lane = getDb().prepare(`SELECT id FROM ops_lanes WHERE id = ? AND org_id = ?`).get(line.laneId, orgId);
    if (!lane) throw new AppError("La ruta no pertenece a la organización.");
    const key = `${line.laneId}:${line.equipment}`;
    if (seen.has(key)) throw new AppError("Hay dos líneas para la misma ruta y equipo.");
    seen.add(key);
  }
}

function assertContractLink(shipperOrgId: string, contractId: string | null | undefined, validFrom: string, validTo: string, approving: boolean) {
  if (!contractId) return null;
  const contract = loadContract(contractId);
  if (!contract || contract.shipper_org_id !== shipperOrgId) throw new AppError("El contrato no pertenece al mandante.");
  if (approving && contract.status !== "vigente") throw new AppError("Un tarifario vigente exige un contrato vigente.");
  if (validFrom < contract.valid_from || validTo > contract.valid_to) {
    throw new AppError("La vigencia del tarifario debe quedar dentro de la vigencia del contrato.");
  }
  return contractId;
}

function overlaps(card: { id: string; shipper_org_id: string; carrier_org_id: string | null; valid_from: string; valid_to: string }, lines: { laneId: string; equipment: string }[], ignoreIds: string[]) {
  const db = getDb();
  for (const line of lines) {
    const placeholders = ignoreIds.map(() => "?").join(", ");
    const ignoreSql = ignoreIds.length ? ` AND c.id NOT IN (${placeholders})` : "";
    const hit = db
      .prepare(
        `SELECT c.id FROM ops_rate_cards c
         JOIN ops_rate_card_lines l ON l.rate_card_id = c.id
         WHERE c.status = 'vigente'
           AND c.shipper_org_id = ?
           AND ifnull(c.carrier_org_id, '') = ifnull(?, '')
           AND c.id != ?
           AND l.lane_id = ?
           AND l.equipment = ?
           AND c.valid_from <= ?
           AND c.valid_to >= ?
           ${ignoreSql}`,
      )
      .get(card.shipper_org_id, card.carrier_org_id, card.id, line.laneId, line.equipment, card.valid_to, card.valid_from, ...ignoreIds) as { id: string } | undefined;
    if (hit) throw new AppError("Ya hay una tarifa vigente para ese mandante, transportista, ruta y equipo en esas fechas.");
  }
}

function predecessorIds(entityType: string, entityId: string): string[] {
  const rows = getDb()
    .prepare(`SELECT entity_id FROM ops_versions WHERE entity_type = ? AND change_note = ?`)
    .all(entityType, `sucesor:${entityId}`) as { entity_id: string }[];
  return rows.map((row) => row.entity_id);
}

function writeVersion(entityType: string, entityId: string, version: number, snapshot: unknown, userId: string, note: string | null) {
  getDb()
    .prepare(
      `INSERT INTO ops_versions (id, entity_type, entity_id, version, snapshot_json, changed_by, change_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), entityType, entityId, version, JSON.stringify(snapshot), userId, note, nowIso());
}

function insertLines(rateCardId: string, lines: LineInput[]) {
  const stmt = getDb().prepare(
    `INSERT INTO ops_rate_card_lines (id, rate_card_id, lane_id, equipment, vehicle_class, rate_kind, amount_clp, min_charge_clp, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const line of lines) {
    stmt.run(randomUUID(), rateCardId, line.laneId, line.equipment, line.vehicleClass ?? null, line.rateKind, line.amountClp, line.minChargeClp ?? null, line.notes ?? null);
  }
}

function replaceLines(rateCardId: string, lines: LineInput[]) {
  getDb().prepare(`DELETE FROM ops_rate_card_lines WHERE rate_card_id = ?`).run(rateCardId);
  insertLines(rateCardId, lines);
}

function writeTerms(rateCardId: string, terms: TermsInput | null | undefined, replace: boolean) {
  if (terms === undefined) return;
  const db = getDb();
  if (replace) db.prepare(`DELETE FROM ops_commercial_terms WHERE rate_card_id = ?`).run(rateCardId);
  if (!terms) return;
  db.prepare(
    `INSERT INTO ops_commercial_terms (id, rate_card_id, payment_days, diesel_clause_json, detention_free_hours, detention_rate_clp, insurance_required, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    rateCardId,
    terms.paymentDays,
    terms.dieselClause ? JSON.stringify(terms.dieselClause) : null,
    terms.detentionFreeHours ?? null,
    terms.detentionRateClp ?? null,
    terms.insuranceRequired ? 1 : 0,
    terms.notes ?? null,
  );
}

function rateSnapshot(row: RateRow) {
  return toRate(row);
}

function contractSnapshot(row: ContractRow) {
  return toContract(row);
}

function findDraftSuccessor(entityType: string, entityId: string, version: number, table: "ops_rate_cards" | "ops_contracts"): string | null {
  const note = getDb()
    .prepare(`SELECT change_note FROM ops_versions WHERE entity_type = ? AND entity_id = ? AND version = ?`)
    .get(entityType, entityId, version) as { change_note: string | null } | undefined;
  if (!note?.change_note?.startsWith("sucesor:")) return null;
  const id = note.change_note.slice("sucesor:".length);
  const status = getDb().prepare(`SELECT status FROM ${table} WHERE id = ?`).get(id) as { status: string } | undefined;
  return status?.status === "borrador" ? id : null;
}

export function listZones(user: PublicUser, orgId: string) {
  assertShipper(user, orgId, "ver");
  const rows = getDb().prepare(`SELECT * FROM ops_zones WHERE org_id = ? ORDER BY name, id`).all(orgId) as ZoneRow[];
  return rows.map(toZone);
}

export function createZone(user: PublicUser, body: unknown, ip: string | null) {
  const input = parseBody(zoneSchema, body);
  assertShipper(user, input.orgId, "editar");
  const db = getDb();
  if (db.prepare(`SELECT 1 FROM ops_zones WHERE org_id = ? AND lower(name) = lower(?)`).get(input.orgId, input.name)) {
    throw new AppError("Ya existe una zona con ese nombre.", 409);
  }
  const id = randomUUID();
  const now = nowIso();
  const save = db.transaction(() => {
    db.prepare(`INSERT INTO ops_zones (id, org_id, name, comunas_json, region, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      id,
      input.orgId,
      input.name,
      JSON.stringify(input.comunas?.length ? input.comunas : [input.name]),
      input.region ?? null,
      now,
    );
    auditStrict(user, "ops.zona_creada", { type: "ops_zona", id }, { orgId: input.orgId }, ip);
  });
  save();
  return toZone(db.prepare(`SELECT * FROM ops_zones WHERE id = ?`).get(id) as ZoneRow);
}

export function listLanes(user: PublicUser, orgId: string) {
  assertShipper(user, orgId, "ver");
  const rows = getDb().prepare(`SELECT * FROM ops_lanes WHERE org_id = ? ORDER BY created_at, id`).all(orgId) as LaneRow[];
  return rows.map(toLane);
}

export function createLane(user: PublicUser, body: unknown, ip: string | null) {
  const input = parseBody(laneSchema, body);
  assertShipper(user, input.orgId, "editar");
  zoneInOrg(input.orgId, input.originZoneId);
  zoneInOrg(input.orgId, input.destinationZoneId);
  const db = getDb();
  if (db.prepare(`SELECT 1 FROM ops_lanes WHERE org_id = ? AND origin_zone_id = ? AND destination_zone_id = ?`).get(input.orgId, input.originZoneId, input.destinationZoneId)) {
    throw new AppError("Esa ruta ya existe.", 409);
  }
  const id = randomUUID();
  const now = nowIso();
  const save = db.transaction(() => {
    db.prepare(`INSERT INTO ops_lanes (id, org_id, origin_zone_id, destination_zone_id, distance_km, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      id,
      input.orgId,
      input.originZoneId,
      input.destinationZoneId,
      input.distanceKm ?? null,
      now,
    );
    auditStrict(user, "ops.ruta_creada", { type: "ops_ruta", id }, { orgId: input.orgId }, ip);
  });
  save();
  return toLane(db.prepare(`SELECT * FROM ops_lanes WHERE id = ?`).get(id) as LaneRow);
}

export function listContracts(user: PublicUser, orgId: string) {
  assertShipper(user, orgId, "ver");
  const rows = getDb().prepare(`SELECT * FROM ops_contracts WHERE shipper_org_id = ? ORDER BY created_at, id`).all(orgId) as ContractRow[];
  return rows.map(toContract);
}

export function createContract(user: PublicUser, body: unknown, ip: string | null) {
  const input = parseBody(contractSchema, body);
  assertShipper(user, input.shipperOrgId, "editar");
  assertRange(input.validFrom, input.validTo);
  const carrier = assertCarrier(input.carrierOrgId);
  const documentId = assertDocument(input.documentId);
  const id = randomUUID();
  const now = nowIso();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO ops_contracts (id, shipper_org_id, carrier_org_id, kind, title, status, valid_from, valid_to, version, parent_id, document_id, approved_by, approved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'borrador', ?, ?, 1, NULL, ?, NULL, NULL, ?, ?)`,
    ).run(id, input.shipperOrgId, carrier, input.kind, input.title, input.validFrom, input.validTo, documentId, now, now);
    auditStrict(user, "ops.contrato_creado", { type: "ops_contrato", id }, { kind: input.kind }, ip);
  });
  save();
  return toContract(loadContract(id)!);
}

export function updateContract(user: PublicUser, id: string, body: unknown, ip: string | null) {
  const input = parseBody(contractPatchSchema, body);
  if (input.title === undefined && input.validFrom === undefined && input.validTo === undefined && input.carrierOrgId === undefined && input.documentId === undefined) {
    throw new AppError("Revisa los datos enviados.");
  }
  const current = requireContract(user, id, "editar");
  if (current.status !== "borrador" && current.status !== "vigente" && current.status !== "en_revision") {
    throw new AppError("Ese contrato ya no se puede editar.");
  }
  const draftId = current.status === "vigente" ? findDraftSuccessor("contrato", current.id, current.version, "ops_contracts") : null;
  if (draftId) return updateContract(user, draftId, body, ip);
  const next = {
    title: input.title ?? current.title,
    validFrom: input.validFrom ?? current.valid_from,
    validTo: input.validTo ?? current.valid_to,
    carrier: input.carrierOrgId !== undefined ? assertCarrier(input.carrierOrgId) : current.carrier_org_id,
    documentId: input.documentId !== undefined ? assertDocument(input.documentId) : current.document_id,
  };
  assertRange(next.validFrom, next.validTo);
  const db = getDb();
  if (current.status !== "vigente") {
    const save = db.transaction(() => {
      db.prepare(`UPDATE ops_contracts SET title = ?, valid_from = ?, valid_to = ?, carrier_org_id = ?, document_id = ?, updated_at = ? WHERE id = ?`).run(
        next.title,
        next.validFrom,
        next.validTo,
        next.carrier,
        next.documentId,
        nowIso(),
        current.id,
      );
      auditStrict(user, "ops.contrato_editado", { type: "ops_contrato", id: current.id }, { version: current.version }, ip);
    });
    save();
    return toContract(loadContract(current.id)!);
  }
  const newId = randomUUID();
  const now = nowIso();
  const save = db.transaction(() => {
    writeVersion("contrato", current.id, current.version, contractSnapshot(current), user.id, `sucesor:${newId}`);
    db.prepare(
      `INSERT INTO ops_contracts (id, shipper_org_id, carrier_org_id, kind, title, status, valid_from, valid_to, version, parent_id, document_id, approved_by, approved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'borrador', ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    ).run(newId, current.shipper_org_id, next.carrier, current.kind, next.title, next.validFrom, next.validTo, current.version + 1, current.id, next.documentId, now, now);
    for (const sla of listSlaRows(current.id)) {
      db.prepare(`INSERT INTO ops_slas (id, contract_id, metric, target, unit, tolerance, penalty_note) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        randomUUID(),
        newId,
        sla.metric,
        sla.target,
        sla.unit,
        sla.tolerance,
        sla.penalty_note,
      );
    }
    auditStrict(user, "ops.contrato_versionado", { type: "ops_contrato", id: newId }, { parentId: current.id, version: current.version + 1 }, ip);
  });
  save();
  return toContract(loadContract(newId)!);
}

export function approveContract(user: PublicUser, id: string, ip: string | null) {
  const current = requireContract(user, id, "aprobar");
  if (current.status === "vigente") return toContract(current);
  if (current.status !== "borrador" && current.status !== "en_revision") throw new AppError("Ese contrato no se puede aprobar.");
  assertRange(current.valid_from, current.valid_to);
  const now = nowIso();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(`UPDATE ops_contracts SET status = 'vigente', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`).run(user.id, now, now, current.id);
    if (current.parent_id) {
      db.prepare(`UPDATE ops_contracts SET status = 'terminado', updated_at = ? WHERE id = ? AND status = 'vigente'`).run(now, current.parent_id);
    }
    auditStrict(user, "ops.contrato_aprobado", { type: "ops_contrato", id: current.id }, { version: current.version }, ip);
  });
  save();
  return toContract(loadContract(current.id)!);
}

export function listVersions(user: PublicUser, contractId: string) {
  const contract = requireContract(user, contractId, "ver");
  const rows = getDb()
    .prepare(`SELECT id, entity_type, entity_id, version, snapshot_json, changed_by, change_note, created_at FROM ops_versions WHERE entity_type = 'contrato' AND entity_id = ? ORDER BY version`)
    .all(contract.id) as { id: string; entity_type: string; entity_id: string; version: number; snapshot_json: string; changed_by: string | null; change_note: string | null; created_at: string }[];
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    version: row.version,
    snapshot: JSON.parse(row.snapshot_json) as unknown,
    changedBy: row.changed_by,
    changeNote: row.change_note,
    createdAt: row.created_at,
  }));
}

export function listRateCards(user: PublicUser, orgId: string) {
  assertShipper(user, orgId, "ver");
  const rows = getDb().prepare(`SELECT * FROM ops_rate_cards WHERE shipper_org_id = ? ORDER BY created_at, id`).all(orgId) as RateRow[];
  return rows.map(toRate);
}

export function createRateCard(user: PublicUser, body: unknown, ip: string | null) {
  const input = parseBody(rateSchema, body);
  assertShipper(user, input.shipperOrgId, "editar");
  assertRange(input.validFrom, input.validTo);
  const carrier = assertCarrier(input.carrierOrgId);
  assertContractLink(input.shipperOrgId, input.contractId, input.validFrom, input.validTo, false);
  assertLines(input.shipperOrgId, input.lines);
  const id = randomUUID();
  const now = nowIso();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO ops_rate_cards (id, contract_id, shipper_org_id, carrier_org_id, name, status, valid_from, valid_to, version, approved_by, approved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'borrador', ?, ?, 1, NULL, NULL, ?, ?)`,
    ).run(id, input.contractId ?? null, input.shipperOrgId, carrier, input.name, input.validFrom, input.validTo, now, now);
    insertLines(id, input.lines);
    writeTerms(id, input.terms, false);
    auditStrict(user, "ops.tarifa_creada", { type: "ops_tarifa", id }, { version: 1 }, ip);
  });
  save();
  return toRate(loadRate(id)!);
}

export function updateRateCard(user: PublicUser, id: string, body: unknown, ip: string | null) {
  const input = parseBody(ratePatchSchema, body);
  const current = requireRate(user, id, "editar");
  if (current.status !== "borrador" && current.status !== "vigente") throw new AppError("Esa tarifa ya no se puede editar.");
  const draftId = current.status === "vigente" ? findDraftSuccessor("tarifario", current.id, current.version, "ops_rate_cards") : null;
  if (draftId) return updateRateCard(user, draftId, body, ip);
  const existing = toRate(current);
  const nextLines: LineInput[] = (input.lines ?? existing.lines).map((line) => ({
    laneId: line.laneId,
    equipment: assertEquipment(line.equipment),
    vehicleClass: assertVehicle(line.vehicleClass),
    rateKind: line.rateKind,
    amountClp: line.amountClp,
    minChargeClp: line.minChargeClp ?? null,
    notes: line.notes ?? null,
  }));
  const next = {
    name: input.name ?? current.name,
    validFrom: input.validFrom ?? current.valid_from,
    validTo: input.validTo ?? current.valid_to,
    carrier: input.carrierOrgId !== undefined ? assertCarrier(input.carrierOrgId) : current.carrier_org_id,
    contractId: input.contractId !== undefined ? input.contractId : current.contract_id,
  };
  assertRange(next.validFrom, next.validTo);
  assertContractLink(current.shipper_org_id, next.contractId, next.validFrom, next.validTo, false);
  assertLines(current.shipper_org_id, nextLines);
  const db = getDb();
  if (current.status !== "vigente") {
    const save = db.transaction(() => {
      db.prepare(`UPDATE ops_rate_cards SET name = ?, valid_from = ?, valid_to = ?, carrier_org_id = ?, contract_id = ?, updated_at = ? WHERE id = ?`).run(
        next.name,
        next.validFrom,
        next.validTo,
        next.carrier,
        next.contractId,
        nowIso(),
        current.id,
      );
      if (input.lines) replaceLines(current.id, input.lines);
      if (input.terms !== undefined) writeTerms(current.id, input.terms, true);
      auditStrict(user, "ops.tarifa_editada", { type: "ops_tarifa", id: current.id }, { version: current.version }, ip);
    });
    save();
    return toRate(loadRate(current.id)!);
  }
  const newId = randomUUID();
  const now = nowIso();
  const terms = input.terms !== undefined ? input.terms : existing.terms;
  const save = db.transaction(() => {
    const snapshot = rateSnapshot(current);
    writeVersion("tarifario", current.id, current.version, snapshot, user.id, `sucesor:${newId}`);
    if (snapshot.terms) writeVersion("condiciones", snapshot.terms.id, current.version, snapshot.terms, user.id, `sucesor:${newId}`);
    db.prepare(
      `INSERT INTO ops_rate_cards (id, contract_id, shipper_org_id, carrier_org_id, name, status, valid_from, valid_to, version, approved_by, approved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'borrador', ?, ?, ?, NULL, NULL, ?, ?)`,
    ).run(newId, next.contractId, current.shipper_org_id, next.carrier, next.name, next.validFrom, next.validTo, current.version + 1, now, now);
    insertLines(newId, nextLines);
    writeTerms(newId, terms, false);
    auditStrict(user, "ops.tarifa_versionada", { type: "ops_tarifa", id: newId }, { parentId: current.id, version: current.version + 1 }, ip);
  });
  save();
  return toRate(loadRate(newId)!);
}

export function approveRateCard(user: PublicUser, id: string, ip: string | null) {
  const current = requireRate(user, id, "aprobar");
  if (current.status === "vigente") return toRate(current);
  if (current.status !== "borrador") throw new AppError("Esa tarifa no se puede aprobar.");
  assertRange(current.valid_from, current.valid_to);
  const lines = listLineRows(current.id);
  if (!lines.length) throw new AppError("El tarifario no tiene líneas.");
  assertLines(current.shipper_org_id, lines.map(toLine));
  assertContractLink(current.shipper_org_id, current.contract_id, current.valid_from, current.valid_to, true);
  const ignore = predecessorIds("tarifario", current.id);
  overlaps(current, lines.map(toLine), ignore);
  const now = nowIso();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(`UPDATE ops_rate_cards SET status = 'vigente', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`).run(user.id, now, now, current.id);
    for (const previous of ignore) {
      db.prepare(`UPDATE ops_rate_cards SET status = 'anulada', updated_at = ? WHERE id = ? AND status = 'vigente'`).run(now, previous);
    }
    auditStrict(user, "ops.tarifa_aprobada", { type: "ops_tarifa", id: current.id }, { version: current.version }, ip);
  });
  save();
  return toRate(loadRate(current.id)!);
}

/** Ajuste referencial con el último diésel ya guardado. No cobra ni factura. */
export function dieselAdjustment(clause: { zone: DieselZone; basePrice: number; liters: number } | null) {
  if (!clause) return { adjustmentClp: null as number | null, dieselPrice: null as number | null, note: "Sin cláusula de diésel." };
  const saved = lastDiesel(clause.zone);
  if (saved.price == null) {
    return { adjustmentClp: null, dieselPrice: null, note: "No hay precio de diésel guardado. El ajuste referencial queda pendiente. No es un cobro." };
  }
  const adjustmentClp = Math.round((saved.price - clause.basePrice) * clause.liters);
  return {
    adjustmentClp,
    dieselPrice: saved.price,
    note: "Ajuste referencial con el diésel ya guardado. No es un cobro ni una factura.",
  };
}

function internalReference(origin: string, destination: string, equipment: string) {
  try {
    const quote = quoteFromCache({ origin, destination, equipment });
    if (!quote) return null;
    return {
      method: quote.method,
      costoReferencial: quote.method === "motor" && quote.totals.costoBase > 0 ? quote.totals.costoBase : null,
      min: quote.fallback?.min ?? null,
      max: quote.fallback?.max ?? null,
      notice: quote.notice,
    };
  } catch {
    return null;
  }
}

function zoneByRef(orgId: string, ref: string): ZoneRow | undefined {
  const db = getDb();
  return (db.prepare(`SELECT * FROM ops_zones WHERE org_id = ? AND (id = ? OR lower(name) = lower(?))`).get(orgId, ref, ref) as ZoneRow | undefined) ?? undefined;
}

export function resolveRate(
  user: PublicUser,
  input: { shipperOrgId: string; carrierOrgId?: string | null; origin: string; destination: string; equipment: string; date: string },
) {
  const parsed = parseBody(resolveSchema, { ...input, carrierOrgId: input.carrierOrgId || null });
  assertShipper(user, parsed.shipperOrgId, "ver");
  const origin = zoneByRef(parsed.shipperOrgId, parsed.origin);
  const destination = zoneByRef(parsed.shipperOrgId, parsed.destination);
  if (!origin || !destination) return null;
  const rows = getDb()
    .prepare(
      `SELECT c.*, l.id AS line_id, l.lane_id, l.equipment, l.vehicle_class, l.rate_kind, l.amount_clp, l.min_charge_clp, l.notes AS line_notes
       FROM ops_rate_cards c
       JOIN ops_rate_card_lines l ON l.rate_card_id = c.id
       JOIN ops_lanes r ON r.id = l.lane_id
       WHERE c.status = 'vigente'
         AND c.shipper_org_id = ?
         AND c.valid_from <= ?
         AND c.valid_to >= ?
         AND l.equipment = ?
         AND r.org_id = ?
         AND r.origin_zone_id = ?
         AND r.destination_zone_id = ?
         AND (c.carrier_org_id = ? OR c.carrier_org_id IS NULL)
       ORDER BY CASE WHEN c.carrier_org_id = ? THEN 0 ELSE 1 END, c.version DESC, c.valid_from DESC
       LIMIT 1`,
    )
    .get(
      parsed.shipperOrgId,
      parsed.date,
      parsed.date,
      parsed.equipment,
      parsed.shipperOrgId,
      origin.id,
      destination.id,
      parsed.carrierOrgId,
      parsed.carrierOrgId,
    ) as (RateRow & { line_id: string; lane_id: string; equipment: string; vehicle_class: string | null; rate_kind: (typeof RATE_KINDS)[number]; amount_clp: number; min_charge_clp: number | null }) | undefined;
  if (!rows) return null;
  const terms = loadTerms(rows.id);
  const clause = terms ? parseDiesel(terms.diesel_clause_json) : null;
  return {
    rateCardId: rows.id,
    lineId: rows.line_id,
    version: rows.version,
    laneId: rows.lane_id,
    equipment: rows.equipment,
    vehicleClass: rows.vehicle_class,
    rateKind: rows.rate_kind,
    amountClp: rows.amount_clp,
    minChargeClp: rows.min_charge_clp,
    validFrom: rows.valid_from,
    validTo: rows.valid_to,
    carrierOrgId: rows.carrier_org_id,
    diesel: dieselAdjustment(clause),
    referencia: internalReference(origin.name, destination.name, rows.equipment),
  };
}

const CSV_HEADERS: Record<string, "origen" | "destino" | "equipo" | "clase" | "tipo" | "monto" | "minimo" | "notas"> = {
  origen: "origen",
  zona_origen: "origen",
  destino: "destino",
  zona_destino: "destino",
  equipo: "equipo",
  equipment: "equipo",
  clase: "clase",
  clase_vehiculo: "clase",
  vehicle_class: "clase",
  tipo: "tipo",
  rate_kind: "tipo",
  monto: "monto",
  monto_clp: "monto",
  amount_clp: "monto",
  minimo: "minimo",
  minimo_clp: "minimo",
  min_charge_clp: "minimo",
  notas: "notas",
  notes: "notas",
};

function normHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((item) => item !== "")) rows.push(row);
  }
  return rows;
}

export function importRateCard(user: PublicUser, body: unknown, ip: string | null): { rateCard: ReturnType<typeof toRate> } | { errors: CsvRowError[] } {
  const input = parseBody(importSchema, body);
  assertShipper(user, input.shipperOrgId, "editar");
  assertRange(input.validFrom, input.validTo);
  const carrier = assertCarrier(input.carrierOrgId);
  assertContractLink(input.shipperOrgId, input.contractId, input.validFrom, input.validTo, false);
  const table = parseCsv(input.csv);
  if (table.length < 2) return { errors: [{ row: 1, message: "El CSV no trae filas." }] };
  const header = table[0].map((item) => CSV_HEADERS[normHeader(item)] ?? "");
  for (const required of ["origen", "destino", "equipo", "tipo", "monto"] as const) {
    if (!header.includes(required)) return { errors: [{ row: 1, message: `Falta la columna ${required}.` }] };
  }
  const data = table.slice(1);
  if (data.length > 2000) return { errors: [{ row: 0, message: "El archivo supera 2.000 líneas." }] };
  const errors: CsvRowError[] = [];
  const lines: LineInput[] = [];
  const seen = new Set<string>();
  data.forEach((cells, index) => {
    const rowNumber = index + 2;
    const value = (key: string) => {
      const at = header.indexOf(key as (typeof header)[number]);
      return at >= 0 ? (cells[at] ?? "").trim() : "";
    };
    const origin = zoneByRef(input.shipperOrgId, value("origen"));
    const destination = zoneByRef(input.shipperOrgId, value("destino"));
    if (!origin || !destination) {
      errors.push({ row: rowNumber, message: "No existe la zona de origen o destino." });
      return;
    }
    const lane = getDb()
      .prepare(`SELECT id FROM ops_lanes WHERE org_id = ? AND origin_zone_id = ? AND destination_zone_id = ?`)
      .get(input.shipperOrgId, origin.id, destination.id) as { id: string } | undefined;
    if (!lane) {
      errors.push({ row: rowNumber, message: "No existe la ruta entre esas zonas." });
      return;
    }
    const equipment = value("equipo");
    if (!(EQUIPMENT_IDS as readonly string[]).includes(equipment)) {
      errors.push({ row: rowNumber, message: "El equipo no es válido." });
      return;
    }
    const vehicleRaw = value("clase");
    if (vehicleRaw && !isVehicleClassId(vehicleRaw)) {
      errors.push({ row: rowNumber, message: "La clase de vehículo no es válida." });
      return;
    }
    const rateKind = value("tipo");
    if (!(RATE_KINDS as readonly string[]).includes(rateKind)) {
      errors.push({ row: rowNumber, message: "El tipo de tarifa no es válido." });
      return;
    }
    if (!/^\d+$/.test(value("monto")) || Number(value("monto")) <= 0) {
      errors.push({ row: rowNumber, message: "El monto debe ser un entero positivo." });
      return;
    }
    const minimo = value("minimo");
    if (minimo && (!/^\d+$/.test(minimo) || Number(minimo) <= 0)) {
      errors.push({ row: rowNumber, message: "El mínimo debe ser un entero positivo." });
      return;
    }
    const key = `${lane.id}:${equipment}`;
    if (seen.has(key)) {
      errors.push({ row: rowNumber, message: "La ruta y el equipo están repetidos." });
      return;
    }
    seen.add(key);
    lines.push({
      laneId: lane.id,
      equipment: equipment as EquipmentId,
      vehicleClass: vehicleRaw ? (vehicleRaw as VehicleClassId) : null,
      rateKind: rateKind as (typeof RATE_KINDS)[number],
      amountClp: Number(value("monto")),
      minChargeClp: minimo ? Number(minimo) : null,
      notes: value("notas") || null,
    });
  });
  if (errors.length) return { errors };
  const id = randomUUID();
  const now = nowIso();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO ops_rate_cards (id, contract_id, shipper_org_id, carrier_org_id, name, status, valid_from, valid_to, version, approved_by, approved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'borrador', ?, ?, 1, NULL, NULL, ?, ?)`,
    ).run(id, input.contractId ?? null, input.shipperOrgId, carrier, input.name, input.validFrom, input.validTo, now, now);
    insertLines(id, lines);
    auditStrict(user, "ops.tarifa_importada", { type: "ops_tarifa", id }, { lineas: lines.length }, ip);
  });
  save();
  return { rateCard: toRate(loadRate(id)!) };
}

export function listSlas(user: PublicUser, contractId: string) {
  const contract = requireContract(user, contractId, "ver");
  return listSlaRows(contract.id).map(toSla);
}

export function createSla(user: PublicUser, body: unknown, ip: string | null) {
  const input = parseBody(slaSchema, body);
  const contract = requireContract(user, input.contractId, "editar");
  if (contract.status === "vigente") throw new AppError("El contrato vigente no se modifica. Genera una versión nueva.");
  if (contract.status !== "borrador" && contract.status !== "en_revision") throw new AppError("Ese contrato ya no admite SLA.");
  assertPercent(input.unit, input.target);
  const id = randomUUID();
  const db = getDb();
  const save = db.transaction(() => {
    db.prepare(`INSERT INTO ops_slas (id, contract_id, metric, target, unit, tolerance, penalty_note) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      contract.id,
      input.metric,
      input.target,
      input.unit,
      input.tolerance ?? null,
      input.penaltyNote ?? null,
    );
    auditStrict(user, "ops.sla_creado", { type: "ops_sla", id }, { contractId: contract.id, metric: input.metric }, ip);
  });
  save();
  return toSla(db.prepare(`SELECT * FROM ops_slas WHERE id = ?`).get(id) as SlaRow);
}

export function updateSla(user: PublicUser, id: string, body: unknown, ip: string | null) {
  const input = parseBody(slaPatchSchema, body);
  const db = getDb();
  const current = db.prepare(`SELECT * FROM ops_slas WHERE id = ?`).get(id) as SlaRow | undefined;
  if (!current) throw new AppError("No encontrado.", 404);
  const contract = requireContract(user, current.contract_id, "editar");
  if (contract.status === "vigente") {
    throw new AppError("El SLA de un contrato vigente queda intacto. Edita el contrato para abrir una versión nueva.", 409);
  }
  if (contract.status !== "borrador" && contract.status !== "en_revision") throw new AppError("Ese SLA ya no se puede editar.");
  const next = {
    metric: input.metric ?? current.metric,
    target: input.target ?? current.target,
    unit: input.unit ?? current.unit,
    tolerance: input.tolerance === undefined ? current.tolerance : input.tolerance,
    penaltyNote: input.penaltyNote === undefined ? current.penalty_note : input.penaltyNote,
  };
  assertPercent(next.unit, next.target);
  const save = db.transaction(() => {
    db.prepare(`UPDATE ops_slas SET metric = ?, target = ?, unit = ?, tolerance = ?, penalty_note = ? WHERE id = ?`).run(next.metric, next.target, next.unit, next.tolerance, next.penaltyNote, current.id);
    auditStrict(user, "ops.sla_editado", { type: "ops_sla", id: current.id }, { contractId: contract.id }, ip);
  });
  save();
  return toSla(db.prepare(`SELECT * FROM ops_slas WHERE id = ?`).get(current.id) as SlaRow);
}
