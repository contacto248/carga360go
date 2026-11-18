import { equipmentById } from "../catalog";
import { getDb } from "../db";
import { appUrl } from "../mail";
import { sendEmail } from "../notify";
import { automationsNotifyEnabled, automationsWebhookUrl } from "./config";

export type NotifyResult = "omitido" | "enviado" | "sin_datos";

type PendingRow = {
  kind: "compatible" | "retorno";
  origin: string;
  destination: string;
  equipment: string;
  tonnage: number;
};

/**
 * Correo al mandante y, si está definida, una llamada al webhook.
 * No incluye teléfono ni correo del transportista, ni precio, ni WhatsApp.
 * No hace nada si AUTOMATIONS_NOTIFY_ENABLED no es exactamente "true".
 */
export async function notifyLoadSuggestions(loadId: string, deps?: { fetchImpl?: typeof fetch }): Promise<NotifyResult> {
  if (!automationsNotifyEnabled()) return "omitido";
  const db = getDb();
  const load = db
    .prepare(
      `SELECT l.origin, l.destination, l.equipment, l.weight_t AS weightT, u.email AS ownerEmail
       FROM loads l JOIN users u ON u.id = l.owner_id
       WHERE l.id = ? AND l.is_demo = 0`,
    )
    .get(loadId) as { origin: string; destination: string; equipment: string; weightT: number; ownerEmail: string } | undefined;
  if (!load) return "sin_datos";
  const pending = db
    .prepare(
      `SELECT s.kind, t.origin, t.destination, t.equipment, t.tonnage
       FROM load_suggestions s
       JOIN trucks t ON t.id = s.truck_id
       WHERE s.load_id = ? AND s.notified_at IS NULL
       ORDER BY s.kind, s.score DESC`,
    )
    .all(loadId) as PendingRow[];
  if (!pending.length) {
    const any = db.prepare(`SELECT COUNT(*) AS n FROM load_suggestions WHERE load_id = ?`).get(loadId) as { n: number };
    return any.n === 0 ? "sin_datos" : "omitido";
  }
  const compatibles = pending.filter((row) => row.kind === "compatible").length;
  const retornos = pending.filter((row) => row.kind === "retorno").length;
  const lines = pending.map((row) => {
    const equipo = equipmentById(row.equipment).label;
    const kind = row.kind === "retorno" ? "retorno" : "compatible";
    return `- ${kind}: ${row.origin} → ${row.destination}, ${equipo}, ${row.tonnage} t`;
  });
  const text = [
    "Hola,",
    "",
    `Tu carga ${load.origin} → ${load.destination} (${equipmentById(load.equipment).label}, ${load.weightT} t) tiene sugerencias automáticas.`,
    "",
    `Compatibles: ${compatibles}`,
    `Retorno: ${retornos}`,
    "",
    "Rutas, sin datos de contacto del transportista y sin tarifa:",
    ...lines,
    "",
    "Tarifa: [sin datos]. Te contactamos si hace falta coordinar.",
    "La política publicada no ofrece días sin costo.",
    "",
    `Detalle: ${appUrl()}/cargas/${loadId}`,
    "",
    "CARGA360GO SpA",
  ].join("\n");
  await sendEmail(load.ownerEmail, "Carga360go: sugerencias para tu carga", text);
  const webhook = automationsWebhookUrl();
  if (webhook) {
    try {
      const url = new URL(webhook);
      if (url.protocol === "https:" || url.protocol === "http:") {
        const call = deps?.fetchImpl ?? fetch;
        await call(url.toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event: "carga.sugerencias", loadId, compatibles, retornos }),
          signal: AbortSignal.timeout(5000),
        });
      }
    } catch (error) {
      console.error("[carga360go] webhook de automatización", error instanceof Error ? error.name : "error");
    }
  }
  db.prepare(`UPDATE load_suggestions SET notified_at = ? WHERE load_id = ? AND notified_at IS NULL`).run(new Date().toISOString(), loadId);
  return "enviado";
}

