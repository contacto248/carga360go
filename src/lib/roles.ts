import type { Role } from "./types";

export function canPublishLoad(role: Role): boolean {
  return role === "mandante" || role === "admin";
}

export function canPublishTruck(role: Role): boolean {
  return role === "transportista" || role === "admin";
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "transportista":
      return "Transportista";
    case "mandante":
      return "Mandante";
    case "admin":
      return "Administrador";
    default: {
      const neverRole: never = role;
      return neverRole;
    }
  }
}
