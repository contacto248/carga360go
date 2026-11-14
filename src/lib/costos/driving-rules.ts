/**
 * Tiempos de conducción y descansos según el artículo 25 bis del Código del Trabajo de Chile
 * (choferes de vehículos de carga terrestre interurbana), texto vigente en LeyChile (BCN):
 *  - "En ningún caso el trabajador podrá manejar más de cinco horas continuas, después de las cuales
 *    deberá tener un descanso cuya duración mínima será de dos horas."
 *  - "En los casos de conducción continua inferior a cinco horas el conductor tendrá derecho, al término
 *    de ella, a un descanso cuya duración mínima será de veinticuatro minutos por hora conducida."
 *  - "El trabajador deberá tener un descanso mínimo ininterrumpido de ocho horas dentro de cada
 *    veinticuatro horas."
 * Fuentes: https://www.bcn.cl/leychile/navegar?idNorma=207436 (Código del Trabajo, art. 25 bis) y
 * Dirección del Trabajo, https://www.dt.gob.cl/portal/1628/w3-article-60075.html (consultadas 14-11-2026).
 *
 * Planificación conservadora (estimación): bloques de hasta 5 h de manejo con 2 h de descanso entre bloques
 * y, para cumplir 8 h ininterrumpidas en cada 24 h, una jornada (manejo + descansos cortos + trabajo) no supera
 * 16 h antes de un descanso de 8 h. No considera relevo con segundo conductor.
 */
export const DRIVING_RULE = {
  maxContinuousH: 5,
  restAfterMaxH: 2,
  restPerHourShortBlockMin: 24,
  dailyRestH: 8,
  windowH: 24,
  citation: "Código del Trabajo, art. 25 bis (Ley 20.271 y modificaciones), choferes de carga terrestre interurbana",
  sourceUrl: "https://www.bcn.cl/leychile/navegar?idNorma=207436",
  sourceUrl2: "https://www.dt.gob.cl/portal/1628/w3-article-60075.html",
  checkedAt: "2026-11-14",
} as const;

export type DrivingPlan = {
  drivingH: number;
  shortRests: number;
  shortRestH: number;
  dailyRests: number;
  dailyRestH: number;
  workH: number;
  /** Tiempo total desde el inicio de la carga hasta el fin de la descarga. */
  totalElapsedH: number;
  /** Días calendario de servicio del conductor (redondeo hacia arriba, mínimo 1). */
  serviceDays: number;
  timeline: { kind: "trabajo" | "manejo" | "descanso" | "descanso_diario"; hours: number }[];
};

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Plan de manejo para `drivingH` horas de conducción y `workH` horas de carga/descarga/espera (mitad al inicio, mitad al final). */
export function planDriving(drivingH: number, workH = 0): DrivingPlan {
  const timeline: DrivingPlan["timeline"] = [];
  const maxSpan = DRIVING_RULE.windowH - DRIVING_RULE.dailyRestH; // 16 h
  let span = 0;
  let remaining = Math.max(0, drivingH);
  let shortRests = 0;
  let dailyRests = 0;
  const startWork = workH / 2;
  if (startWork > 0) {
    timeline.push({ kind: "trabajo", hours: r2(startWork) });
    span += startWork;
  }
  while (remaining > 1e-9) {
    if (span >= maxSpan - 1e-9) {
      timeline.push({ kind: "descanso_diario", hours: DRIVING_RULE.dailyRestH });
      dailyRests++;
      span = 0;
    }
    const block = Math.min(DRIVING_RULE.maxContinuousH, remaining, maxSpan - span);
    timeline.push({ kind: "manejo", hours: r2(block) });
    remaining -= block;
    span += block;
    if (remaining <= 1e-9) break;
    // Si el próximo bloque no cabe en la jornada tras un descanso corto, se toma el descanso diario de 8 h.
    if (span + DRIVING_RULE.restAfterMaxH + Math.min(1, remaining) > maxSpan) {
      timeline.push({ kind: "descanso_diario", hours: DRIVING_RULE.dailyRestH });
      dailyRests++;
      span = 0;
    } else {
      const rest = block >= DRIVING_RULE.maxContinuousH - 1e-9 ? DRIVING_RULE.restAfterMaxH : (block * DRIVING_RULE.restPerHourShortBlockMin) / 60;
      timeline.push({ kind: "descanso", hours: r2(rest) });
      shortRests++;
      span += rest;
    }
  }
  const endWork = workH - startWork;
  if (endWork > 0) {
    // La descarga también es trabajo: si no cabe en la jornada, primero el descanso diario.
    if (span + endWork > maxSpan + 1e-9) {
      timeline.push({ kind: "descanso_diario", hours: DRIVING_RULE.dailyRestH });
      dailyRests++;
    }
    timeline.push({ kind: "trabajo", hours: r2(endWork) });
  }
  const shortRestH = timeline.filter((t) => t.kind === "descanso").reduce((s, t) => s + t.hours, 0);
  const dailyRestH = dailyRests * DRIVING_RULE.dailyRestH;
  const total = timeline.reduce((s, t) => s + t.hours, 0);
  return {
    drivingH: r2(drivingH),
    shortRests,
    shortRestH: r2(shortRestH),
    dailyRests,
    dailyRestH,
    workH: r2(workH),
    totalElapsedH: r2(total),
    serviceDays: Math.max(1, Math.ceil(total / 24 - 1e-9)),
    timeline,
  };
}
