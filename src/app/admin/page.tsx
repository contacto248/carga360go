import type { Metadata } from "next";
import Link from "next/link";
import { AdminConsole } from "@/components/AdminConsole";
import { AdminNav } from "@/components/AdminNav";
import { listUsers } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { listAllDocuments } from "@/lib/documents";
import { todayChile } from "@/lib/format";
import { adminMetrics } from "@/lib/metrics";

export const metadata: Metadata = { title: "Administración", robots: { index: false, follow: false } };

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
        <p>Filtra por estado, aprueba o rechaza con motivo y abre el archivo. Los documentos que vencen en 30 días o menos quedan marcados.</p>
      </div>
      <AdminNav current="/admin" />
      <div className="notice" style={{ marginBottom: 12 }}>
        Las cuentas nuevas (mandantes y transportistas) no publican ni ofertan hasta quedar 100% acreditadas.{" "}
        <Link href="/admin/transportistas">Revisar acreditación pendiente →</Link>{" "}
        · <Link href="/admin/whatsapp">Conversaciones de WhatsApp →</Link>{" "}· <Link href="/admin/chat">Chat de la web →</Link>
      </div>
      <AdminConsole users={listUsers()} documents={listAllDocuments()} metrics={adminMetrics()} today={todayChile()} />
    </div>
  );
}
