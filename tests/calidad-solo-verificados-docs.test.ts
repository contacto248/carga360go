import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { setUserVerification } from "../src/lib/auth";
import { addDocument, setDocumentVerification } from "../src/lib/documents";
import { createLoad, createTruck, getLoad } from "../src/lib/listings";
import { matchLoadToTruck } from "../src/lib/match";
import { publicVerifiedSeal } from "../src/lib/public-trust";
import { addDays, person } from "./helpers-agente";

function setupSoloVerificadosPair(tag: string) {
  const mandante = person("mandante", `${tag}-m`);
  const carrier = person("transportista", `${tag}-c`, { verified: false });
  setUserVerification(carrier.user.id, "verificado", null);

  const truck = createTruck(carrier.user, {
    origin: "Copiapó",
    destination: "La Serena",
    availableFrom: addDays(0),
    availableTo: addDays(10),
    equipment: "rampla_plana",
    tonnage: 20,
    specs: { largoM: 12 },
  });

  const load = createLoad(mandante.user, {
    origin: "Copiapó",
    destination: "La Serena",
    pickupDate: addDays(3),
    equipment: "rampla_plana",
    description: `Carga solo verificados — ${tag}`,
    weightT: 10,
    specs: { largoM: 12 },
    soloVerificados: true,
  });

  return { carrier, truck, load };
}

test("T-008 residual: soloVerificados excluye docs faltantes, acepta vigentes y excluye vencidos", () => {
  // 1) Faltantes: cuenta verificado sin documentos → no match.
  const missing = setupSoloVerificadosPair("t008r-faltantes");
  const listedMissing = getLoad(missing.load.id);
  assert.ok(listedMissing);
  assert.equal(listedMissing!.soloVerificados, true);
  assert.equal(
    listedMissing!.matches.find((m) => m.truck.id === missing.truck.id),
    undefined,
    "sin docs no debe entrar al match de soloVerificados",
  );
  assert.equal(publicVerifiedSeal("verificado", false), false);

  // El motor de matching puro no se degrada: sigue calzando equipo/ruta si se llama directo.
  const pure = matchLoadToTruck(listedMissing!, missing.truck);
  assert.ok(pure && pure.score > 0, "carrierFitsLoad no debe romper matchLoadToTruck");

  // 2) Vigentes: documento verificado con expiry futuro → match.
  const ok = setupSoloVerificadosPair("t008r-vigentes");
  const padronOk = addDocument(ok.carrier.user, {
    type: "padron",
    expiry: addDays(400),
    truckId: ok.truck.id,
  });
  setDocumentVerification(padronOk.id, "verificado", null);
  const listedOk = getLoad(ok.load.id);
  assert.ok(listedOk);
  const hit = listedOk!.matches.find((m) => m.truck.id === ok.truck.id);
  assert.ok(hit, "con documento verificado y vigente debe calzar");
  assert.equal(publicVerifiedSeal("verificado", true), true);

  // 3) Vencidos: documento verificado con expiry pasado → no match.
  const expired = setupSoloVerificadosPair("t008r-vencidos");
  const padronExpired = addDocument(expired.carrier.user, {
    type: "padron",
    expiry: addDays(-30),
    truckId: expired.truck.id,
  });
  setDocumentVerification(padronExpired.id, "verificado", null);
  const listedExpired = getLoad(expired.load.id);
  assert.ok(listedExpired);
  // Match público no expone ownerId/ownerDocsOk (T-007); se valida por id del camión.
  assert.equal(
    listedExpired!.matches.find((m) => m.truck.id === expired.truck.id),
    undefined,
    "docs vencidos no deben calzar",
  );
  assert.equal(publicVerifiedSeal("verificado", false), false);
});
