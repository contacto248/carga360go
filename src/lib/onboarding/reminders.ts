import { randomUUID } from "crypto";
import { addDaysIso } from "../campaign";
import { getDb } from "../db";
import { todayChile } from "../format";
import { sendEmail, type Delivery } from "../notify";
import { type OnboardingStage, onboardingRemindersEnabled, remindersAfterIso } from "./config";
import { buildReminderEmail } from "./messages";
import { ensureOnboardingSchema } from "./schema";
import { onboardingStatusOf } from "./status";

const HOUR = 60 * 60 * 1000;

export type ReminderJobResult = {
  enabled: boolean;
  scanned: number;
  sent: number;
  skipped: number;
};

function alreadySent(userId: string, stage: OnboardingStage): boolean {
  const row = getDb()
    .prepare(`SELECT 1 AS ok FROM onboarding_reminders WHERE user_id = ? AND stage = ?`)
    .get(userId, stage) as { ok: number } | undefined;
  return Boolean(row);
}

function markSent(userId: string, stage: OnboardingStage, delivery: Delivery | "omitido", now: Date): void {
  getDb()
    .prepare(`INSERT OR IGNORE INTO onboarding_reminders (id, user_id, stage, delivery, sent_at) VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, stage, delivery, now.toISOString());
}

/** Etapa más avanzada que ya corresponde enviar, o null. */
export function dueStageOf(
  createdAt: string,
  docsDeadline: string | null,
  now = new Date(),
): OnboardingStage | null {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return null;
  const t = now.getTime();
  if (docsDeadline) {
    const windowStart = addDaysIso(docsDeadline, -2);
    const today = todayChile(now);
    if (today >= windowStart && today < docsDeadline) return "deadline_2d";
  }
  if (t >= created + 3 * 24 * HOUR) return "3d";
  if (t >= created + 24 * HOUR) return "24h";
  return null;
}

export async function sendOnboardingReminders(now = new Date()): Promise<ReminderJobResult> {
  if (!onboardingRemindersEnabled()) return { enabled: false, scanned: 0, sent: 0, skipped: 0 };
  const after = remindersAfterIso();
  if (!after) return { enabled: true, scanned: 0, sent: 0, skipped: 0 };
  ensureOnboardingSchema();
  const rows = getDb()
    .prepare(
      `SELECT id FROM users WHERE role != 'admin' AND created_at > ? ORDER BY created_at ASC`,
    )
    .all(after) as { id: string }[];
  let sent = 0;
  let skipped = 0;
  for (const row of rows) {
    const status = onboardingStatusOf(row.id, now);
    if (!status) {
      skipped += 1;
      continue;
    }
    if (status.complete) {
      skipped += 1;
      continue;
    }
    const due = dueStageOf(status.createdAt, status.docsDeadline, now);
    if (!due) {
      skipped += 1;
      continue;
    }
    if (alreadySent(status.userId, due)) {
      skipped += 1;
      continue;
    }
    // Si una etapa posterior llega antes (cron atrasado), no mandamos después las anteriores ya vencidas.
    if (due === "3d" && !alreadySent(status.userId, "24h")) {
      markSent(status.userId, "24h", "omitido", now);
    }
    if (due === "deadline_2d") {
      const created = new Date(status.createdAt).getTime();
      if (now.getTime() >= created + 24 * HOUR && !alreadySent(status.userId, "24h")) {
        markSent(status.userId, "24h", "omitido", now);
      }
      if (now.getTime() >= created + 3 * 24 * HOUR && !alreadySent(status.userId, "3d")) {
        markSent(status.userId, "3d", "omitido", now);
      }
    }
    const mail = buildReminderEmail(status, due);
    const delivery = await sendEmail(status.email, mail.subject, mail.text, [], { html: mail.html });
    markSent(status.userId, due, delivery, now);
    sent += 1;
  }
  return { enabled: true, scanned: rows.length, sent, skipped };
}
