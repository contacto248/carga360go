import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { createLoad, listLoads } from "../src/lib/listings";
import { publicVerifiedSeal } from "../src/lib/public-trust";
import { recentListings } from "../src/lib/stats";
import { addDays, person } from "./helpers-agente";
import { setUserVerification } from "../src/lib/auth";

test("T-008: el sello público Verificado exige ownerDocsOk", () => {
  assert.equal(publicVerifiedSeal("verificado", true), true);
  assert.equal(publicVerifiedSeal("verificado", false), false);
  assert.equal(publicVerifiedSeal("verificado", undefined), false);
  assert.equal(publicVerifiedSeal("pendiente", true), false);
  assert.equal(publicVerifiedSeal("rechazado", true), false);
});

test("T-008: un aviso con cuenta verificada y documentos incompletos no se presenta como Verificado", () => {
  const owner = person("mandante", "t008-docs");
  // Cuenta marcada como verificada, pero sin documentos aprobados: ownerDocsOk queda en false.
  setUserVerification(owner.user.id, "verificado", null);
  const load = createLoad(owner.user, {
    origin: "La Serena",
    destination: "Coquimbo",
    pickupDate: addDays(5),
    equipment: "rampla_plana",
    description: "Carga de prueba para el sello verificado",
    weightT: 8,
    specs: {},
  });
  const listed = listLoads({}).find((item) => item.id === load.id);
  assert.ok(listed);
  assert.equal(listed!.ownerVerification, "verificado");
  assert.equal(listed!.ownerDocsOk, false);
  assert.equal(publicVerifiedSeal(listed!.ownerVerification, listed!.ownerDocsOk), false);
  assert.equal(listLoads({ verificados: "1" }).some((item) => item.id === load.id), false);

  const recent = recentListings(20).find((item) => item.kind === "carga" && item.id === load.id);
  assert.ok(recent, "con fecha de retiro vigente debe aparecer en la portada");
  assert.equal(recent!.verified, false);
});
