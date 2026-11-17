const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const daysInMonth = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month];
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIsoDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  return isRealCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Fecha a `YYYY-MM-DD`. Acepta ISO, `d-m-aaaa` / `d/m/aaaa` y `d de mes de aaaa`. */
export function normalizeDate(input: string): string | null {
  const value = input.normalize("NFKC").trim().toLowerCase();
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(value);
  const long = /^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})$/.exec(value);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (long) {
    day = Number(long[1]);
    month = MONTHS[long[2]] ?? 0;
    year = Number(long[3]);
  } else {
    return null;
  }
  if (!isRealCalendarDate(year, month, day)) return null;
  return formatIsoDate(year, month, day);
}

function roundClp(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || rounded < 0) return null;
  return rounded;
}

function parseSingleSeparator(body: string): number | null {
  const separator = body.includes(".") ? "." : ",";
  const parts = body.split(separator);
  if (parts.some((part) => part.length === 0)) return null;
  const groups = parts.slice(1);
  const thousands =
    groups.every((part) => part.length === 3) && parts[0].length >= 1 && parts[0].length <= 3;
  if (thousands) return roundClp(Number(parts.join("")));
  if (parts.length === 2 && groups[0].length >= 1 && groups[0].length <= 2) {
    return roundClp(Number(`${parts[0]}.${parts[1]}`));
  }
  return null;
}

/**
 * Entero CLP. Miles con punto (Chile) o coma (en-US).
 * Si hay un solo separador y la fracción tiene 1 o 2 dígitos, se toma como decimal y se redondea.
 * Un grupo de exactamente 3 dígitos es miles (`1.250` → 1250).
 */
export function normalizeClp(input: string): number | null {
  const stripped = input
    .normalize("NFKC")
    .trim()
    .replace(/clp/gi, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "");
  if (!stripped || stripped.startsWith("-")) return null;
  const body = stripped.startsWith("+") ? stripped.slice(1) : stripped;
  if (!/^\d+(?:[.,]\d+)*$/.test(body)) return null;
  const dot = body.lastIndexOf(".");
  const comma = body.lastIndexOf(",");
  if (dot === -1 && comma === -1) return roundClp(Number(body));
  if (dot !== -1 && comma !== -1) {
    const decimalSep = dot > comma ? "." : ",";
    const thousandsSep = decimalSep === "." ? "," : ".";
    const cut = body.lastIndexOf(decimalSep);
    const whole = body.slice(0, cut);
    const fraction = body.slice(cut + 1);
    if (!whole || fraction.length < 1 || fraction.length > 2) return null;
    const groups = whole.split(thousandsSep);
    if (groups.some((part, index) => part.length === 0 || (index > 0 && part.length !== 3))) return null;
    if (groups.length > 1 && groups[0].length > 3) return null;
    return roundClp(Number(`${groups.join("")}.${fraction}`));
  }
  return parseSingleSeparator(body);
}
