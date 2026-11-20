import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdministracionVista } from "@/components/vistas/OperacionVista";
import { getCurrentUser } from "@/lib/current-user";
import { adminMetrics } from "@/lib/metrics";
import { indicadoresAdmin } from "@/lib/vistas/datos";
import { uiVistaHidden } from "@/lib/vistas/flag";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Entrada nueva del recorrido. /admin sigue igual.
 * La ruta no existía: queda apagada salvo el texto exacto true en el maestro y en UI_ADMIN_ENABLED.
 */
export default async function AdministracionPage() {
  if (uiVistaHidden("/torre/administracion")) notFound();
  const user = await getCurrentUser();
  if (user?.role !== "admin") return <AdministracionVista kpis={[]} />;
  try {
    return <AdministracionVista kpis={indicadoresAdmin(adminMetrics())} />;
  } catch {
    return <AdministracionVista kpis={[]} />;
  }
}
