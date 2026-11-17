import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AppError } from "../src/lib/errors";
import { OPS_FLAGS, allocationMode, assertEnabled, isEnabled, opsChildFlags, type OpsFlag } from "../src/lib/ops/flags";

const OFF = [undefined, "", "1", "TRUE", "True", " true", "true ", "yes", "false", "on"] as const;

function withEnv(values: Partial<Record<OpsFlag, string | undefined>>, fn: () => void) {
  const prev: Partial<Record<OpsFlag, string | undefined>> = {};
  for (const flag of OPS_FLAGS) {
    prev[flag] = process.env[flag];
    const next = values[flag];
    if (next === undefined) delete process.env[flag];
    else process.env[flag] = next;
  }
  try {
    fn();
  } finally {
    for (const flag of OPS_FLAGS) {
      if (prev[flag] === undefined) delete process.env[flag];
      else process.env[flag] = prev[flag];
    }
  }
}

test("flags OPS apagados por defecto y valores raros no encienden", () => {
  withEnv({}, () => {
    for (const flag of OPS_FLAGS) {
      assert.equal(process.env[flag], undefined, flag);
      assert.equal(isEnabled(flag), false, flag);
      assert.throws(() => assertEnabled(flag), (error: unknown) => error instanceof AppError && error.status === 404);
    }
    assert.equal(allocationMode(), "propuesta");
  });

  for (const master of ["true", ...OFF]) {
    for (const child of ["true", ...OFF]) {
      const masterOn = master === "true";
      const childOn = child === "true";
      withEnv(
        {
          OPS_FEATURE_ENABLED: master,
          OPS_PROCUREMENT_ENABLED: child,
          OPS_ALLOCATION_ENABLED: child,
          OPS_ALLOCATION_AUTO: child,
          OPS_API_V1_ENABLED: child,
          OPS_OPERACION_ENABLED: child,
          OPS_INCIDENCIAS_ENABLED: child,
        },
        () => {
          assert.equal(isEnabled("OPS_FEATURE_ENABLED"), masterOn, `maestro ${String(master)}`);
          for (const flag of opsChildFlags()) {
            assert.equal(isEnabled(flag), masterOn && childOn, `${flag} maestro=${String(master)} hijo=${String(child)}`);
          }
          assert.equal(allocationMode(), "propuesta");
        },
      );
    }
  }
});

test("con el maestro encendido un hijo true vale y la adjudicación automática sigue en propuesta", () => {
  withEnv(
    {
      OPS_FEATURE_ENABLED: "true",
      OPS_PROCUREMENT_ENABLED: "true",
      OPS_ALLOCATION_ENABLED: undefined,
      OPS_ALLOCATION_AUTO: "true",
      OPS_API_V1_ENABLED: "TRUE",
    },
    () => {
      assert.equal(isEnabled("OPS_PROCUREMENT_ENABLED"), true);
      assert.equal(isEnabled("OPS_ALLOCATION_ENABLED"), false);
      assert.equal(isEnabled("OPS_ALLOCATION_AUTO"), true);
      assert.equal(isEnabled("OPS_API_V1_ENABLED"), false);
      assert.doesNotThrow(() => assertEnabled("OPS_FEATURE_ENABLED"));
      assert.throws(() => assertEnabled("OPS_API_V1_ENABLED"), (error: unknown) => error instanceof AppError && error.status === 404);
      assert.equal(allocationMode(), "propuesta");
    },
  );
});

test("el ejemplo de entorno deja los flags en false y la web pública no gana enlaces", () => {
  const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  for (const flag of OPS_FLAGS) assert.match(example, new RegExp(`^${flag}=false$`, "m"), flag);
  for (const file of ["src/components/Header.tsx", "src/components/AdminNav.tsx", "src/app/sitemap.ts"]) {
    const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.equal(text.includes("/admin/ops"), false, file);
    assert.equal(text.includes("/api/ops"), false, file);
  }
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/admin/ops/asignacion/page.tsx"), "utf8");
  assert.match(page, /notFound\(/);
  assert.match(page, /OPS_FEATURE_ENABLED/);
  assert.match(page, /OPS_ALLOCATION_ENABLED/);
});
