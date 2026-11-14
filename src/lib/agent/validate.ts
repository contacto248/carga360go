import { normalizeChilePhone } from "../backup-contact";
import { formatWhatsappDisplay, isValidEmail, todayChile } from "../format";
import type { ContactType } from "./types";

/** Quita caracteres de control y espacios repetidos; corta al largo máximo. */
export function cleanText(raw: unknown, max: number): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Enmascara datos que no deben guardarse ni registrarse: números de tarjeta (13 a 19 dígitos)
 * y lo que venga después de "clave", "contraseña" o "password".
 */
export function redactSensitive(text: string): string {
  return text
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[número oculto]")
    .replace(/\b(clave|contrase(?:ñ|n)a|password|pass|pin)\b(\s*(?:es|:|=)?\s*)\S+/gi, "$1$2[oculto]");
}

export type ParsedContact = { value: string; type: ContactType; display: string };

/** Teléfono chileno (celular o fijo) o correo. */
export function parseContact(raw: string): ParsedContact | null {
  const text = raw.trim();
  const email = text.match(/[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}/i)?.[0]?.toLowerCase();
  if (email && isValidEmail(email)) return { value: email, type: "email", display: email };
  const digits = text.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 8) return null;
  const phone = normalizeChilePhone(digits);
  if (!phone) return null;
  const display = /^569\d{8}$/.test(phone) ? formatWhatsappDisplay(phone) : `+56 ${phone.slice(2, 3)} ${phone.slice(3, 7)} ${phone.slice(7)}`;
  return { value: phone, type: "telefono", display };
}

/** Fecha requerida: "hoy", "mañana", "pasado mañana", "lo antes posible", dd-mm, dd-mm-aaaa o aaaa-mm-dd. Devuelve ISO o "lo antes posible". */
export function parseDate(raw: string, now = new Date()): string | null {
  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const today = todayChile(now);
  const addDays = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (/\b(lo antes posible|urgente|cuanto antes|inmediat)/.test(t)) return "lo antes posible";
  if (/\bpasado manana\b/.test(t)) return addDays(2);
  if (/\bmanana\b/.test(t)) return addDays(1);
  if (/\bhoy\b/.test(t)) return today;
  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  let y: number, m: number, d: number;
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const cl = t.match(/\b(\d{1,2})[/.\- ](\d{1,2})(?:[/.\- ](\d{2,4}))?\b/);
    if (!cl) return null;
    d = Number(cl[1]);
    m = Number(cl[2]);
    y = cl[3] ? Number(cl[3].length === 2 ? `20${cl[3]}` : cl[3]) : Number(today.slice(0, 4));
    if (!cl[3]) {
      const candidate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (candidate < today) y += 1;
    }
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const isoDate = date.toISOString().slice(0, 10);
  if (isoDate < today) return null;
  if (isoDate > addDays(366)) return null;
  return isoDate;
}

/** Peso en toneladas a partir de "12 t", "12 toneladas", "800 kg", "12.5". Devuelve null si no hay número. */
export function parseWeightT(raw: string): number | null {
  const t = raw.toLowerCase().replace(",", ".");
  const match = t.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|kilos|t\b|ton|tons|tonelada|toneladas)?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2] || "";
  const tons = unit.startsWith("k") ? value / 1000 : value;
  if (tons > 200) return null;
  return Math.round(tons * 1000) / 1000;
}

const YES = /^(si|sí|s|ok|okay|dale|confirmo|confirmar|correcto|de acuerdo|perfecto|claro|ya|bueno|si confirmo|sí, confirmar|si, confirmar)\b/i;
const NO = /^(no|nop|negativo|todavia no|aun no)\b/i;

export function isYes(text: string): boolean {
  return YES.test(text.trim().toLowerCase());
}

export function isNo(text: string): boolean {
  return NO.test(text.trim().toLowerCase());
}

export function isSkip(text: string): boolean {
  return /^(omitir|saltar|no tengo|ninguno|ninguna|no|nada|sin respaldo|no gracias|paso)\b/i.test(text.trim());
}

/** Texto para voz: sin enlaces, sin emojis y sin asteriscos de formato. */
export function toSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "el enlace que aparece en pantalla")
    .replace(/\*/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[•·]/g, ",")
    .replace(/\n+/g, ". ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}
