/** ISO yyyy-mm-dd a fecha chilena dd-mm-aaaa. Vacío si no es una fecha ISO. */
export function isoAFechaChilena(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !fechaChilenaAIso(`${match[3]}-${match[2]}-${match[1]}`)) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Fecha chilena dd-mm-aaaa a ISO yyyy-mm-dd. Rechaza barras y meses imposibles. */
export function fechaChilenaAIso(value: string): string | null {
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
