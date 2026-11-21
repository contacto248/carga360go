import type { Metadata } from "next";
import Link from "next/link";
import { AdminConsole } from "@/components/AdminConsole";
import { AdminNav } from "@/components/AdminNav";
import { PanelOrbita } from "@/components/control/PanelOrbita";
import { listUsers } from "@/lib/auth";
import { panelOrbita } from "@/lib/control/panel-orbita";
import { getCurrentUser } from "@/lib/current-user";
import { listAllDocuments } from "@/lib/documents";
import { todayChile } from "@/lib/format";
import { adminMetrics } from "@/lib/metrics";

export const metadata: Metadata = { title: "Centro de control ÓRBITA", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Administración</h1>
          <p>Ingresa con una cuenta administradora.</p>
          <Link className="btn" href="/ingreso?next=/admin">
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
        <h1>Administración</h1>
        <p>Centro de control ÓRBITA. Filtra por estado, aprueba o rechaza con motivo y abre el archivo.</p>
      </div>
      <AdminNav current="/admin" />
      <PanelOrbita datos={panelOrbita(user)} />
      <AdminConsole users={listUsers()} documents={listAllDocuments()} metrics={adminMetrics()} today={todayChile()} />
    </div>
  );
}
