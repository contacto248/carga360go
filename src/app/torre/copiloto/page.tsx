import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopilotoVista } from "@/components/vistas/OperacionVista";
import { uiVistaHidden } from "@/lib/vistas/flag";

export const metadata: Metadata = {
  title: "Copiloto",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** No reemplaza /agente-360go ni /admin/agente. */
export default function CopilotoPage() {
  if (uiVistaHidden("/torre/copiloto")) notFound();
  return <CopilotoVista />;
}
