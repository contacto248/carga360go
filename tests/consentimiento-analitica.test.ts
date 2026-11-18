import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import "./react-global";
import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { AgentLeadForm } from "../src/components/AgentLeadForm";
import { AnalyticsConsent } from "../src/components/AnalyticsConsent";
import { ConsentPreferencesLink } from "../src/components/ConsentPreferencesLink";
import { PortalPanels } from "../src/components/PortalPanels";
import {
  CONSENT_KEY,
  analyticsCookieNames,
  clearConsent,
  consentView,
  cookieDomains,
  decideConsent,
  deleteAnalyticsCookies,
  readConsent,
  writeConsent,
  type StorageLike,
} from "../src/lib/analytics-consent";
import { BRAND } from "../src/lib/catalog";
import { policySections } from "../src/lib/privacy-policy";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
}

// ---------- Banner: lógica de consentimiento ----------

test("sin elección no se carga ningún script y se muestra el banner", () => {
  const storage = fakeStorage();
  assert.equal(readConsent(storage), "unset");
  const view = consentView({ loading: false, choice: readConsent(storage), reopened: false, pathname: "/" });
  assert.deepEqual(view, { showBanner: true, loadScripts: false });
});

test("mientras se lee el almacenamiento (primer render) no hay banner ni scripts", () => {
  assert.deepEqual(consentView({ loading: true, choice: "granted", reopened: false, pathname: "/" }), { showBanner: false, loadScripts: false });
});

test("Rechazar guarda «denied», oculta el banner y no carga scripts", () => {
  const storage = fakeStorage();
  const result = decideConsent(readConsent(storage), "denied");
  writeConsent(storage, result.choice);
  assert.equal(storage.data[CONSENT_KEY], "denied");
  assert.equal(result.cleanupAndReload, false);
  assert.deepEqual(consentView({ loading: false, choice: readConsent(storage), reopened: false, pathname: "/" }), { showBanner: false, loadScripts: false });
});

test("Aceptar guarda «granted» y carga los scripts sin banner", () => {
  const storage = fakeStorage();
  const result = decideConsent(readConsent(storage), "granted");
  writeConsent(storage, result.choice);
  assert.equal(storage.data[CONSENT_KEY], "granted");
  assert.deepEqual(consentView({ loading: false, choice: readConsent(storage), reopened: false, pathname: "/" }), { showBanner: false, loadScripts: true });
});

test("nunca hay banner ni scripts en /admin, ni aceptando", () => {
  for (const pathname of ["/admin", "/admin/usuarios"]) {
    assert.deepEqual(consentView({ loading: false, choice: "granted", reopened: true, pathname }), { showBanner: false, loadScripts: false });
    assert.deepEqual(consentView({ loading: false, choice: "unset", reopened: false, pathname }), { showBanner: false, loadScripts: false });
  }
});

test("revocar desde el enlace: reabre el banner, rechazar borra cookies y recarga", () => {
  const storage = fakeStorage({ [CONSENT_KEY]: "granted" });
  // Con «granted» los scripts están activos; el enlace del pie reabre el banner sin descargarlos todavía.
  assert.deepEqual(consentView({ loading: false, choice: readConsent(storage), reopened: true, pathname: "/" }), { showBanner: true, loadScripts: true });
  const result = decideConsent(readConsent(storage), "denied");
  assert.equal(result.cleanupAndReload, true, "tras aceptar, revocar exige limpiar cookies y recargar");
  writeConsent(storage, result.choice);
  assert.equal(readConsent(storage), "denied");
  // Tras la recarga: sin banner y sin scripts.
  assert.deepEqual(consentView({ loading: false, choice: readConsent(storage), reopened: false, pathname: "/" }), { showBanner: false, loadScripts: false });
});

test("cambiar de «denied» a «granted» desde el enlace no recarga y carga los scripts", () => {
  const result = decideConsent("denied", "granted");
  assert.equal(result.cleanupAndReload, false);
  assert.deepEqual(consentView({ loading: false, choice: result.choice, reopened: false, pathname: "/" }), { showBanner: false, loadScripts: true });
});

test("valores desconocidos o sin almacenamiento cuentan como sin elección", () => {
  assert.equal(readConsent(fakeStorage({ [CONSENT_KEY]: "yes" })), "unset");
  assert.equal(readConsent(null), "unset");
  const boom: StorageLike = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("bloqueado");
    },
    removeItem: () => {
      throw new Error("bloqueado");
    },
  };
  assert.equal(readConsent(boom), "unset");
  assert.doesNotThrow(() => writeConsent(boom, "granted"));
  assert.doesNotThrow(() => clearConsent(boom));
});

test("limpieza de cookies de Google Analytics y GTM, sin tocar la sesión", () => {
  const cookie = "c360_session=abc; _ga=GA1.1.1; _ga_G-1LWRQYDEKS=GS1; _gid=x; _gat_gtag_G_1=1; _gcl_au=1; otra=1";
  assert.deepEqual(analyticsCookieNames(cookie), ["_ga", "_ga_G-1LWRQYDEKS", "_gid", "_gat_gtag_G_1", "_gcl_au"]);
  assert.deepEqual(cookieDomains("www.carga360go.cl"), ["www.carga360go.cl", ".www.carga360go.cl", "carga360go.cl", ".carga360go.cl"]);
  assert.deepEqual(cookieDomains("127.0.0.1"), []);
  const writes: string[] = [];
  const doc = {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      writes.push(value);
    },
  };
  const names = deleteAnalyticsCookies(doc, "www.carga360go.cl");
  assert.equal(names.length, 5);
  assert.ok(writes.length >= 5);
  assert.ok(writes.every((w) => /expires=Thu, 01 Jan 1970/.test(w)));
  assert.ok(writes.some((w) => w.startsWith("_ga=; ") && w.includes("domain=.carga360go.cl")));
  assert.ok(!writes.some((w) => w.startsWith("c360_session=")), "no borra la cookie de sesión");
});

// ---------- Banner: render en servidor ----------

test("el primer render del banner (servidor) no incluye scripts de Google ni el banner", () => {
  const html = renderToString(createElement(AnalyticsConsent));
  assert.ok(!/googletagmanager|gtag|GTM-|G-1LWRQYDEKS/i.test(html), html);
  assert.ok(!html.includes("consent-banner"));
});

test("el layout solo monta AnalyticsConsent y ya no inyecta GTM/GA ni el iframe noscript", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<AnalyticsConsent \/>/);
  assert.doesNotMatch(layout, /googletagmanager|gtagBootstrapScript|ns\.html|next\/script/);
  assert.match(layout, /<Footer analyticsConsent=\{productionAnalytics\} \/>/);
});

test("enlace «Preferencias de privacidad» del pie", () => {
  const html = renderToStaticMarkup(createElement(ConsentPreferencesLink));
  assert.match(html, /<button[^>]*type="button"[^>]*>Preferencias de privacidad<\/button>/);
  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /analyticsConsent \? <ConsentPreferencesLink \/> : null/);
  assert.match(read("src/components/ConsentPreferencesLink.tsx"), /CONSENT_OPEN_EVENT/);
  assert.match(read("src/components/AnalyticsConsent.tsx"), /addEventListener\(CONSENT_OPEN_EVENT/);
});

// ---------- Política §8 ----------

test("Política §8 informa GTM/GA con consentimiento y cómo revocar, sin negar la analítica", () => {
  const section = policySections().find((s) => s.id === "cookies");
  assert.ok(section);
  const text = JSON.stringify(section);
  assert.match(text, /Google Tag Manager/);
  assert.match(text, /Google Analytics/);
  assert.match(text, /consentimiento/);
  assert.match(text, /Preferencias de privacidad/);
  assert.match(text, /c360-analytics-consent/);
  assert.doesNotMatch(text, /No usamos cookies de publicidad ni herramientas de analítica de terceros/);
});

// ---------- Formulario del agente ----------

test("formulario del agente: tres campos obligatorios con el tipo correcto", () => {
  const html = renderToStaticMarkup(createElement(AgentLeadForm));
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(inputs.length, 4);
  const byName = (name: string) => inputs.find((tag) => tag.includes(`name="${name}"`)) || "";
  assert.match(byName("nombre"), /type="text"/);
  assert.match(byName("correo"), /type="email"/);
  assert.match(byName("telefono"), /type="tel"/);
  for (const name of ["nombre", "correo", "telefono", "consentimiento"]) assert.match(byName(name), /\brequired=""/, name);
  assert.doesNotMatch(html, /noValidate|novalidate/i);
});

test("formulario del agente: casilla de consentimiento desmarcada, enlace a /privacidad y destinatario", () => {
  const html = renderToStaticMarkup(createElement(AgentLeadForm));
  const checkbox = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes('type="checkbox"')) || "";
  assert.ok(checkbox, "hay casilla");
  assert.doesNotMatch(checkbox, /checked/);
  assert.match(html, /<a href="\/privacidad">Política de Privacidad<\/a>/);
  assert.ok(html.includes(BRAND.company));
  assert.ok(html.includes(BRAND.email));
  assert.ok(fs.existsSync(path.join(ROOT, "src/app/privacidad/page.tsx")), "la ruta /privacidad existe");
});

test("paneles de la portada: enlaces a rutas reales (nunca «#») y sin importes", () => {
  const html = renderToStaticMarkup(createElement(PortalPanels));
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 4);
  for (const href of hrefs) {
    assert.ok(href.startsWith("/") && href !== "#", href);
    const route = href.split("#")[0].split("?")[0];
    assert.ok(fs.existsSync(path.join(ROOT, "src/app", route, "page.tsx")), `no existe la ruta ${href}`);
  }
  for (const title of ["Público", "Clientes inscritos", "Transportistas", "Mandantes"]) assert.ok(html.includes(title), title);
  assert.doesNotMatch(html, /\$|CLP/);
});
