import { z } from "zod";
import { normalizeClp, normalizeDate, parseIsoDate } from "./normalize";

export const cleanRecordSchema = z.object({
  title: z.string().trim().min(1, "Título vacío").max(300, "Título demasiado largo"),
  amountClp: z.number().int().nonnegative().nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(parseIsoDate, "Fecha inválida")
    .nullable(),
  href: z
    .string()
    .max(200)
    .refine(
      (value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.includes(" "),
      "Ruta interna",
    )
    .nullable(),
});

export type CleanRecord = z.infer<typeof cleanRecordSchema>;

export type RawRecord = {
  title: string;
  amountText?: string | null;
  dateText?: string | null;
  href?: string | null;
};

/** Raw y clean solo en memoria. No hay escritura a disco. */
export type MemoryRecord = {
  raw: RawRecord;
  clean: CleanRecord;
};

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function keepRawAndClean(raw: RawRecord): MemoryRecord {
  const amountText = blankToNull(raw.amountText);
  const dateText = blankToNull(raw.dateText);
  const href = blankToNull(raw.href);
  const stored: RawRecord = { title: raw.title, amountText, dateText, href };
  const amountClp = amountText == null ? null : normalizeClp(amountText);
  if (amountText != null && amountClp == null) throw new ExtractionError(`CLP inválido: ${amountText}`);
  const date = dateText == null ? null : normalizeDate(dateText);
  if (dateText != null && date == null) throw new ExtractionError(`Fecha inválida: ${dateText}`);
  const parsed = cleanRecordSchema.safeParse({ title: raw.title, amountClp, date, href });
  if (!parsed.success) {
    throw new ExtractionError(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  return { raw: stored, clean: parsed.data };
}
