import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { readFileSync } from "node:fs";

if (!process.env.DATABASE_PATH?.includes(`${path.sep}c360-`)) {
  throw new Error("DATABASE_PATH de prueba no está configurada. Ejecuta npm test.");
}

import { POST as postRestablecer } from "../src/app/api/auth/restablecer/route";
import { requestPasswordReset, resetPassword, registerUser } from "../src/lib/auth";
import { AppError } from "../src/lib/errors";
import { PASSWORD_MIN } from "../src/lib/security";
import { rutDv } from "../src/lib/format";

test("T-010: el mínimo de contraseña es 10, el mismo del registro", () => {
  assert.equal(PASSWORD_MIN, 10);
});

test("T-010: /restablecer pide al menos 10 caracteres, no 8", () => {
  const page = readFileSync(path.join(import.meta.dirname, "../src/app/restablecer/page.tsx"), "utf8");
  const form = readFileSync(path.join(import.meta.dirname, "../src/components/PasswordForms.tsx"), "utf8");
  assert.match(page, /PASSWORD_MIN/);
  assert.match(page, /al menos \{PASSWORD_MIN\} caracteres/);
  assert.doesNotMatch(page, /al menos 8 caracteres/);
  assert.match(form, /minLength=\{PASSWORD_MIN\}/);
  assert.match(form, /password\.length < PASSWORD_MIN/);
});

test("T-010: restablecer rechaza una clave de 8 caracteres y acepta una de 10", async () => {
  const seq = 51_000_008;
  const { user } = registerUser({
    role: "mandante",
    razonSocial: "Restablecer Prueba",
    rut: `${seq}-${rutDv(String(seq))}`,
    contactName: "Contacto",
    email: "t010-restablecer@calidad.test",
    password: "Clave-Actual-2026",
    whatsapp: "+56 9 5555 1010",
    city: "Santiago",
  });
  const reset = await requestPasswordReset(user.email);
  assert.ok(reset.devLink);
  const token = new URL(reset.devLink!).searchParams.get("token");
  assert.ok(token);

  assert.throws(
    () => resetPassword(token, "ochochar"),
    (error: unknown) => error instanceof AppError && /al menos 10 caracteres/.test((error as Error).message),
  );
  assert.throws(
    () => resetPassword(token, "nuevechar"),
    (error: unknown) => error instanceof AppError && /al menos 10 caracteres/.test((error as Error).message),
  );

  const short = await postRestablecer(
    new Request("http://127.0.0.1:4317/api/auth/restablecer", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.10" },
      body: JSON.stringify({ token, password: "ochochar1" }),
    }),
    { params: Promise.resolve({}) },
  );
  assert.equal(short.status, 400);
  const shortBody = (await short.json()) as { error: string };
  assert.match(shortBody.error, /al menos 10 caracteres/);

  resetPassword(token, "diezchars1");
});
