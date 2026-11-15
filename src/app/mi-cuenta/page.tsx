import type { Metadata } from "next";
import Link from "next/link";
import { MiCuentaUpload } from "@/components/MiCuentaUpload";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MiCuentaPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="wrap" style={{ padding: "24px 0 40px" }}>
        <h1>Mi cuenta</h1>
        <p>Ingresa para subir un documento de acreditación.</p>
        <Link className="btn" href="/ingreso?next=/mi-cuenta">
          Ingresar
        </Link>
      </div>
    );
  }
  if (user.role !== "transportista" && user.role !== "mandante") {
    return (
      <div className="wrap" style={{ padding: "24px 0 40px" }}>
        <h1>Mi cuenta</h1>
        <p>La acreditación por documento es para cuentas de transportista o mandante.</p>
      </div>
    );
  }
  return (
    <div className="wrap" style={{ padding: "24px 0 40px" }}>
      <h1>Mi cuenta</h1>
      <p>
        {user.role === "mandante"
          ? "Empresa: RUT, e-RUT del SII, escritura del representante y certificado de cuenta bancaria. La lectura no aprueba el documento."
          : "Transportista: licencia, padrón y SOAP. La lectura no aprueba el documento."}
      </p>
      <MiCuentaUpload cliente={user.role} />
    </div>
  );
}
