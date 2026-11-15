import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const SCRIPT = path.join(import.meta.dirname, "../deploy/costos-jobs.sh");
const SECRET = "secreto-cron-de-prueba-0123456789abcdef-T017";

function runJob(envFile: string, extraPath: string, extraEnv: Record<string, string> = {}) {
  return spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      C360_ENV_FILE: envFile,
      C360_JOBS_URL: "http://127.0.0.1:3017",
      C360_JOBS_HOST: "www.carga360go.cl",
      PATH: `${extraPath}${path.delimiter}${process.env.PATH || ""}`,
      ...extraEnv,
    },
  });
}

test("T-017: el cron de costos no deja COSTOS_CRON_SECRET visible en la línea de comandos de curl", () => {
  const src = readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(src, /Authorization: Bearer \$\{secret\}/, "el secreto no debe interpolarse en argv de curl");
  assert.match(src, /-H "@\$\{tmp\}"/);

  const dir = mkdtempSync(path.join(tmpdir(), "c360-cron-"));
  const envFile = path.join(dir, ".env");
  writeFileSync(envFile, `COSTOS_CRON_SECRET=${SECRET}\n`, { mode: 0o600 });

  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const argvLog = path.join(dir, "curl.argv");
  const cmdlineLog = path.join(dir, "curl.cmdline");
  const headerLog = path.join(dir, "curl.header");
  writeFileSync(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
: > "$CURL_ARGV_LOG"
for arg in "$0" "$@"; do
  printf '%s\\0' "$arg" >> "$CURL_ARGV_LOG"
done
tr '\\0' ' ' < /proc/self/cmdline > "$CURL_CMDLINE_LOG" || true
printf '\\n' >> "$CURL_CMDLINE_LOG"
# Si curl recibe -H @archivo, anota el contenido (el secreto va ahí, no en argv).
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-H" && "$arg" == @* ]]; then
    cat -- "\${arg#@}" > "$CURL_HEADER_LOG"
  fi
  prev="$arg"
done
printf '200'
`,
    { mode: 0o755 },
  );
  chmodSync(path.join(bin, "curl"), 0o755);

  const result = runJob(envFile, bin, {
    CURL_ARGV_LOG: argvLog,
    CURL_CMDLINE_LOG: cmdlineLog,
    CURL_HEADER_LOG: headerLog,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /^200 /);

  const argv = readFileSync(argvLog);
  const cmdline = readFileSync(cmdlineLog);
  assert.equal(argv.includes(Buffer.from(SECRET)), false, "el secreto no debe aparecer en argv de curl");
  assert.equal(cmdline.includes(Buffer.from(SECRET)), false, "el secreto no debe aparecer en /proc/self/cmdline");
  assert.equal(argv.includes(Buffer.from("Authorization: Bearer")), false);
  const header = readFileSync(headerLog, "utf8");
  assert.equal(header.trim(), `Authorization: Bearer ${SECRET}`);
});

test("T-017: sin COSTOS_CRON_SECRET el job se omite y no llama a curl", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "c360-cron-"));
  const envFile = path.join(dir, ".env");
  writeFileSync(envFile, "OTRA=1\n", { mode: 0o600 });
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const marker = path.join(dir, "called");
  writeFileSync(path.join(bin, "curl"), `#!/bin/sh\necho called > "${marker}"\nexit 1\n`, { mode: 0o755 });
  const result = runJob(envFile, bin);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /^000 /);
  assert.match(result.stdout, /falta COSTOS_CRON_SECRET/);
  assert.equal(existsSync(marker), false);
});
