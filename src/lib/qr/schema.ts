import fs from "fs";
import path from "path";

/**
 * Migración 034. La 033 queda sin usar a propósito.
 * El ALTER de patente se aplica aparte, solo si la columna no existe:
 * el archivo SQL lo incluye para quien revise la migración a mano.
 */
const file = path.join(process.cwd(), "docs/migrations/034-qr-trato.sql");

export function migration34Sql(): string {
  const raw = fs.readFileSync(file, "utf8");
  return raw.replace(/ALTER TABLE trucks ADD COLUMN patente TEXT;\s*/i, "");
}
