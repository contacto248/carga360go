/**
 * Prepara una BD TEMPORAL para la prueba de humo local (nunca producción): un administrador y una cuenta pendiente.
 * Uso: DATABASE_PATH=/tmp/x.sqlite SMOKE_ADMIN_PASSWORD=... npx tsx scripts/smoke-prep.ts
 * Imprime JSON con los ids. Se niega a correr si DATABASE_PATH apunta a /var/lib/carga360go.
 */
import { registerUser, upsertAdmin } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/privacy";

const file = process.env.DATABASE_PATH || "";
if (!file || file.startsWith("/var/lib/carga360go") || file.includes("/opt/carga360go")) {
  console.error("smoke-prep: usa una base temporal.");
  process.exit(1);
}
const password = process.env.SMOKE_ADMIN_PASSWORD || "";
if (password.length < 12) {
  console.error("smoke-prep: define SMOKE_ADMIN_PASSWORD (12+ caracteres).");
  process.exit(1);
}
const admin = upsertAdmin({ email: "revision-admin@carga360go.test", password, razonSocial: "Admin humo", rut: "22.222.222-2", contactName: "Admin", whatsapp: "+56 9 1000 0010", city: "Santiago" });
const pending = registerUser({
  role: "transportista",
  razonSocial: "Transportes Humo",
  rut: "41.234.567-4".replace(/-\d$/, "") + "-" + dv("41234567"),
  contactName: "Pedro Humo",
  email: "pedro.humo@carga360go.test",
  password: "Camino-Largo-2026",
  whatsapp: "+56 9 4123 4567",
  city: "Antofagasta",
}).user;
const stamp = new Date().toISOString();
getDb().prepare(`UPDATE users SET privacy_version = ?, privacy_accepted_at = ?, terms_version = ?, terms_accepted_at = ? WHERE id IN (?, ?)`).run(PRIVACY_VERSION, stamp, TERMS_VERSION, stamp, pending.id, admin.id);
console.log(JSON.stringify({ adminId: admin.id, adminEmail: "revision-admin@carga360go.test", pendingId: pending.id, pendingEmail: "pedro.humo@carga360go.test" }));

function dv(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
