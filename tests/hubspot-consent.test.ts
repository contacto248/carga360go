import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  hasMarketingConsent,
  makeConsentDecision,
  parseCookieConsent,
  serializeCookieConsent,
} from "../src/lib/cookie-consent";
import { DEFAULT_HUBSPOT_PORTAL_ID, hubspotPortalId, hubspotScriptSrc } from "../src/lib/hubspot";
import { LEY_21719_SECTION_ID, policySections } from "../src/lib/privacy-policy";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("T-063: portal HubSpot por defecto y override NEXT_PUBLIC_HUBSPOT_PORTAL_ID", () => {
  assert.equal(DEFAULT_HUBSPOT_PORTAL_ID, "52297745");
  assert.equal(hubspotPortalId({}), "52297745");
  assert.equal(hubspotPortalId({ NEXT_PUBLIC_HUBSPOT_PORTAL_ID: " 99900111 " }), "99900111");
  assert.equal(hubspotPortalId({ NEXT_PUBLIC_HUBSPOT_PORTAL_ID: "no-digits" }), "52297745");
  assert.equal(hubspotScriptSrc("52297745"), "//js.hs-scripts.com/52297745.js");
});

test("T-063: consentimiento marketing solo con decisión válida", () => {
  assert.equal(parseCookieConsent(null), null);
  assert.equal(parseCookieConsent("{"), null);
  assert.equal(parseCookieConsent(JSON.stringify({ version: "0", necessary: true, marketing: true, decidedAt: "x" })), null);
  assert.equal(hasMarketingConsent(null), false);

  const accepted = makeConsentDecision(true, "2026-11-16T00:00:00.000Z");
  assert.equal(accepted.version, COOKIE_CONSENT_VERSION);
  assert.equal(accepted.necessary, true);
  assert.equal(accepted.marketing, true);
  assert.equal(hasMarketingConsent(accepted), true);

  const rejected = makeConsentDecision(false, "2026-11-16T00:00:00.000Z");
  assert.equal(hasMarketingConsent(rejected), false);
  assert.deepEqual(parseCookieConsent(serializeCookieConsent(rejected)), rejected);
  assert.equal(COOKIE_CONSENT_STORAGE_KEY, "c360_cookie_consent");
});

test("T-063: layout carga HubSpot tras banner; script async/defer y CSP", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /CookieConsentBanner/);
  assert.match(layout, /HubSpotTracking/);
  assert.match(layout, /hubspotPortalId/);

  const tracking = read("src/components/HubSpotTracking.tsx");
  assert.match(tracking, /from "next\/script"/);
  assert.match(tracking, /id="hs-script-loader"/);
  assert.match(tracking, /strategy="afterInteractive"/);
  assert.match(tracking, /\basync\b/);
  assert.match(tracking, /\bdefer\b/);
  assert.match(tracking, /hasMarketingConsent/);
  assert.match(tracking, /hubspotScriptSrc/);

  const banner = read("src/components/CookieConsentBanner.tsx");
  assert.match(banner, /Ley 21\.719/);
  assert.match(banner, /01-12-2026|desde 01-12/);
  assert.match(banner, /HubSpot/);
  assert.match(banner, /Solo necesarias/);
  assert.match(banner, /Aceptar/);

  const envExample = read(".env.example");
  assert.match(envExample, /NEXT_PUBLIC_HUBSPOT_PORTAL_ID/);
  assert.match(envExample, /52297745/);

  const csp = read("next.config.ts");
  assert.match(csp, /js\.hs-scripts\.com/);
  assert.match(csp, /js\.hs-analytics\.net/);
});

test("Ley 21.719: falla si falta la sección en la política o el enlace de la barra", () => {
  const section = policySections().find((item) => item.id === LEY_21719_SECTION_ID);
  assert.ok(section, "falta la sección de la Ley 21.719");
  assert.equal(LEY_21719_SECTION_ID, "ley-21719");
  const text = JSON.stringify(section);
  assert.match(text, /Carga360go/);
  assert.match(text, /contacto@carga360go\.cl/);
  assert.match(text, /01-12-2026/);
  assert.match(text, /Qué datos se tratan/);
  assert.match(text, /Base legal/);
  assert.match(text, /acceso, rectificación, supresión, oposición, portabilidad y bloqueo/);
  assert.match(text, /Conservación/);
  assert.match(text, /HubSpot es opcional/);
  assert.match(text, /Cookies/);
  assert.doesNotMatch(text, /comisi[oó]n|precio|membres[ií]a|\bmulta\b|\bISO\b|SOC 2|registro n[°ºo]/i);

  const banner = read("src/components/CookieConsentBanner.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const desc = banner.match(/id="cookie-banner-desc"[\s\S]*?<\/p>/)?.[0] ?? "";
  assert.match(desc, /Ley 21\.719/, "falta la mención a la Ley 21.719 en la barra");
  assert.match(desc, new RegExp(`<a href="/privacidad#${LEY_21719_SECTION_ID}">Ley 21\\.719</a>`), "falta el enlace a la sección");
  assert.match(banner, /cookie-banner-compact/);
  assert.match(banner, /Solo necesarias/);
  assert.match(banner, /Aceptar/);
});
