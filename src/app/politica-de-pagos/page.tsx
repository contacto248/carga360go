import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarkdownLite } from "@/lib/markdown-lite";
import { PAYMENTS_COMING_SOON_NOTE, paymentsComingSoon, paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: "Política de pagos",
  description: "Cómo funciona el pago de fletes con Mercado Pago en Carga360go: anticipo, saldo, reclamos y reembolsos.",
  alternates: { canonical: "/politica-de-pagos" },
};
export const dynamic = "force-dynamic";

/** Solo existe con PAYMENTS_FEATURE_ENABLED=true o PAYMENTS_LEGAL_PUBLISHED=true. Texto en content/politica-de-pagos.md (borrador sujeto a revisión legal). */
export default function PoliticaPagosPage() {
  if (!paymentsLegalPublished()) notFound();
  const source = fs.readFileSync(path.join(process.cwd(), "content", "politica-de-pagos.md"), "utf8");
  return (
    <div className="wrap legal" style={{ paddingBottom: 30 }}>
      {paymentsComingSoon() ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          {PAYMENTS_COMING_SOON_NOTE}
        </div>
      ) : null}
      <div className="card">
        <MarkdownLite source={source} />
      </div>
    </div>
  );
}
