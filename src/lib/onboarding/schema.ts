import type { Database } from "better-sqlite3";
import { getDb } from "../db";

/** Tabla de recordatorios ya enviados. Se crea al correr el job, no al arrancar el sitio. */
export function ensureOnboardingSchema(db: Database = getDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK (stage IN ('24h', '3d', 'deadline_2d')),
      delivery TEXT,
      sent_at TEXT NOT NULL,
      UNIQUE (user_id, stage)
    );
    CREATE INDEX IF NOT EXISTS idx_onboarding_reminders_user ON onboarding_reminders(user_id);
  `);
}
