import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { firstParam } from "@/lib/format";

export const metadata: Metadata = { title: "Ingresar", alternates: { canonical: "/ingreso" } };

export default async function IngresoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = firstParam(sp.ok);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Ingresar</h1>
        <p>Usa el correo y la contraseña de tu cuenta de transportista, mandante o administrador.</p>
      </div>
      {ok === "clave" ? (
        <div className="notice" style={{ background: "#effaf1", borderColor: "#c4e8cb", color: "#14532d", marginBottom: 12 }}>
          Contraseña actualizada. Ya puedes ingresar.
        </div>
      ) : null}
      <LoginForm nextPath={firstParam(sp.next)} />
      <p className="meta" style={{ marginTop: 12 }}>
        ¿No tienes cuenta? <Link href="/registro">Registrar empresa</Link>
      </p>
    </div>
  );
}
