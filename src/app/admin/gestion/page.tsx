import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { GestionBoard } from "@/components/GestionBoard";
import { getCurrentUser } from "@/lib/current-user";
import { gestionSnapshot } from "@/lib/gestion/metrics";

export const metadata: Metadata = { title: "Control de gestión", robots: { index: false, follow: false } };

export default async function GestionPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Control de gestión</h1>
          <p>Ingresa con una cuenta administradora.</p>
          <Link className="btn" href="/ingreso?next=/admin/gestion">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Sin acceso</h1>
          <p>Esta sección es solo para administradores de Carga360go.</p>
          <Link className="btn" href="/panel">
            Volver al panel
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Control de gestión</h1>
        <p>Indicadores calculados de la base. Cuando un grupo no tiene filas se muestra [sin datos]. No hay cifras de relleno ni precios.</p>
      </div>
      <AdminNav current="/admin/gestion" />
      <GestionBoard snap={gestionSnapshot()} />
    </div>
  );
}

