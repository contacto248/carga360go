/**
 * Recalcula puntajes de desempeño (OPS-202). No es un cron de producción.
 *
 *   DATABASE_PATH=/tmp/c360-score.sqlite OPS_FEATURE_ENABLED=true npx tsx scripts/ops-score.ts
 *
 * Opcional: CARRIER_USER_ID, PERIOD_START y PERIOD_END (YYYY-MM-DD).
 */
import { getDb } from "../src/lib/db";
import { isEnabled } from "../src/lib/ops/flags";
import { recalculateScores } from "../src/lib/ops/scoring";
import { AppError } from "../src/lib/errors";

if (!process.env.DATABASE_PATH || /opt\/carga360go|data\/carga360go\.sqlite/.test(process.env.DATABASE_PATH)) {
  console.error("Usa DATABASE_PATH con una base que no sea la de producción. Este script no es un cron.");
  process.exit(1);
}

if (!isEnabled("OPS_FEATURE_ENABLED")) {
  console.error("OPS_FEATURE_ENABLED no está en true. No se recalcula. Este script no es un cron de producción.");
  process.exit(1);
}

getDb();

try {
  const result = recalculateScores({
    carrierUserId: process.env.CARRIER_USER_ID?.trim() || undefined,
    periodStart: process.env.PERIOD_START?.trim() || undefined,
    periodEnd: process.env.PERIOD_END?.trim() || undefined,
  });
  console.log(
    JSON.stringify(
      {
        aviso: "Recálculo manual. No hay cron de producción.",
        rulesVersion: result.rulesVersion,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        changed: result.changed,
        carriers: result.scores.map((score) => ({
          carrierUserId: score.carrierUserId,
          score: score.score,
          level: score.level,
          onTimePct: score.onTimePct,
          events: score.events.length,
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof AppError ? error.message : "No se pudo recalcular.");
  process.exit(1);
}
