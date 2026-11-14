import { AppError } from "./errors";

/** Contraseñas demasiado comunes (lista corta, sin servicios externos). Se comparan en minúsculas. */
const COMMON = new Set(
  [
    "1234567890", "12345678910", "123456789012", "0123456789", "0987654321", "1111111111", "0000000000", "1234512345",
    "qwertyuiop", "qwerty12345", "qwerty123456", "asdfghjkl1", "zxcvbnm123", "password12", "password123", "password1234",
    "passw0rd123", "contraseña", "contraseña1", "contraseña123", "contrasena", "contrasena1", "contrasena123", "iloveyou12",
    "abc1234567", "abcd123456", "abcdefghij", "a123456789", "123456789a", "1q2w3e4r5t", "1qaz2wsx3edc", "admin12345",
    "administrador", "bienvenido1", "bienvenido123", "chile12345", "chile123456", "santiago123", "colocolo123", "universidad",
    "carga360go", "carga360go1", "carga360go123", "transporte", "transporte1", "transporte123", "camion12345", "camiones123",
    "welcome123", "letmein123", "football12", "superman12", "princesa12", "tequiero123", "teamo12345", "estrella123",
  ].map((value) => value.toLowerCase()),
);

export const PASSWORD_MIN = 10;

/** Política de contraseñas: mínimo 10 caracteres, máximo 200, no común, no repetitiva y distinta del correo. */
export function assertStrongPassword(password: string, email?: string) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    throw new AppError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
  }
  if (password.length > 200) throw new AppError("La contraseña es demasiado larga.");
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password) || /^(0123456789|1234567890|9876543210)+\d*$/.test(password)) {
    throw new AppError("Esa contraseña es muy común. Elige otra más difícil de adivinar.");
  }
  if (new Set(password).size < 4) throw new AppError("La contraseña es demasiado simple. Mezcla letras, números o símbolos.");
  if (email) {
    const local = email.split("@")[0]?.toLowerCase() || "";
    if (local.length >= 4 && lower.includes(local)) throw new AppError("La contraseña no puede contener tu correo.");
  }
}

/**
 * Patente chilena: formato antiguo AA·1234 (o AA·123 con 2 letras y 3–4 dígitos), formato nuevo BB·BB·12
 * (4 consonantes y 2 dígitos) y patentes de remolque/carro (ej. JA1234). Devuelve la patente normalizada o null.
 */
export function normalizePatente(value: string): string | null {
  const clean = (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{2}\d{4}$/.test(clean)) return clean;
  if (/^[A-Z]{4}\d{2}$/.test(clean)) return clean;
  if (/^[A-Z]{3}\d{3}$/.test(clean)) return clean; // motos y algunos remolques
  return null;
}

/** Montos en pesos: solo se exige un número entero mayor que 0 (sin mínimo ni máximo). */
export function cleanClp(value: unknown, label: string, required: boolean): number | null {
  if (value === null || value === undefined || value === "") {
    if (required) throw new AppError(`Indica ${label}.`);
    return null;
  }
  const amount = typeof value === "number" ? value : Number(String(value).replace(/[.\s$]/g, ""));
  if (!Number.isSafeInteger(amount)) throw new AppError(`${label} debe ser un número entero en pesos.`);
  if (amount <= 0) throw new AppError(`${label} debe ser mayor que 0.`);
  return amount;
}

/** Honeypot del formulario de registro: los bots rellenan el campo oculto o envían en menos de 2 s. */
export function assertHuman(body: Record<string, unknown>) {
  const trap = body.website ?? body.empresa_web;
  if (typeof trap === "string" && trap.trim() !== "") throw new AppError("No pudimos procesar el registro. Inténtalo de nuevo.", 400, "bot");
  const started = Number(body.formStartedAt);
  if (Number.isFinite(started) && started > 0 && Date.now() - started < 2000) {
    throw new AppError("Revisa tus datos y vuelve a enviar el formulario.", 400, "bot");
  }
}
