export const ROLES = ["transportista", "mandante", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const VERIFICATION = ["pendiente", "verificado", "rechazado"] as const;
export type VerificationStatus = (typeof VERIFICATION)[number];

export const EQUIPMENT_IDS = [
  "rampla_plana",
  "sider",
  "furgon_seco",
  "refrigerado",
  "cama_baja",
  "tolva",
  "estanque",
  "portacontenedor",
  "camion_34",
  "portaautos",
  "peligrosa",
  "otro",
] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

export type FieldKind = "number" | "bool" | "select" | "text";

export type SpecField = {
  key: string;
  label: string;
  kind: FieldKind;
  unit?: string;
  step?: number;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export type Specs = Record<string, string | number | boolean>;

export type Equipment = {
  id: EquipmentId;
  label: string;
  icon: string;
  desc: string;
  home: boolean;
  highlight?: boolean;
  truckFields: SpecField[];
  loadFields: SpecField[];
};

export type Zone = "norte" | "centro" | "sur";

export type Region = {
  id: string;
  numeral: string;
  name: string;
  zone: Zone;
};

export type City = {
  name: string;
  region: string;
  regionId: string;
  zone: Zone;
};

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
  razonSocial: string;
  rut: string;
  contactName: string;
  whatsapp: string;
  city: string;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  /** Último día del periodo gratis de 30 días desde la inscripción (YYYY-MM-DD); null para administradores. */
  freeUntil: string | null;
  /**
   * Verificación manual del administrador: fecha ISO (UTC) hasta la que la cuenta tiene acceso de solo lectura
   * (estado efectivo "manual_readonly"); null si no está vigente. Ver src/lib/manual-readonly.ts.
   */
  manualReadonlyUntil?: string | null;
};

export type SessionUser = PublicUser;

export type LoadCore = {
  equipment: EquipmentId;
  weightT: number;
  origin: string;
  destination: string;
  pickupDate: string;
  specs: Specs;
};

export type TruckCore = {
  equipment: EquipmentId;
  tonnage: number;
  origin: string;
  destination: string;
  availableFrom: string;
  availableTo: string;
  specs: Specs;
};

export type MatchResult = {
  score: number;
  reasons: string[];
  warnings: string[];
};

export type LoadPublic = LoadCore & {
  contactHidden?: boolean;
  id: string;
  ownerId: string;
  ownerName: string;
  ownerVerification: VerificationStatus;
  ownerDocsOk: boolean;
  whatsapp: string;
  description: string;
  budgetClp: number | null;
  notes: string | null;
  soloVerificados: boolean;
  inmediata: boolean;
  tripStatus: "asignado" | "en_camino" | "retirado" | "en_transito" | "incidencia" | "entregado" | null;
  isDemo: boolean;
  /** Estado de la solicitud de transporte (fase 1 tipo inDrive). */
  status: LoadStatus;
  offersUntil: string | null;
  /** null = usa el valor por defecto del administrador. */
  allowImprove: boolean | null;
  awardedOfferId: string | null;
  offerCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LoadStatus = "abierta" | "adjudicada" | "cerrada";

export type TruckPublic = TruckCore & {
  contactHidden?: boolean;
  id: string;
  ownerId: string;
  ownerName: string;
  ownerVerification: VerificationStatus;
  ownerDocsOk: boolean;
  whatsapp: string;
  notes: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TruckMatch = MatchResult & {
  truck: Pick<
    TruckPublic,
    | "id"
    | "origin"
    | "destination"
    | "tonnage"
    | "availableFrom"
    | "availableTo"
    | "ownerName"
    | "whatsapp"
    | "isDemo"
    | "equipment"
    | "ownerVerification"
  >;
};

export type LoadMatch = MatchResult & {
  load: Pick<
    LoadPublic,
    | "id"
    | "origin"
    | "destination"
    | "weightT"
    | "pickupDate"
    | "description"
    | "ownerName"
    | "whatsapp"
    | "isDemo"
    | "equipment"
    | "soloVerificados"
  >;
};

export type LoadListItem = LoadPublic & { matches: TruckMatch[] };
export type TruckListItem = TruckPublic & { matches: LoadMatch[] };

export type DocAudience = "camion" | "personal";

export type DocumentRecord = {
  id: string;
  userId: string;
  truckId: string | null;
  audience: DocAudience;
  type: string;
  detail: string | null;
  holderName: string | null;
  expiry: string;
  fileName: string | null;
  storedPath: string | null;
  mime: string | null;
  sizeBytes: number | null;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  createdAt: string;
};

export type LoadFilters = {
  equipo?: string;
  regionOrigen?: string;
  regionDestino?: string;
  origen?: string;
  destino?: string;
  desde?: string;
  pesoMin?: string;
  q?: string;
  verificados?: string;
  inmediata?: string;
  orden?: string;
};

export type TruckFilters = {
  equipo?: string;
  regionOrigen?: string;
  regionDestino?: string;
  origen?: string;
  destino?: string;
  dia?: string;
  capacidadMin?: string;
  verificados?: string;
  orden?: string;
};
