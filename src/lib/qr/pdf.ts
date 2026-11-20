import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { BRAND } from "../catalog";
import { getDb } from "../db";
import { A4, SimplePdf, wrapText } from "../pdf/simple-pdf";
import { tratoDeCarga } from "./deal";
import { asignacionVigente } from "./assignment";
import { formatPatente } from "./patente";

export type ComprobantePdf = {
  folio: string;
  origen: string;
  destino: string;
  retiro: string;
  chofer: string | null;
  patente: string | null;
  empresa: string | null;
  hito: string;
  emitido: string;
};

const ORANGE: [number, number, number] = [1, 0.478, 0.102];
const BLACK: [number, number, number] = [0.05, 0.063, 0.078];
const WHITE: [number, number, number] = [1, 1, 1];

export function buildComprobantePdf(data: ComprobantePdf): Buffer {
  const pdf = new SimplePdf();
  const margin = 48;
  pdf.rect(0, A4.height - 78, A4.width, 78, BLACK);
  pdf.rect(0, A4.height - 82, A4.width, 4, ORANGE);
  pdf.text(margin, A4.height - 40, "Carga360go", { size: 18, bold: true, color: ORANGE });
  pdf.text(margin, A4.height - 58, "Comprobante del trato", { size: 11, color: WHITE });
  pdf.text(A4.width - 220, A4.height - 46, data.folio, { size: 12, bold: true, color: WHITE });

  let y = A4.height - 120;
  const line = (label: string, value: string) => {
    pdf.text(margin, y, label, { size: 10, color: [0.35, 0.35, 0.35] });
    pdf.text(margin + 150, y, value, { size: 11, bold: true, color: BLACK });
    y -= 22;
  };
  line("Ruta", `${data.origen} → ${data.destino}`);
  line("Retiro", data.retiro);
  line("Estado", data.hito);
  if (data.chofer) line("Chofer", data.chofer);
  if (data.patente) line("Patente", formatPatente(data.patente));
  if (data.empresa) line("Empresa", data.empresa);
  line("Emitido", data.emitido);
  y -= 10;
  const notes = [
    "Este comprobante no reemplaza la guía de despacho electrónica del SII.",
    "El QR de retiro vive en la aplicación y cambia cada 30 segundos. Una copia impresa no autoriza el retiro.",
  ];
  for (const note of notes) {
    for (const row of wrapText(note, 9, A4.width - margin * 2)) {
      pdf.text(margin, y, row, { size: 9, color: BLACK });
      y -= 14;
    }
    y -= 4;
  }
  pdf.text(margin, y, BRAND.company, { size: 9, bold: true, color: ORANGE });
  return pdf.toBuffer({ title: `Comprobante ${data.folio}`, author: BRAND.company });
}

export function datosComprobante(loadId: string, now = new Date()): ComprobantePdf | null {
  const deal = tratoDeCarga(loadId);
  if (!deal?.folio) return null;
  const load = getDb()
    .prepare(
      `SELECT l.origin, l.destination, o.pickup_date FROM loads l JOIN offers o ON o.id = l.awarded_offer_id WHERE l.id = ?`,
    )
    .get(loadId) as { origin: string; destination: string; pickup_date: string } | undefined;
  if (!load) return null;
  const assignment = asignacionVigente(loadId);
  const hand = getDb().prepare(`SELECT status FROM trip_handoffs WHERE load_id = ? AND kind = 'retiro'`).get(loadId) as
    | { status: string }
    | undefined;
  const hito = hand?.status === "confirmado" ? "Retiro validado" : "Trato cerrado";
  return {
    folio: deal.folio,
    origen: load.origin,
    destino: load.destination,
    retiro: new Date(`${load.pickup_date}T12:00:00`).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }),
    chofer: assignment?.nombre ?? null,
    patente: assignment?.patente ?? null,
    empresa: assignment?.empresa ?? null,
    hito,
    emitido: now.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }),
  };
}

export function archivarComprobante(loadId: string, now = new Date()) {
  const data = datosComprobante(loadId, now);
  if (!data) return null;
  return guardarPdf(loadId, data);
}

export function guardarPdf(loadId: string, data: ComprobantePdf): { version: number; sha256: string; filename: string } {
  const bytes = buildComprobantePdf(data);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const db = getDb();
  const last = db.prepare(`SELECT MAX(version) AS v FROM trip_receipts WHERE load_id = ?`).get(loadId) as { v: number | null };
  const version = (last.v ?? 0) + 1;
  const dir = path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"), "comprobantes");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${data.folio.replace(/[^0-9A-Za-z-]/g, "")}-v${version}.pdf`;
  const file = path.join(dir, filename);
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  db.prepare(`INSERT INTO trip_receipts (id, load_id, version, pdf_path, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    randomUUID(),
    loadId,
    version,
    file,
    sha256,
    new Date().toISOString(),
  );
  return { version, sha256, filename };
}
