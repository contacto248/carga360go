import type { Metadata } from "next";
import { paymentsEnabled } from "@/lib/pagos/config";
import { PolicyBody } from "@/components/PolicyBody";
import { policyMeta } from "@/lib/privacy-policy";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo CARGA360 GO SpA trata los datos personales de mandantes y transportistas en Carga360go, conforme a las leyes 19.628 y 21.719.",
  alternates: { canonical: "/privacidad" },
};
export const dynamic = "force-dynamic";

export default function PrivacidadPage() {
  return (
    <div className="wrap legal" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Política de privacidad</h1>
        <p>
          Versión {policyMeta().version} · vigente desde el {policyMeta().updated}
        </p>
      </div>
      <div className="card">
        <PolicyBody />
        {paymentsEnabled() ? null : (        <p className="meta">
          Descarga: <a href="/carga360go-politica-privacidad.pdf">PDF</a> · <a href="/carga360go-politica-privacidad.docx">Word (DOCX)</a>
        </p>
        )}
      </div>
    </div>
  );
}
