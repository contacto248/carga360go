import Link from "next/link";
import { AdminConsole } from "@/components/AdminConsole";
import { listUsers } from "@/lib/auth";
import { listAllDocuments } from "@/lib/documents";
import { todayChile } from "@/lib/format";
import { adminMetrics } from "@/lib/metrics";

/** Usuarios y documentos: el mismo consola que tenía /admin, ahora como sección del centro. */
export function ModuloUsuarios() {
  return (
    <section aria-labelledby="usuarios-titulo">
      <h2 id="usuarios-titulo">Usuarios y documentos</h2>
      <p>Filtra por estado, aprueba o rechaza con motivo y abre el archivo. Los documentos que vencen en 30 días o menos quedan marcados.</p>
      <div className="notice" style={{ marginBottom: 12 }}>
        Las cuentas nuevas (mandantes y transportistas) no publican ni ofertan hasta quedar 100% acreditadas.{" "}
        <Link href="/admin/transportistas">Revisar acreditación pendiente →</Link> · <Link href="/admin/whatsapp">Conversaciones de WhatsApp →</Link> ·{" "}
        <Link href="/admin/chat">Chat de la web →</Link>
      </div>
      <AdminConsole users={listUsers()} documents={listAllDocuments()} metrics={adminMetrics()} today={todayChile()} />
    </section>
  );
}
