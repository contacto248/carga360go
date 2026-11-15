import { randomUUID } from "node:crypto";
import { REQUIRED_CARRIER_DOCS } from "../src/lib/carrier";
import { createSession, registerUser } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { todayChile } from "../src/lib/format";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";
import type { PublicUser } from "../src/lib/types";

let n = 0;
function rut(): string {
  n += 1;
  const body = String(41_000_000 + n * 7919 + Math.floor(Math.random() * 1000));
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return `${body}-${r === 11 ? "0" : r === 10 ? "K" : String(r)}`;
}

/** Cuenta de prueba verificada (con documentos aprobados si es transportista). Devuelve el usuario y su token de sesión. */
export function person(role: "mandante" | "transportista", tag: string, opts: { verified?: boolean } = {}): { user: PublicUser; token: string } {
  const unique = `${tag}-${randomUUID().slice(0, 6)}`;
  const { user, token } = registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: rut(),
    contactName: `Contacto ${tag}`,
    email: `${unique}@agente.test`,
    password: "Camino-Largo-2026",
    whatsapp: `+56 9 ${String(30000000 + Math.floor(Math.random() * 9_999_999)).slice(0, 8)}`,
    city: "La Serena",
  });
  const stamp = new Date().toISOString();
  const db = getDb();
  db.prepare(`UPDATE users SET privacy_version = ?, privacy_accepted_at = ?, terms_version = ?, terms_accepted_at = ? WHERE id = ?`).run(
    PRIVACY_VERSION,
    stamp,
    TERMS_VERSION,
    stamp,
    user.id,
  );
  if (opts.verified === false) return { user, token };
  db.prepare(
    `UPDATE users SET email_verified_at = ?, verification_status = 'verificado', phone_verified_at = ?, req_calidad = 'cumple', req_seguridad = 'cumple', req_medioambiente = 'no_aplica' WHERE id = ?`,
  ).run(stamp, stamp, user.id);
  if (role === "transportista") {
    for (const type of REQUIRED_CARRIER_DOCS) {
      db.prepare(
        `INSERT INTO documents (id, user_id, audience, type, holder_name, expiry, verification_status, created_at) VALUES (?, ?, ?, ?, ?, '2099-01-01', 'verificado', ?)`,
      ).run(randomUUID(), user.id, ["cedula", "licencia"].includes(type) ? "personal" : "camion", type, "Prueba", stamp);
    }
  }
  return { user: { ...user, emailVerifiedAt: stamp, phoneVerifiedAt: stamp, verificationStatus: "verificado" }, token };
}

/** Convierte en administrador y devuelve una sesión que ya pasó el código por correo (requisito de admin). */
export function makeAdmin(user: PublicUser): { user: PublicUser; token: string } {
  getDb().prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(user.id);
  return { user: { ...user, role: "admin" }, token: createSession(user.id, { mfa: true }) };
}

export function addDays(days: number): string {
  const [y, m, d] = todayChile().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
