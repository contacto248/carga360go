/**
 * Ventana de reclamo en horas hábiles (spec §7): lunes a viernes, sin feriados de Chile,
 * zona America/Santiago. Se cuentan horas completas de reloj de los días hábiles.
 * Los feriados se reciben como lista (PAYMENTS_CL_HOLIDAYS); no se inventan en el código.
 */
const TZ = "America/Santiago";
const HOUR = 60 * 60 * 1000;

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });

function chileDay(at: Date): { date: string; weekday: string } {
  const parts = fmt.formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday") };
}

export function isBusinessInstant(at: Date, holidays: ReadonlySet<string>): boolean {
  const { date, weekday } = chileDay(at);
  if (weekday === "Sat" || weekday === "Sun") return false;
  return !holidays.has(date);
}

/** Suma `hours` horas hábiles a `start`. Si `start` cae en día no hábil, el conteo parte el siguiente día hábil. */
export function addBusinessHours(start: Date, hours: number, holidayList: readonly string[] = []): Date {
  if (!Number.isInteger(hours) || hours < 0) throw new Error("Horas inválidas.");
  const holidays = new Set(holidayList);
  let cursor = start.getTime();
  let remaining = hours * HOUR;
  // Avanza en pasos de hasta una hora, sin pasar el siguiente cambio de día en Chile.
  let guard = 0;
  while (remaining > 0) {
    if (++guard > 24 * 400) throw new Error("Ventana demasiado larga.");
    const step = Math.min(remaining, HOUR - (cursor % HOUR || 0) || HOUR);
    if (isBusinessInstant(new Date(cursor), holidays)) remaining -= step;
    cursor += step;
  }
  return new Date(cursor);
}
