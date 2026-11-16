import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}
import { assertCanPublish, redactLoad, redactTruck, stripContacts } from "../src/lib/access";
import { acceptPrivacyFor, accreditationOf, approveCarrier, privacyGateFor, setRequirement } from "../src/lib/accreditation";
import { registerUser } from "../src/lib/auth";
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { rutDv } from "../src/lib/format";
import type { LoadListItem, PublicUser, TruckListItem } from "../src/lib/types";

let seq = 41_000_000;
function newUser(role: "mandante" | "transportista", tag: string): PublicUser {
  seq += 1;
  return registerUser({
    role,
    razonSocial: `${role} ${tag}`,
    rut: `${seq}-${rutDv(String(seq))}`,
    contactName: `Contacto ${tag}`,
    email: `${tag}@acred.test`,
    password: "Camino-Largo-2026",
    whatsapp: "+56 9 5555 1234",
    city: "La Serena",
  }).user;
}

test("los textos libres no filtran teléfonos, correos ni enlaces", () => {
  assert.equal(stripContacts("Llamar al +56 9 8765 4321 o a juan@empresa.cl"), "Llamar al [contacto oculto] o a [contacto oculto]");
  assert.equal(stripContacts("ver www.mi-sitio.cl y https://x.cl/a"), "ver [contacto oculto] y [contacto oculto]");
  assert.equal(stripContacts("20 pallets, 18 t, presupuesto $12.000.000"), "20 pallets, 18 t, presupuesto $12.000.000");
  assert.equal(stripContacts("fono 987654321"), "fono [contacto oculto]");
});

test("contactos ocultos en listados para todos salvo dueño y admin", () => {
  const owner = newUser("mandante", "dueno");
  const other = newUser("transportista", "otro");
  const admin = { ...owner, id: "admin-x", role: "admin" } as PublicUser;
  const load = {
    id: "l1",
    ownerId: owner.id,
    ownerName: "Comercial Norte",
    whatsapp: "56955551234",
    description: "Pallets. Consultas al 9 8765 4321",
    notes: "Escribir a dueno@acred.test",
    matches: [{ score: 90, reasons: [], warnings: [], truck: { id: "t1", ownerName: "Transportes Sur", whatsapp: "56911112222", notes: "x" } }],
  } as unknown as LoadListItem;
  for (const viewer of [null, other]) {
    const seen = redactLoad(load, viewer);
    assert.equal(seen.whatsapp, "");
    assert.equal(seen.ownerName, "");
    assert.equal(seen.contactHidden, true);
    assert.equal(seen.notes, null);
    assert.doesNotMatch(seen.description, /8765/);
    assert.equal(seen.matches[0].truck.whatsapp, "");
    assert.equal("ownerId" in seen, false, "la vista pública no debe exponer ownerId");
  }
  const own = redactLoad(load, owner);
  assert.equal(own.whatsapp, "56955551234");
  assert.equal(own.ownerId, owner.id);
  assert.equal(own.matches[0].truck.whatsapp, "", "el dueño no ve el contacto de camiones sugeridos");
  assert.equal(redactLoad(load, admin).matches[0].truck.whatsapp, "56911112222");

  const truck = { id: "t2", ownerId: other.id, ownerName: "Transportes", whatsapp: "56933334444", notes: "n", matches: [] } as unknown as TruckListItem;
  assert.equal(redactTruck(truck, owner).whatsapp, "");
  assert.equal(redactTruck(truck, other).whatsapp, "56933334444");
});

test("mandante no publica hasta estar 100% acreditado y la revisión de requisitos se audita en el estado", () => {
  const user = newUser("mandante", "mandante-acred");
  getDb().prepare(`UPDATE users SET email_verified_at = ? WHERE id = ?`).run(new Date().toISOString(), user.id);
  const verified = { ...user, emailVerifiedAt: new Date().toISOString() };
  assert.throws(() => assertCanPublish(verified), (error: unknown) => error instanceof AppError && error.code === "sin_acreditacion");
  const before = accreditationOf(user.id);
  assert.deepEqual(
    before.items.map((item) => item.key),
    ["privacidad", "correo", "calidad", "seguridad", "medioambiente", "aprobacion"],
  );
  assert.throws(() => approveCarrier("admin", user.id), /privacidad/);
  acceptPrivacyFor(user.id);
  for (const key of ["calidad", "seguridad", "medioambiente"]) setRequirement(user.id, key, "cumple");
  approveCarrier("admin", user.id);
  assert.equal(accreditationOf(user.id).accredited, true);
  assert.doesNotThrow(() => assertCanPublish({ ...verified, verificationStatus: "verificado" }));
  // Si deja de cumplir un requisito, vuelve a revisión.
  setRequirement(user.id, "seguridad", "no_cumple");
  const after = accreditationOf(user.id);
  assert.equal(after.accredited, false);
  const status = getDb().prepare(`SELECT verification_status FROM users WHERE id = ?`).get(user.id) as { verification_status: string };
  assert.equal(status.verification_status, "pendiente");
});

test("cuentas existentes deben aceptar la Política de Privacidad vigente al ingresar", () => {
  const user = newUser("transportista", "antiguo");
  assert.deepEqual(privacyGateFor(user), { required: true, firstTime: true, privacy: true, terms: true });
  getDb().prepare(`UPDATE users SET privacy_version = '1.1-2026-11-10' WHERE id = ?`).run(user.id);
  assert.deepEqual(privacyGateFor(user), { required: true, firstTime: false, privacy: true, terms: true });
  acceptPrivacyFor(user.id);
  assert.deepEqual(privacyGateFor(user), { required: false, firstTime: false, privacy: false, terms: false });
  // Si cambia solo la versión de los Términos, se vuelve a pedir.
  getDb().prepare(`UPDATE users SET terms_version = '0.9' WHERE id = ?`).run(user.id);
  assert.deepEqual(privacyGateFor(user), { required: true, firstTime: false, privacy: false, terms: true });
  assert.equal(accreditationOf(user.id).privacyAccepted, false);
  assert.deepEqual(privacyGateFor(null), { required: false, firstTime: false, privacy: false, terms: false });
});
