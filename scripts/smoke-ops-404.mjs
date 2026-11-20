/**
 * Humo contra `next start`: con los flags OPS apagados, las páginas OPS
 * responden 404 antes de renderizar. Reconstruye con esos flags apagados,
 * porque Next deja UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED fijo en el artefacto.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(repo, "node_modules/next/dist/bin/next");

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
for (const name of ["UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED", "OPS_FEATURE_ENABLED", "OPS_ALLOCATION_ENABLED", "OPS_PROCUREMENT_ENABLED", "OPS_ALLOCATION_AUTO", "OPS_API_V1_ENABLED", "OPS_OPERACION_ENABLED"]) {
  env[name] = "false";
}

let built = 1;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  built = await new Promise((resolve) => {
    const build = spawn(process.execPath, [nextBin, "build"], { cwd: repo, env, stdio: "inherit" });
    build.once("exit", (code) => resolve(code ?? 1));
  });
  if (built === 0) break;
  console.error(`next build intento ${attempt} salió ${built}`);
  if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
}
if (built !== 0) process.exit(built);

const chunks = [];
const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
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

  const pages = ["/admin/ops/asignacion", "/admin/ops/operacion", "/admin/ops/futura", "/viajes/prueba/ubicacion", "/clientes", "/documentos", "/finanzas"];
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
  const contactoHtml = await contacto.text();
  for (const href of ["/clientes", "/documentos", "/finanzas"]) {
    if (contactoHtml.includes(`href="${href}"`)) throw new Error(`el menú enlaza ${href} con el flag apagado`);
  }
  const sitemap = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
  const sitemapXml = await sitemap.text();
  if (sitemap.status !== 200) throw new Error(`/sitemap.xml respondió ${sitemap.status}`);
  for (const href of ["/clientes", "/documentos", "/finanzas"]) {
    if (sitemapXml.includes(`carga360go.cl${href}<`)) throw new Error(`el sitemap incluye ${href} con el flag apagado`);
  }
  console.log("humo ok: 404 real en páginas OPS y en /clientes, /documentos y /finanzas con flags apagados; sin enlaces en menú ni sitemap");
} finally {
  await stop(child);
}
