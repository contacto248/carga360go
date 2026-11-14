import type { Metadata } from "next";
import { paymentsEnabled } from "@/lib/pagos/config";
import { FreeBanner } from "@/components/FreeBanner";
import { TermsBody } from "@/components/PolicyBody";
import { getCurrentUser } from "@/lib/current-user";
import { termsMeta } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Términos de uso",
  description:
    "Condiciones de uso de Carga360go para transportistas, mandantes y empresas con carga: acreditación, contactos, campaña de inscripción con 30 días gratis y futura membresía.",
  alternates: { canonical: "/terminos" },
};
export const dynamic = "force-dynamic";

export default async function TerminosPage() {
  const meta = termsMeta();
  const user = await getCurrentUser();
  return (
    <div className="wrap legal" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Términos de uso</h1>
        <p>
          Versión {meta.version} · vigentes desde el {meta.updated}
        </p>
      </div>
      <FreeBanner user={user} />
      <div className="card">
        <TermsBody />
        {paymentsEnabled() ? null : (        <p className="meta">
          Descarga: <a href="/carga360go-terminos-uso.pdf">PDF</a> · <a href="/carga360go-terminos-uso.docx">Word (DOCX)</a>
        </p>
        )}
      </div>
    </div>
  );
}
