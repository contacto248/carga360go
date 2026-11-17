import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { AppError } from "../src/lib/errors";
import { FAQ } from "../src/lib/faq";
import { todayChile } from "../src/lib/format";
import { resetRateLimits } from "../src/lib/rate-limit";
import { ExtractionError, keepRawAndClean } from "../src/lib/web-automation/extract";
import { normalizeClp, normalizeDate } from "../src/lib/web-automation/normalize";
import { withRetry } from "../src/lib/web-automation/retry";
import { runSummaryRoutine } from "../src/lib/web-automation/routine";
import { isSessionExpired, SessionExpiredError } from "../src/lib/web-automation/session";
import { runPublicFaqSummary } from "../src/lib/web-automation/sources";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const AUTOMATION_FILES = [
  "playwright.config.ts",
  "e2e/faq.page.ts",
  "e2e/faq.public.spec.ts",
  "src/lib/web-automation/session.ts",
  "src/lib/web-automation/retry.ts",
  "src/lib/web-automation/normalize.ts",
  "src/lib/web-automation/extract.ts",
  "src/lib/web-automation/rate.ts",
  "src/lib/web-automation/routine.ts",
  "src/lib/web-automation/sources.ts",
];

test("withRetry usa backoff y no reintenta sesión expirada ni 429", async () => {
  const delays: number[] = [];
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporal");
      return "ok";
    },
    {
      attempts: 3,
      baseDelayMs: 100,
      jitterMs: () => 0,
      sleep: async (ms) => {
        delays.push(ms);
      },
    },
  );
  assert.equal(value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);

  let expiredCalls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          expiredCalls += 1;
          throw new SessionExpiredError();
        },
        {
          sleep: async () => {
            throw new Error("no debía esperar");
          },
        },
      ),
    (error: unknown) => error instanceof SessionExpiredError,
  );
  assert.equal(expiredCalls, 1);

  let limitedCalls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          limitedCalls += 1;
          throw new AppError("demasiados", 429);
        },
        {
          sleep: async () => {
            throw new Error("no debía esperar");
          },
        },
      ),
    (error: unknown) => error instanceof AppError && error.status === 429,
  );
  assert.equal(limitedCalls, 1);
});

test("normaliza CLP y fechas y el schema rechaza basura", () => {
  assert.equal(normalizeClp("$1.250.000"), 1250000);
  assert.equal(normalizeClp("CLP 1.250.000"), 1250000);
  assert.equal(normalizeClp("1,250,000"), 1250000);
  assert.equal(normalizeClp("$450.000"), 450000);
  assert.equal(normalizeClp("1.250"), 1250);
  assert.equal(normalizeClp("0"), 0);
  assert.equal(normalizeClp("12,50"), 13);
  assert.equal(normalizeClp("no es plata"), null);
  assert.equal(normalizeClp("-1"), null);

  assert.equal(normalizeDate("17-11-2026"), "2026-11-17");
  assert.equal(normalizeDate("17/11/2026"), "2026-11-17");
  assert.equal(normalizeDate("2026-11-17"), "2026-11-17");
  assert.equal(normalizeDate("7-1-2026"), "2026-01-07");
  assert.equal(normalizeDate("17 de noviembre de 2026"), "2026-11-17");
  assert.equal(normalizeDate("29-02-2024"), "2024-02-29");
  assert.equal(normalizeDate("29-02-2026"), null);
  assert.equal(normalizeDate("31-11-2026"), null);

  const kept = keepRawAndClean({
    title: "  Flete norte  ",
    amountText: " $ 1.250.000 ",
    dateText: "17-11-2026",
    href: "/faq",
  });
  assert.equal(kept.raw.amountText, "$ 1.250.000");
  assert.equal(kept.raw.dateText, "17-11-2026");
  assert.equal(kept.clean.title, "Flete norte");
  assert.equal(kept.clean.amountClp, 1250000);
  assert.equal(kept.clean.date, "2026-11-17");
  assert.equal(kept.clean.href, "/faq");

  assert.throws(
    () => keepRawAndClean({ title: "x", amountText: "abc", dateText: null, href: "/faq" }),
    ExtractionError,
  );
  assert.throws(
    () => keepRawAndClean({ title: "x", amountText: null, dateText: "31/02/2026", href: "/faq" }),
    ExtractionError,
  );
  assert.throws(() => keepRawAndClean({ title: "   ", amountText: null, dateText: null, href: "/faq" }), ExtractionError);
});

test("isSessionExpired detecta el muro de ingreso sin login", () => {
  assert.equal(isSessionExpired({ url: "https://www.carga360go.cl/ingreso?next=/panel" }), true);
  assert.equal(isSessionExpired({ url: "/panel", location: "/ingreso" }), true);
  assert.equal(isSessionExpired({ status: 401, url: "/panel" }), true);
  assert.equal(isSessionExpired({ url: "/faq", text: "Tu sesión ha expirado" }), true);
  assert.equal(isSessionExpired({ url: "/faq", text: "Ingresar" }), false);
  assert.equal(isSessionExpired({ url: "/faq", status: 200 }), false);
  assert.equal(isSessionExpired({ url: "https://evil.example/?next=/ingreso" }), false);
});

test("la rutina resume en memoria, respeta el rate limit y no reloguea", async () => {
  resetRateLimits();
  const now = new Date("2026-11-17T15:00:00.000Z");
  let calls = 0;
  const result = await runSummaryRoutine(
    async () => {
      calls += 1;
      return {
        session: { url: "/faq", status: 200 },
        rows: [{ title: "Flete", amountText: "$1.250.000", dateText: "17-11-2026", href: "/faq" }],
      };
    },
    { rateKey: "unit-money", limit: 2, windowMs: 60_000, now, attempts: 1 },
  );
  assert.equal(calls, 1);
  assert.equal(result.records[0]?.clean.amountClp, 1250000);
  assert.equal(result.records[0]?.raw.amountText, "$1.250.000");
  assert.match(result.markdown, new RegExp(todayChile(now)));
  assert.match(result.markdown, /Flete/);
  assert.match(result.markdown, /2026-11-17/);
  const line = result.markdown.split("\n").find((row) => row.includes("Flete"));
  assert.ok(line);
  assert.match(line.replace(/2026-11-17/g, "").replace(/\D/g, ""), /1250000/);

  await assert.rejects(
    () =>
      runSummaryRoutine(
        async () => {
          calls += 1;
          return { session: { url: "/ingreso", status: 200 }, rows: [] };
        },
        {
          rateKey: "unit-session",
          limit: 5,
          windowMs: 60_000,
          sleep: async () => {
            throw new Error("no debía esperar");
          },
        },
      ),
    (error: unknown) => error instanceof SessionExpiredError,
  );
  assert.equal(calls, 2);

  await runSummaryRoutine(async () => ({ session: { url: "/faq", status: 200 }, rows: [] }), {
    rateKey: "unit-limit",
    limit: 1,
    windowMs: 60_000,
  });
  let blocked = 0;
  await assert.rejects(
    () =>
      runSummaryRoutine(
        async () => {
          blocked += 1;
          return { session: { url: "/faq", status: 200 }, rows: [] };
        },
        { rateKey: "unit-limit", limit: 1, windowMs: 60_000 },
      ),
    (error: unknown) => error instanceof AppError && error.status === 429,
  );
  assert.equal(blocked, 0);
});

test("el resumen público de FAQ no sale del módulo", async () => {
  resetRateLimits();
  const result = await runPublicFaqSummary({ now: new Date("2026-11-17T15:00:00.000Z"), attempts: 1 });
  assert.equal(result.records.length, FAQ.length);
  assert.equal(result.records[0]?.clean.title, FAQ[0].q);
  assert.equal(result.records[0]?.clean.amountClp, null);
  assert.equal(result.records[0]?.raw.href, "/faq");
  assert.match(result.markdown, /No llama a xAI/);
});

test("no hay credenciales hardcodeadas ni escritura de producción", () => {
  const secret = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}/,
    /\bxai-[A-Za-z0-9]{10,}/,
    /\bsk-[A-Za-z0-9]{20,}/,
    /Bearer\s+[A-Za-z0-9\-._]{12,}/,
    /(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"']{4,}["']/i,
    /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i,
    /mongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@/i,
    /https:\/\/api\.x\.ai/,
  ];
  for (const rel of AUTOMATION_FILES) {
    const source = read(rel);
    for (const pattern of secret) assert.doesNotMatch(source, pattern, rel);
    assert.doesNotMatch(source, /writeFile|appendFile|createWriteStream|mkdirSync/, rel);
    assert.doesNotMatch(source, /agente-360go/, rel);
  }
  const config = read("playwright.config.ts");
  assert.match(config, /STORAGE_STATE/);
  assert.match(config, /on-first-retry/);
  assert.match(config, /only-on-failure/);
  assert.match(config, /retries:\s*2/);
  assert.match(config, /127\.0\.0\.1:4317/);
  assert.doesNotMatch(config, /carga360go\.cl/);
  const page = read("e2e/faq.page.ts");
  assert.match(page, /getByRole\("main"\)/);
  assert.match(page, /getByRole\("heading"/);
  assert.match(page, /getByRole\("button"/);
  assert.match(page, /getByRole\("link"/);
  assert.doesNotMatch(page, /page\.locator\(|page\.\$\(/);
});

test("el skill v2 cita API, validador y la guía avanzada", () => {
  const skill = read(".cursor/skills/carga360go-agents/SKILL.md");
  assert.match(skill, /references\/advanced-web-automation\.md/);
  assert.match(skill, /references\/api-web-automation\.md/);
  assert.match(skill, /generate_report\.py/);
  assert.match(skill, /generate_status\.py/);
  assert.match(skill, /validate_knowledge_base\.py/);
  const guide = read(".cursor/skills/carga360go-agents/references/advanced-web-automation.md");
  assert.match(guide, /withRetry/);
  const api = read(".cursor/skills/carga360go-agents/references/api-web-automation.md");
  assert.match(api, /APIRequestContext/);
  assert.match(api, /401/);
  assert.match(api, /429/);
  assert.match(api, /5xx/);
  assert.doesNotMatch(api, /Bearer\s+[A-Za-z0-9\-._]{12,}/);
  const root = path.join(ROOT, ".cursor/skills/carga360go-agents/scripts");
  const validator = path.join(root, "validate_knowledge_base.py");
  const sample = path.join(ROOT, ".cursor/skills/carga360go-agents/assets/knowledge-base-sample.jsonl");
  assert.equal(fs.existsSync(path.join(root, "generate_report.py")), true);
  assert.equal(fs.existsSync(path.join(root, "generate_status.py")), true);
  const ok = spawnSync("python3", [validator, sample], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-"));
  const bad = path.join(dir, "bad.jsonl");
  fs.writeFileSync(bad, "{}\n");
  const fail = spawnSync("python3", [validator, bad], { encoding: "utf8" });
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /faltan campos/);
});
