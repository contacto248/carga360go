import type { Metadata } from "next";
import { ResetForm } from "@/components/PasswordForms";
import { firstParam } from "@/lib/format";

export const metadata: Metadata = { title: "Nueva contraseña", robots: { index: false, follow: false } };

export default async function RestablecerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Nueva contraseña</h1>
        <p>Elige una contraseña de al menos 8 caracteres. Las sesiones anteriores se cierran.</p>
      </div>
      <ResetForm token={firstParam(sp.token)} />
    </div>
  );
}
