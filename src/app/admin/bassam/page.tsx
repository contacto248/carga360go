import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { BassamPanel } from "@/components/BassamPanel";
import { bassamSnapshot } from "@/lib/bassam/ops";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "BASSAM 360", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BassamPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <p>CARGA360GO</p>
          <h1>BASSAM 360</h1>
          <p>Esta sección es solo para administradores de Carga360go.</p>
          <Link className="btn" href="/ingreso?next=/admin/bassam">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  const data = bassamSnapshot(user);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <p>CARGA360GO</p>
        <h1>BASSAM 360</h1>
        <p>
          Conteos, torre de control e informe leídos de esta base. El botón Asistente IA ejecutivo abre el chat que ya está en la página.{" "}
          <Link href="/admin/control">Centro de control</Link>
        </p>
      </div>
      <AdminNav current="/admin/bassam" />
      <BassamPanel initial={data} />
    </div>
  );
}
