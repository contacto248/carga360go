import { FAQ } from "../faq";
import { runSummaryRoutine, type RoutineBatch, type SummaryOptions, type SummaryResult } from "./routine";

/** Mismo contenido público de `/faq`, leído del módulo. No hace HTTP y no toca producción. */
export function publicFaqBatch(): RoutineBatch {
  return {
    session: { url: "/faq", status: 200 },
    rows: FAQ.map((item) => ({
      title: item.q,
      amountText: null,
      dateText: null,
      href: "/faq",
    })),
  };
}

export function runPublicFaqSummary(options: SummaryOptions = {}): Promise<SummaryResult> {
  return runSummaryRoutine(async () => publicFaqBatch(), { rateKey: "public-faq", ...options });
}
