import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isEnabled } from "@/lib/ops/flags";
import { loadOpsPanel, panelSection } from "@/lib/ops/panel";
import { OpsBoard } from "./board";

export const metadata: Metadata = { title: "Operación", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * El middleware responde 404 antes de renderizar si el flag maestro está apagado
 * o quien entra no es admin de plataforma. Esta guarda evita pintar la página si esa capa no corre.
 */
export default async function OpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isEnabled("OPS_FEATURE_ENABLED")) notFound();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();
  const params = await searchParams;
  return <OpsBoard data={loadOpsPanel(user)} section={panelSection(params.seccion)} />;
}
