import assert from "node:assert/strict";
import { test } from "node:test";
import { opsPageHidden, opsPageRule } from "../src/lib/ops/page-gate";
import type { PublicUser } from "../src/lib/types";

const admin = { role: "admin" } as PublicUser;
const carrier = { role: "transportista" } as PublicUser;

function withFlags(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const name of Object.keys(values)) previous.set(name, process.env[name]);
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("las páginas OPS se esconden con el flag apagado o sin admin", () => {
  withFlags({ OPS_FEATURE_ENABLED: undefined, OPS_ALLOCATION_ENABLED: undefined }, () => {
    assert.equal(opsPageRule("/contacto"), null);
    assert.equal(opsPageRule("/api/ops/asignacion"), null);
    assert.equal(opsPageRule("/api/viajes/prueba/ubicacion"), null);
    assert.deepEqual(opsPageRule("/admin/ops/asignacion"), { flag: "OPS_ALLOCATION_ENABLED" });
    assert.deepEqual(opsPageRule("/admin/ops/asignacion/"), { flag: "OPS_ALLOCATION_ENABLED" });
    assert.deepEqual(opsPageRule("/admin/ops/futura"), { flag: "OPS_FEATURE_ENABLED" });
    assert.deepEqual(opsPageRule("/viajes/prueba/ubicacion"), { flag: "OPS_FEATURE_ENABLED" });
    assert.deepEqual(opsPageRule("/viajes/prueba/ubicacion/"), { flag: "OPS_FEATURE_ENABLED" });
    assert.equal(opsPageRule("/seguimiento"), null);
    assert.deepEqual(opsPageRule("/seguimiento/abc"), { flag: "OPS_FEATURE_ENABLED" });
    assert.equal(opsPageHidden("/seguimiento/abc", null), true);
    assert.equal(opsPageHidden("/seguimiento/abc", admin), true);

    for (const path of ["/admin/ops/asignacion", "/admin/ops/futura", "/viajes/prueba/ubicacion"]) {
      assert.equal(opsPageHidden(path, null), true, path);
      assert.equal(opsPageHidden(path, admin), true, path);
      assert.equal(opsPageHidden(path, carrier), true, path);
    }
    assert.equal(opsPageHidden("/contacto", null), false);
    assert.equal(opsPageHidden("/cargas", admin), false);
  });

  withFlags({ OPS_FEATURE_ENABLED: "true", OPS_ALLOCATION_ENABLED: "true" }, () => {
    assert.equal(opsPageHidden("/admin/ops/asignacion", admin), false);
    assert.equal(opsPageHidden("/admin/ops/asignacion", carrier), true);
    assert.equal(opsPageHidden("/admin/ops/asignacion", null), true);
    assert.equal(opsPageHidden("/viajes/carga-1/ubicacion", admin), false);
    assert.equal(opsPageHidden("/viajes/carga-1/ubicacion", carrier), true);
    assert.equal(opsPageHidden("/seguimiento/abc", null), false);
    assert.equal(opsPageHidden("/seguimiento/abc", carrier), false);
    assert.equal(opsPageHidden("/seguimiento/abc", admin), false);
    assert.equal(opsPageHidden("/admin/ops/futura", admin), false);
  });

  withFlags({ OPS_FEATURE_ENABLED: "true", OPS_ALLOCATION_ENABLED: undefined }, () => {
    assert.equal(opsPageHidden("/admin/ops/asignacion", admin), true);
    assert.equal(opsPageHidden("/admin/ops/futura", admin), false);
    assert.equal(opsPageHidden("/viajes/carga-1/ubicacion", admin), false);
  });
});
