import { formatClp, todayChile } from "../format";
import { keepRawAndClean, type MemoryRecord, type RawRecord } from "./extract";
import { guardAutomationRate } from "./rate";
import { withRetry, type RetryOptions } from "./retry";
import { isSessionExpired, SessionExpiredError, type SessionSignal } from "./session";

export type RoutineBatch = {
  session: SessionSignal;
  rows: RawRecord[];
};

export type SummarySource = () => Promise<RoutineBatch>;

export type SummaryOptions = RetryOptions & {
  now?: Date;
  rateKey?: string;
  limit?: number;
  windowMs?: number;
};

export type SummaryResult = {
  markdown: string;
  records: MemoryRecord[];
};

export function renderSummary(records: MemoryRecord[], now: Date): string {
  const lines = [
    `# Resumen Carga360go — ${todayChile(now)}`,
    "",
    "Rutina en memoria. No llama a xAI y no escribe en disco.",
    "",
    `Registros: ${records.length}`,
    "",
  ];
  for (const { clean } of records) {
    const amount = clean.amountClp == null ? "sin monto" : `$${formatClp(clean.amountClp)}`;
    const date = clean.date ?? "sin fecha";
    lines.push(`- ${clean.title} · ${amount} · ${date}`);
  }
  if (records.length === 0) lines.push("Sin registros.");
  return lines.join("\n");
}

/**
 * Resumen reutilizable para una rutina de Grok Bots.
 * El `source` ya trae los datos (API o módulo). No hay cron, no hay red propia y no llama a xAI.
 * raw + clean quedan en el objeto devuelto, en memoria.
 */
export async function runSummaryRoutine(source: SummarySource, options: SummaryOptions = {}): Promise<SummaryResult> {
  guardAutomationRate(options.rateKey ?? "summary", options.limit, options.windowMs);
  const batch = await withRetry(async () => {
    const next = await source();
    if (isSessionExpired(next.session)) throw new SessionExpiredError();
    return next;
  }, options);
  const records = batch.rows.map((row) => keepRawAndClean(row));
  return { markdown: renderSummary(records, options.now ?? new Date()), records };
}
