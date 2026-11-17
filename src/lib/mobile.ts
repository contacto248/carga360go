/**
 * API para las apps móviles (Expo). Mismo SQLite, mismas cuentas y mismas reglas que la web:
 * reutiliza auth, access (bloqueo de transportistas) y listings/documents. Autenticación con
 * `Authorization: Bearer <token>`; el token es una fila de la tabla `sessions` (igual que la cookie).
 *
 * Los handlers son funciones puras Request -> Response para poder probarlos sin Next.
 */
import { accreditationOf } from "./accreditation";
import { assertSameOrigin } from "./api";
import { audit } from "./audit";
import { notifyDocumentUploaded, notifyNewRegistration } from "./admin-notify";
import fs from "fs";
import { queueAlert } from "./alerts";
import { assertCanPublish, assertMarketplaceAccess, canSeeContact, loadForViewer, redactLoad, redactTruck } from "./access";
import {
  SESSION_TTL_MS,
  deleteOwnAccount,
  loginUser,
  registerUser,
  revokeToken,
  sessionExpiresAt,
} from "./auth";
import { carrierChecklist, isCarrierLocked, reopenAfterUpload, REQUIRED_CARRIER_DOCS } from "./carrier";
import { needsBackupContact } from "./backup-contact";
import { accountStateOf, manualReadonlyOf } from "./manual-readonly";
import { BRAND, CITIES, DOC_TYPES, EQUIPMENT, REGIONS, docTypeById, docTypeLabel } from "./catalog";
import { getDb } from "./db";
import {
  addDocument,
  getDocument,
  listDocuments,
  maxUploadBytes,
  readDocumentFile,
  removeDocument,
  resolveStored,
  type StoredFile,
} from "./documents";
import { AppError } from "./errors";
import { FREE_DAYS } from "./campaign";
import { assertLegalAccepted, privacyVersion, termsVersion } from "./privacy";
import { createLoad, createTruck, deleteLoad, deleteTruck, getTruck, listLoads, listTrucks } from "./listings";
import { loadFromPayload, truckFromPayload } from "./payload";
import { LOGIN_LIMIT, REGISTER_LIMIT, rateLimit } from "./rate-limit";
import { bearerToken, clientIp, userFromHeaders } from "./request-auth";
import type { DocumentRecord, LoadPublic, PublicUser, TruckPublic } from "./types";
import { startEmailVerification } from "./verification";

const SITE = "https://www.carga360go.cl";
const NO_STORE = { "cache-control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** Envuelve un handler: errores conocidos -> {error} con su código; el resto -> 500 genérico.
 *  Las mutaciones usan el mismo assertSameOrigin que la web. Bearer sin cookie queda exento. */
export function mobile(handler: (request: Request, id?: string) => Promise<Response> | Response) {
  return async (request: Request, id?: string): Promise<Response> => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
      return await handler(request, id);
    } catch (error) {
      if (error instanceof AppError) return json(error.code ? { error: error.message, code: error.code } : { error: error.message }, error.status);
      console.error("[carga360go] Error en API móvil", error);
      return json({ error: "Error interno." }, 500);
    }
  };
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AppError("El cuerpo de la solicitud no es JSON válido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("El cuerpo de la solicitud no es JSON válido.");
  }
  return value as Record<string, unknown>;
}

function requireUserFrom(request: Request): PublicUser {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

// ---------- Perfil y estado de acceso ----------

export type MobileKind = "transportista" | "generador";

function kindOf(user: PublicUser): MobileKind {
  return user.role === "transportista" ? "transportista" : "generador";
}

export function gateOf(user: PublicUser) {
  const locked = isCarrierLocked(user);
  const checklist = user.role === "transportista" ? carrierChecklist(user.id) : null;
  const acc = accreditationOf(user.id);
  return {
    /** "aprobado" = puede usar la bolsa; "pendiente" = en revisión; "rechazado" = debe corregir documentos. */
    state: !locked ? "aprobado" : user.verificationStatus === "rechazado" ? "rechazado" : "pendiente",
    locked,
    verificationStatus: user.verificationStatus,
    note: user.verificationNote,
    canSeeMarketplace: !locked,
    canSeeContact: canSeeContact(user),
    accredited: acc.accredited,
    /** true si debe aceptar la versión vigente de la Política de Privacidad y/o de los Términos de uso (POST /api/cuenta/privacidad con acceptPrivacy y acceptTerms). */
    privacyRequired: !acc.privacyAccepted && user.role !== "admin",
    freeUntil: user.freeUntil,
    accreditation: acc.items.map(({ key, label, ok, hint }) => ({ key, label, ok, hint })),
    canPublishLoads: !locked && acc.accredited && (user.role === "mandante" || user.role === "admin"),
    canPublishTrucks: !locked && acc.accredited && (user.role === "transportista" || user.role === "admin"),
    canOffer: acc.accredited && user.role === "transportista",
    reviewUrl: `${SITE}/cuenta-en-revision`,
    checklist,
    /** Estado efectivo: "verificado" | "manual_readonly" (solo lectura por verificación manual) | "pendiente" | "rechazado". */
    accountState: accountStateOf(user),
    /** Fecha ISO hasta la que dura la solo lectura manual; null si no aplica. Mientras dure no puede publicar ni ofertar. */
    readonlyUntil: manualReadonlyOf(user.id).active ? manualReadonlyOf(user.id).until : null,
    /** true si la verificación está pendiente y aún no deja un teléfono o correo de respaldo (se guarda en PATCH /api/cuenta). */
    backupContactRequired: needsBackupContact(user.id),
  };
}

export function profileOf(user: PublicUser) {
  return {
    id: user.id,
    kind: kindOf(user),
    role: user.role,
    razonSocial: user.razonSocial,
    rut: user.rut,
    contactName: user.contactName,
    email: user.email,
    whatsapp: user.whatsapp,
    city: user.city,
    verificationStatus: user.verificationStatus,
    verificationNote: user.verificationNote,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    createdAt: user.createdAt,
  };
}

function account(user: PublicUser, token: string) {
  return {
    token,
    tokenType: "Bearer",
    expiresAt: sessionExpiresAt(token) ?? new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    profile: profileOf(user),
    gate: gateOf(user),
  };
}

function roleFromBody(value: Record<string, unknown>): string {
  const raw = String(value.role ?? value.kind ?? "").trim().toLowerCase();
  if (raw === "generador" || raw === "mandante") return "mandante";
  if (raw === "transportista") return "transportista";
  if (raw === "ambos") throw new AppError("En Carga360go cada cuenta es transportista o mandante. Elige una.");
  return raw;
}

export const register = mobile(async (request) => {
  rateLimit(`register:${clientIp(request.headers)}`, REGISTER_LIMIT.limit, REGISTER_LIMIT.windowMs);
  const data = await body(request);
  const role = roleFromBody(data);
  if (role !== "mandante" && role !== "transportista") throw new AppError("Elige si eres transportista o mandante.");
  const { privacyVersion, termsVersion } = assertLegalAccepted(data);
  const result = registerUser({
    role,
    razonSocial: String(data.razonSocial ?? ""),
    rut: String(data.rut ?? ""),
    contactName: String(data.contactName ?? ""),
    email: String(data.email ?? ""),
    password: String(data.password ?? ""),
    whatsapp: String(data.whatsapp ?? ""),
    city: String(data.city ?? ""),
    privacyVersion,
    termsVersion,
    // Opcional en la app (compatibilidad con versiones ya publicadas); si falta, gate.backupContactRequired lo pide después.
    backupContact: data.backupContact == null ? null : String(data.backupContact),
  });
  audit(result.user, "usuario.registro", { type: "usuario", id: result.user.id }, { role: result.user.role, canal: "app" }, clientIp(request.headers));
  audit(result.user, "usuario.privacidad_aceptada", { type: "usuario", id: result.user.id }, { version: privacyVersion, terminos: termsVersion, canal: "app" }, clientIp(request.headers));
  notifyNewRegistration(result.user);
  try {
    await startEmailVerification(result.user, { skipRate: true });
  } catch (error) {
    console.error("[carga360go] No se pudo iniciar la verificación de correo", error);
  }
  return json(account(result.user, result.token), 201);
});

export const login = mobile(async (request) => {
  rateLimit(`login:${clientIp(request.headers)}`, LOGIN_LIMIT.limit, LOGIN_LIMIT.windowMs);
  const data = await body(request);
  const result = loginUser(String(data.email ?? ""), String(data.password ?? ""));
  return json(account(result.user, result.token));
});

export const logout = mobile((request) => {
  revokeToken(bearerToken(request.headers));
  return json({ ok: true });
});

export const me = mobile((request) => {
  const user = requireUserFrom(request);
  return json({ ...profileOf(user), profile: profileOf(user), gate: gateOf(user) });
});

export const deleteMe = mobile((request) => {
  const user = requireUserFrom(request);
  const { storedPaths } = deleteOwnAccount(user.id);
  for (const stored of storedPaths) {
    try {
      fs.rmSync(resolveStored(stored), { force: true });
    } catch (error) {
      console.error("[carga360go] No se pudo borrar un archivo de la cuenta eliminada", error);
    }
  }
  return noContent();
});

// ---------- Publicaciones ----------

function viewerAllowed(request: Request): PublicUser | null {
  const viewer = userFromHeaders(request.headers);
  assertMarketplaceAccess(viewer);
  return viewer;
}

function mobileLoad(load: LoadPublic) {
  return {
    id: load.id,
    createdAt: load.createdAt,
    updatedAt: load.updatedAt,
    demo: load.isDemo || undefined,
    ...(load.ownerId ? { ownerId: load.ownerId } : {}),
    ownerName: load.ownerName,
    whatsapp: load.whatsapp,
    contactHidden: load.contactHidden ?? false,
    ownerVerification: load.ownerVerification,
    ownerDocsOk: load.ownerDocsOk,
    origin: load.origin,
    destination: load.destination,
    pickupDate: load.pickupDate,
    equipment: load.equipment,
    description: load.description,
    weightT: load.weightT,
    specs: load.specs,
    budgetClp: load.budgetClp ?? undefined,
    notes: load.notes ?? undefined,
    soloVerificados: load.soloVerificados,
    url: `${SITE}/cargas/${load.id}`,
  };
}

function mobileTruck(truck: TruckPublic) {
  return {
    id: truck.id,
    createdAt: truck.createdAt,
    updatedAt: truck.updatedAt,
    demo: truck.isDemo || undefined,
    ...(truck.ownerId ? { ownerId: truck.ownerId } : {}),
    ownerName: truck.ownerName,
    whatsapp: truck.whatsapp,
    contactHidden: truck.contactHidden ?? false,
    ownerVerification: truck.ownerVerification,
    ownerDocsOk: truck.ownerDocsOk,
    origin: truck.origin,
    destination: truck.destination,
    availableFrom: truck.availableFrom,
    availableTo: truck.availableTo,
    equipment: truck.equipment,
    tonnage: truck.tonnage,
    specs: truck.specs,
    notes: truck.notes ?? undefined,
    url: `${SITE}/camiones/${truck.id}`,
  };
}

function param(url: URL, ...names: string[]): string {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value) return value;
  }
  return "";
}

export const loads = mobile((request) => {
  const viewer = viewerAllowed(request);
  const url = new URL(request.url);
  const items = listLoads({
    equipo: param(url, "equipment", "equipo"),
    regionOrigen: param(url, "originRegion", "regionOrigen"),
    regionDestino: param(url, "destinationRegion", "regionDestino"),
    origen: param(url, "origin", "origen"),
    destino: param(url, "destination", "destino"),
    desde: param(url, "from", "desde"),
    pesoMin: param(url, "minWeight", "pesoMin"),
    q: param(url, "query", "q"),
    verificados: param(url, "verifiedOnly", "verificados"),
    orden: param(url, "sort", "orden"),
  });
  return json(items.slice(0, 200).map((item) => mobileLoad(redactLoad(item, viewer))));
});

export const load = mobile((request, id) => {
  const viewer = viewerAllowed(request);
  const visible = id ? loadForViewer(id, viewer) : null;
  if (!visible) throw new AppError("Carga no encontrada.", 404);
  return json(mobileLoad(visible.load));
});

export const createLoadMobile = mobile(async (request) => {
  const user = requireUserFrom(request);
  assertCanPublish(user);
  rateLimit(`publish:${user.id}`, 30, 60 * 60 * 1000);
  const data = await body(request);
  const created = createLoad(
    user,
    loadFromPayload({ ...data, weightT: data.weightT ?? data.weight, budgetClp: data.budgetClp ?? data.budget }),
  );
  queueAlert("carga", created.id);
  return json(mobileLoad(created), 201);
});

export const deleteLoadMobile = mobile((request, id) => {
  const user = requireUserFrom(request);
  assertMarketplaceAccess(user);
  deleteLoad(user, id ?? "");
  return noContent();
});

export const trucks = mobile((request) => {
  const viewer = viewerAllowed(request);
  const url = new URL(request.url);
  const items = listTrucks({
    equipo: param(url, "equipment", "equipo"),
    regionOrigen: param(url, "originRegion", "regionOrigen"),
    regionDestino: param(url, "destinationRegion", "regionDestino"),
    origen: param(url, "origin", "origen"),
    destino: param(url, "destination", "destino"),
    dia: param(url, "onDate", "dia"),
    capacidadMin: param(url, "minTonnage", "capacidadMin"),
    verificados: param(url, "verifiedOnly", "verificados"),
    orden: param(url, "sort", "orden"),
  });
  return json(items.slice(0, 200).map((item) => mobileTruck(redactTruck(item, viewer))));
});

export const truck = mobile((request, id) => {
  const viewer = viewerAllowed(request);
  const item = id ? getTruck(id) : null;
  if (!item) throw new AppError("Camión no encontrado.", 404);
  return json(mobileTruck(redactTruck(item, viewer)));
});

export const createTruckMobile = mobile(async (request) => {
  const user = requireUserFrom(request);
  assertCanPublish(user);
  rateLimit(`publish:${user.id}`, 30, 60 * 60 * 1000);
  const created = createTruck(user, truckFromPayload(await body(request)));
  queueAlert("camion", created.id);
  return json(mobileTruck(created), 201);
});

export const deleteTruckMobile = mobile((request, id) => {
  const user = requireUserFrom(request);
  assertMarketplaceAccess(user);
  deleteTruck(user, id ?? "");
  return noContent();
});

// ---------- Documentos (privados, solo el dueño) ----------

function mobileDoc(doc: DocumentRecord) {
  return {
    id: doc.id,
    type: doc.type,
    label: docTypeLabel(doc.type),
    audience: doc.audience,
    expiry: doc.expiry,
    truckId: doc.truckId ?? undefined,
    holderName: doc.holderName ?? undefined,
    detail: doc.detail ?? undefined,
    fileName: doc.fileName ?? undefined,
    contentType: doc.mime ?? undefined,
    sizeBytes: doc.sizeBytes ?? undefined,
    hasFile: Boolean(doc.storedPath),
    verificationStatus: doc.verificationStatus,
    verificationNote: doc.verificationNote ?? undefined,
    createdAt: doc.createdAt,
  };
}

export const documents = mobile((request) => {
  const user = requireUserFrom(request);
  return json(listDocuments(user.id).map(mobileDoc));
});

function decodeBase64(value: string): Buffer {
  const clean = value.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean)) throw new AppError("El archivo no viene en base64 válido.");
  return Buffer.from(clean, "base64");
}

export const uploadDocument = mobile(async (request) => {
  const user = requireUserFrom(request);
  const contentType = request.headers.get("content-type") ?? "";
  let fields: Record<string, unknown>;
  let file: StoredFile | null = null;
  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    const form = await request.formData();
    fields = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string"));
    const value = form.get("file");
    if (value instanceof File && value.size > 0) {
      file = { buffer: Buffer.from(await value.arrayBuffer()), originalName: value.name || "documento", mime: value.type };
    }
  } else {
    fields = await body(request);
    const data = String(fields.dataBase64 ?? "");
    if (data) {
      const buffer = decodeBase64(data);
      if (buffer.length > maxUploadBytes()) throw new AppError("El archivo supera el tamaño máximo permitido (10 MB).", 413);
      file = { buffer, originalName: String(fields.fileName ?? "") || "documento", mime: String(fields.contentType ?? "") };
    }
  }
  if (!file) throw new AppError("Adjunta el archivo del documento (PDF, JPG o PNG, máximo 10 MB).");
  if (file.buffer.length > maxUploadBytes()) throw new AppError("El archivo supera el tamaño máximo permitido (10 MB).", 413);
  const type = String(fields.type ?? "");
  const def = docTypeById(type);
  // Documentos personales: si la app no manda titular, se usa el nombre de contacto de la cuenta.
  const holderName = String(fields.holderName ?? "").trim() || (def?.audience === "personal" ? user.contactName : "");
  const doc = addDocument(user, {
    type,
    expiry: String(fields.expiry ?? ""),
    truckId: String(fields.truckId ?? "") || null,
    holderName,
    detail: String(fields.detail ?? ""),
    file,
  });
  reopenAfterUpload(user);
  audit(user, "documento.subido", { type: "documento", id: doc.id }, docTypeLabel(doc.type));
  notifyDocumentUploaded(user, docTypeLabel(doc.type));
  return json(mobileDoc(doc), 201);
});

export const documentFile = mobile(async (request, id) => {
  const user = requireUserFrom(request);
  const file = readDocumentFile(user, id ?? "");
  const bytes = new Uint8Array(await fs.promises.readFile(file.filePath));
  return new Response(bytes, {
    headers: {
      "content-type": file.mime,
      "content-disposition": `attachment; filename="${file.fileName.replace(/["\\\r\n]/g, "")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

export const deleteDocument = mobile((request, id) => {
  const user = requireUserFrom(request);
  if (!getDocument(id ?? "")) throw new AppError("Documento no encontrado.", 404);
  removeDocument(user, id ?? "");
  return noContent();
});

// ---------- Utilidades ----------

export const health = mobile(() => {
  getDb().prepare(`SELECT 1 AS ok`).get();
  return json({ ok: true, database: true, documents: "private", auth: "bearer" });
});

export const catalog = mobile(() =>
  json({
    company: { name: BRAND.company, rut: BRAND.rut, privacyUrl: `${SITE}/privacidad`, privacyVersion: privacyVersion(), privacyAcceptField: "acceptPrivacy", termsUrl: `${SITE}/terminos`, termsVersion: termsVersion(), termsAcceptField: "acceptTerms", acceptUrl: `${SITE}/api/cuenta/privacidad`, freeDays: FREE_DAYS },
    regions: REGIONS,
    cities: CITIES.map((city) => ({ name: city.name, regionId: city.regionId, region: city.region, zone: city.zone })),
    equipment: EQUIPMENT.map((item) => ({
      id: item.id,
      label: item.label,
      desc: item.desc,
      truckFields: item.truckFields,
      loadFields: item.loadFields,
    })),
    documentTypes: DOC_TYPES.map((doc) => ({
      id: doc.id,
      label: doc.label,
      audience: doc.audience,
      details: doc.details ?? undefined,
      requiredForCarrier: (REQUIRED_CARRIER_DOCS as readonly string[]).includes(doc.id),
    })),
    requiredCarrierDocs: REQUIRED_CARRIER_DOCS,
  }),
);

export const notSupported = mobile(() =>
  json({ error: "Esta función no está disponible en Carga360go. Publica desde la app o la web." }, 501),
);
