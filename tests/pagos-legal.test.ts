import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentsComingSoon, paymentsEnabled, paymentsLegalPublished } from "../src/lib/pagos/config";
import { privacyVersion, termsVersion } from "../src/lib/privacy";
import { policySections } from "../src/lib/privacy-policy";
import { termsSections } from "../src/lib/terms";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    prev[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test("textos de pagos publicados con el cobro apagado: versiones 1.3/1.7 y aviso de disponibilidad", () => {
  withEnv({ PAYMENTS_FEATURE_ENABLED: "false", PAYMENTS_LEGAL_PUBLISHED: "true", KYC_FEATURE_ENABLED: undefined }, () => {
    assert.equal(paymentsEnabled(), false);
    assert.equal(paymentsLegalPublished(), true);
    assert.equal(paymentsComingSoon(), true);
    assert.equal(termsVersion(), "1.3-2026-11-17");
    assert.equal(privacyVersion(), "1.7.1-2026-11-18");
    const terms = termsSections();
    const pagos = terms.find((s) => s.id === "pagos");
    assert.ok(pagos);
    assert.ok(pagos.blocks.some((b) => typeof b === "string" && b.startsWith("Disponibilidad:")));
    const privacy = policySections();
    const priv = privacy.find((s) => s.id === "pagos");
    assert.ok(priv && priv.title.startsWith("17."));
    assert.ok(priv.blocks.some((b) => typeof b === "string" && b.startsWith("Disponibilidad:")));
  });
});

test("con el cobro encendido no aparece el aviso de disponibilidad", () => {
  withEnv({ PAYMENTS_FEATURE_ENABLED: "true", PAYMENTS_LEGAL_PUBLISHED: undefined }, () => {
    assert.equal(paymentsComingSoon(), false);
    const pagos = termsSections().find((s) => s.id === "pagos");
    assert.ok(pagos && !pagos.blocks.some((b) => typeof b === "string" && b.startsWith("Disponibilidad:")));
  });
});

test("sin flags se publican los textos vigentes (1.2 / 1.5), sin la sección de pagos", () => {
  withEnv({ PAYMENTS_FEATURE_ENABLED: undefined, PAYMENTS_LEGAL_PUBLISHED: undefined, KYC_FEATURE_ENABLED: undefined }, () => {
    assert.equal(paymentsLegalPublished(), false);
    assert.equal(termsVersion(), "1.2-2026-11-17");
    assert.equal(privacyVersion(), "1.5.1-2026-11-18");
    assert.ok(!termsSections().some((s) => s.id === "pagos"));
  });
});
