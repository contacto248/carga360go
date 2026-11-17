/**
 * Humo contra `next start`: con los flags OPS apagados, las páginas OPS
 * responden 404 antes de renderizar. Requiere un `next build` previo.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildId = path.join(repo, ".next", "BUILD_ID");
if (!fs.existsSync(buildId)) {
  console.error("Falta el build. Corre npm run build antes de este humo.");
  process.exit(1);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("sin puerto"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function stop(child) {
  if (!child.pid || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  });
}

const port = await freePort();
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
for (const name of ["OPS_FEATURE_ENABLED", "OPS_ALLOCATION_ENABLED", "OPS_PROCUREMENT_ENABLED", "OPS_ALLOCATION_AUTO", "OPS_API_V1_ENABLED", "OPS_OPERACION_ENABLED"]) {
  delete env[name];
}

const chunks = [];
const child = spawn(process.execPath, [path.join(repo, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: repo,
  env,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout?.on("data", (chunk) => chunks.push(chunk));
child.stderr?.on("data", (chunk) => chunks.push(chunk));
const logs = () => Buffer.concat(chunks).toString("utf8").slice(-4000);

try {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start salió ${child.exitCode}\n${logs()}`);
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (health.status === 200) {
        ready = true;
        const body = await health.json();
        const raw = JSON.stringify(body);
        if (body.commit !== "unknown" && !/^[0-9a-f]{7}$/.test(body.commit)) {
          throw new Error(`commit inesperado: ${raw}`);
        }
        if (process.env.DATABASE_PATH && raw.includes(process.env.DATABASE_PATH)) {
          throw new Error("health filtró DATABASE_PATH");
        }
        if (raw.includes("SMTP") || raw.includes("SECRET")) throw new Error(`health sospechoso: ${raw}`);
        const keys = Object.keys(body).sort().join(",");
        if (keys !== "auth,commit,database,documents,ok") throw new Error(`claves de health: ${keys}`);
        break;
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("commit")) throw error;
      if (error instanceof Error && (error.message.startsWith("health") || error.message.startsWith("claves"))) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error(`next start no respondió\n${logs()}`);

  const pages = ["/admin/ops/asignacion", "/admin/ops/operacion", "/admin/ops/futura", "/viajes/prueba/ubicacion"];
  for (const pathname of pages) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { redirect: "manual" });
    const html = await response.text();
    if (response.status !== 404) throw new Error(`${pathname} respondió ${response.status}, no 404\n${html.slice(0, 300)}\n${logs()}`);
    if (!html.includes("No encontramos esa página")) throw new Error(`${pathname} no trae el aviso de 404`);
    if (html.includes("Asignación | Carga360go") || html.includes("<title>Asignación")) {
      throw new Error(`${pathname} renderizó la página de asignación`);
    }
    if (html.includes("Alta de operación")) throw new Error(`${pathname} renderizó el alta de operación`);
    if (html.includes("Cargando")) throw new Error(`${pathname} mostró el loading (streaming 200)`);
  }

  const contacto = await fetch(`http://127.0.0.1:${port}/contacto`, { redirect: "manual" });
  if (contacto.status !== 200) throw new Error(`/contacto respondió ${contacto.status}`);
  console.log("humo ok: 404 real en páginas OPS con flags apagados");
} finally {
  await stop(child);
}
