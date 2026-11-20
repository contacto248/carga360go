import type { Metadata } from "next";
import Link from "next/link";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: "Legal y privacidad",
  description: "Índice de los documentos legales de Carga360go: privacidad, términos, cookies y pagos.",
  alternates: { canonical: "/legal" },
};

export default function LegalPage() {
  const pagos = paymentsLegalPublished();
  return (
    <div className="wrap legal" style={{ paddingBottom: 48 }}>
      <div className="page-title">
        <h1>Legal y privacidad</h1>
        <p>Los textos están en su página. Aquí solo se reúnen los accesos.</p>
      </div>
      <ul className="card" style={{ display: "grid", gap: 12, padding: 20, margin: 0, listStyle: "none" }}>
        <li>
          <Link href="/privacidad">Política de privacidad</Link>
        </li>
        <li>
          <Link href="/privacidad#cookies">Cookies</Link>
        </li>
        <li>
          <Link href="/privacidad#ley-21719">Ley 21.719</Link>
        </li>
        <li>
          <Link href="/terminos">Términos de uso</Link>
        </li>
        {pagos ? (
          <li>
            <Link href="/politica-de-pagos">Política de pagos</Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
