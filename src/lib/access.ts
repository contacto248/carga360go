import { redirect } from "next/navigation";
import { assertAccredited } from "./accreditation";
import { isCarrierLocked } from "./carrier";
import { stripContacts } from "./contact-filter";

export { stripContacts };
import { getCurrentUser } from "./current-user";
import { AppError } from "./errors";
import type { LoadListItem, PublicUser, TruckListItem } from "./types";

export const REVIEW_PATH = "/cuenta-en-revision";

/** Para páginas del marketplace: un transportista sin aprobar se redirige a su página de revisión. */
export async function marketplaceViewer(): Promise<PublicUser | null> {
  const user = await getCurrentUser();
  if (isCarrierLocked(user)) redirect(REVIEW_PATH);
  return user;
}

/** Para rutas API del marketplace: bloquea a transportistas sin aprobar. */
export function assertMarketplaceAccess(user: PublicUser | null) {
  if (isCarrierLocked(user)) {
    throw new AppError("Tu cuenta está en revisión. Valida tu documentación para ver cargas y camiones.", 403);
  }
}

/** Publicar cargas o camiones exige la cuenta 100% acreditada (los administradores quedan exentos). */
export function assertCanPublish(user: PublicUser | null) {
  assertMarketplaceAccess(user);
  if (!user) throw new AppError("Ingresa con tu cuenta para publicar.", 401);
  if (user.role !== "admin" && !user.emailVerifiedAt) {
    throw new AppError(
      "Confirma tu correo antes de publicar. Abre el enlace que te enviamos o pide otro en \"Mi cuenta\".",
      403,
      "correo_sin_verificar",
    );
  }
  assertAccredited(user, "publicar");
}

/**
 * Los datos de contacto (WhatsApp, correo, teléfono) de quien publica nunca se muestran en el listado ni en el detalle:
 * se revelan solo entre el mandante y el transportista elegido al adjudicar una oferta (ver offers.ts).
 * Solo el propio dueño y los administradores ven el contacto en sus publicaciones.
 */
export function canSeeContact(user: PublicUser | null): boolean {
  return user?.role === "admin";
}

function canSeeOwn(viewer: PublicUser | null, ownerId: string): boolean {
  return Boolean(viewer && (viewer.role === "admin" || viewer.id === ownerId));
}

export function redactLoad(load: LoadListItem, viewer: PublicUser | null): LoadListItem {
  if (viewer?.role === "admin") return load;
  // El dueño ve su propia publicación completa, pero no el contacto de los camiones sugeridos.
  if (canSeeOwn(viewer, load.ownerId)) {
    return { ...load, matches: load.matches.map((match) => ({ ...match, truck: { ...match.truck, ownerName: "", whatsapp: "" } })) };
  }
  return {
    ...load,
    contactHidden: true,
    ownerName: "",
    whatsapp: "",
    description: stripContacts(load.description),
    notes: null,
    matches: load.matches.map((match) => ({ ...match, truck: { ...match.truck, ownerName: "", whatsapp: "", notes: null } })),
  };
}

export function redactTruck(truck: TruckListItem, viewer: PublicUser | null): TruckListItem {
  if (viewer?.role === "admin") return truck;
  if (canSeeOwn(viewer, truck.ownerId)) {
    return { ...truck, matches: truck.matches.map((match) => ({ ...match, load: { ...match.load, ownerName: "", whatsapp: "", description: stripContacts(match.load.description) } })) };
  }
  return {
    ...truck,
    contactHidden: true,
    ownerName: "",
    whatsapp: "",
    notes: null,
    matches: truck.matches.map((match) => ({ ...match, load: { ...match.load, ownerName: "", whatsapp: "", description: stripContacts(match.load.description) } })),
  };
}
