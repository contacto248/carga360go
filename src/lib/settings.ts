import { getDb } from "./db";
import { AppError } from "./errors";

/** Valores por defecto de la plataforma, editables por el administrador. Cada carga puede sobrescribirlos. */
export type AppSettings = {
  offerHours: number;
  allowImprove: boolean;
  showSuggestedPrice: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = { offerHours: 24, allowImprove: true, showSuggestedPrice: false };
export const OFFER_HOUR_CHOICES = [2, 6, 12, 24, 48, 72, 168] as const;

export function getSettings(): AppSettings {
  const rows = getDb().prepare(`SELECT key, value FROM app_settings`).all() as { key: string; value: string }[];
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const hours = Number(map.get("offer_hours"));
  return {
    offerHours: Number.isInteger(hours) && hours >= 1 && hours <= 720 ? hours : DEFAULT_SETTINGS.offerHours,
    allowImprove: map.has("allow_improve") ? map.get("allow_improve") === "1" : DEFAULT_SETTINGS.allowImprove,
    showSuggestedPrice: map.has("show_suggested_price") ? map.get("show_suggested_price") === "1" : DEFAULT_SETTINGS.showSuggestedPrice,
  };
}

export function saveSettings(input: Partial<Record<keyof AppSettings, unknown>>): AppSettings {
  const db = getDb();
  const stamp = new Date().toISOString();
  const put = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const apply = db.transaction(() => {
    if (input.offerHours !== undefined) {
      const hours = Number(input.offerHours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new AppError("El plazo para ofertar debe ser de 1 a 720 horas.");
      put.run("offer_hours", String(hours), stamp);
    }
    if (input.allowImprove !== undefined) {
      if (typeof input.allowImprove !== "boolean") throw new AppError("Valor no válido para mejorar ofertas.");
      put.run("allow_improve", input.allowImprove ? "1" : "0", stamp);
    }
    if (input.showSuggestedPrice !== undefined) {
      if (typeof input.showSuggestedPrice !== "boolean") throw new AppError("Valor no válido para el precio sugerido.");
      put.run("show_suggested_price", input.showSuggestedPrice ? "1" : "0", stamp);
    }
  });
  apply();
  return getSettings();
}
