/**
 * Procesa la cola ops_jobs (vencimientos de la cascada y reintentos). No es un cron de producción.
 * No envía WhatsApp ni correo.
 *
 *   DATABASE_PATH=/tmp/c360-jobs.sqlite OPS_FEATURE_ENABLED=true OPS_ALLOCATION_ENABLED=true npx tsx scripts/ops-jobs.ts
 */
import { getDb } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { processOpsJobs } from "../src/lib/ops/allocation";
import { isEnabled } from "../src/lib/ops/flags";

if (!process.env.DATABASE_PATH || /opt\/carga360go|data\/carga360go\.sqlite/.test(process.env.DATABASE_PATH)) {
  console.error("Usa DATABASE_PATH con una base que no sea la de producción. Este script no es un cron.");
  process.exit(1);
}

if (!isEnabled("OPS_FEATURE_ENABLED") || !isEnabled("OPS_ALLOCATION_ENABLED")) {
  console.error("Los flags de asignación no están en true. No se procesan trabajos. Este script no es un cron de producción y no envía WhatsApp ni correo.");
  process.exit(1);
}

getDb();

try {
  const result = processOpsJobs();
  console.log(
    JSON.stringify(
      {
        aviso: "Proceso manual de la cola. No hay cron de producción y no se envía WhatsApp ni correo.",
        ...result,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof AppError ? error.message : "No se pudo procesar la cola.");
  process.exit(1);
}
