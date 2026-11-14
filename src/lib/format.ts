export function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/panel";
  return value;
}

export function todayChile(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 864e5,
  );
}

export function formatDateCL(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts;
  return `${day}-${month}-${year}`;
}

export function waLink(number: string, text: string): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function formatWhatsappDisplay(digits: string): string {
  if (/^569\d{8}$/.test(digits)) {
    return `+56 9 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  return digits;
}

export function formatClp(value: number): string {
  return value.toLocaleString("es-CL");
}

export function rutBody(value: string): string {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function rutDv(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return "0";
  if (rest === 10) return "K";
  return String(rest);
}

export function isValidRut(value: string): boolean {
  const raw = rutBody(value);
  if (raw.length < 8 || raw.length > 9) return false;
  const body = raw.slice(0, -1);
  const dv = raw.slice(-1);
  if (!/^\d+$/.test(body) || Number.parseInt(body, 10) < 1_000_000) return false;
  return rutDv(body) === dv;
}

export function formatRut(value: string): string {
  const raw = rutBody(value);
  if (raw.length < 2) return raw;
  const body = raw.slice(0, -1);
  const dv = raw.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

export function normalizeWhatsapp(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return /^569\d{8}$/.test(digits) ? digits : null;
}

export function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value) && value.length <= 160;
}

export type Light = "verde" | "amarillo" | "rojo" | "gris";

export function expiryStatus(expiry: string | null | undefined, today: string): { light: Light; label: string } {
  if (!expiry) return { light: "gris", label: "Sin cargar" };
  const days = daysBetween(today, expiry);
  if (days < 0) return { light: "rojo", label: `Vencido hace ${-days} día(s)` };
  if (days <= 30) return { light: "amarillo", label: `Vence en ${days} día(s)` };
  return { light: "verde", label: `Vigente (${days} días)` };
}

export function worstLight(lights: Light[]): Light {
  if (lights.includes("rojo")) return "rojo";
  if (lights.includes("amarillo")) return "amarillo";
  if (lights.includes("verde")) return "verde";
  return "gris";
}

const LIGHT_PILL: Record<Light, string> = {
  verde: "ok",
  amarillo: "warn",
  rojo: "bad",
  gris: "gray",
};

export function lightPill(light: Light): string {
  return LIGHT_PILL[light];
}
