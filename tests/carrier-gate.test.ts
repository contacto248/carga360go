import assert from "node:assert/strict";
import { test } from "node:test";
import { registerUser } from "../src/lib/auth";
import { acceptPrivacyFor, accreditationOf, approveCarrier, setRequirement } from "../src/lib/accreditation";
import { carrierChecklist, isCarrierLocked, markContactVerified, rejectCarrier } from "../src/lib/carrier";
import { getDb } from "../src/lib/db";
import { addDocument, setDocumentVerification } from "../src/lib/documents";
import { AppError } from "../src/lib/errors";
import { todayChile } from "../src/lib/format";
import { confirmPhoneCode, startPhoneVerification } from "../src/lib/verification";

function fresh(id: string) {
  const row = getDb().prepare(`SELECT verification_status, email_verified_at, phone_verified_at FROM users WHERE id = ?`).get(id) as {
    verification_status: string;
  };
  return row;
}

test("transportista nuevo queda bloqueado hasta verificar correo, teléfono y documentos", async () => {
  const { user } = registerUser({
    role: "transportista",
    razonSocial: "Gate Test SpA",
    rut: "11.111.111-1",
    contactName: "Prueba",
    email: "gate@test.cl",
    password: "clave-segura-1",
    whatsapp: "+56 9 1111 2222",
    city: "Antofagasta",
  });
  assert.equal(isCarrierLocked(user), true);
  assert.throws(() => approveCarrier("admin", user.id), (error: unknown) => error instanceof AppError && /correo/.test(error.message));

  // OTP sin canal configurado: no se envía y queda registrado como no_configurado.
  const delivery = await startPhoneVerification(user);
  assert.equal(delivery.delivery, "no_configurado");
  assert.throws(() => confirmPhoneCode(user, "000000x"), AppError);
  await assert.rejects(() => startPhoneVerification(user), (error: unknown) => error instanceof AppError && error.status === 429);

  markContactVerified(user.id, "email", true);
  markContactVerified(user.id, "phone", true);
  const expiry = "2099-01-01";
  assert.ok(todayChile() < expiry);
  const ids: string[] = [];
  for (const type of ["cedula", "licencia", "antecedentes"]) {
    ids.push(addDocument(user, { type, expiry, holderName: "Prueba", detail: type === "licencia" ? "A5" : null }).id);
  }
  for (const type of ["padron", "revision", "soap", "permiso"]) {
    ids.push(addDocument(user, { type, expiry, holderName: "abcd-12" }).id);
  }
  assert.equal(carrierChecklist(user.id).ready, false);
  for (const id of ids) setDocumentVerification(id, "verificado", null);
  assert.equal(carrierChecklist(user.id).ready, true);
  // Faltan Política de Privacidad y requisitos de calidad, seguridad y medio ambiente.
  assert.throws(() => approveCarrier("admin", user.id), /calidad/);
  acceptPrivacyFor(user.id);
  setRequirement(user.id, "calidad", "cumple");
  setRequirement(user.id, "seguridad", "cumple");
  assert.throws(() => setRequirement(user.id, "medioambiente", "talvez"), AppError);
  setRequirement(user.id, "medioambiente", "no_aplica");
  assert.equal(accreditationOf(user.id).ready, true);
  assert.equal(accreditationOf(user.id).accredited, false);
  approveCarrier("admin", user.id);
  assert.equal(accreditationOf(user.id).accredited, true);
  assert.equal(fresh(user.id).verification_status, "verificado");
  rejectCarrier("admin", user.id, "Licencia ilegible");
  assert.equal(fresh(user.id).verification_status, "rechazado");
});
