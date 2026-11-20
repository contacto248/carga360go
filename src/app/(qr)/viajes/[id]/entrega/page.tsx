import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ComprobanteScreen } from "@/components/qr/Pantallas";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import { vistaQr } from "@/lib/qr/vista";

export const metadata: Metadata = { title: "Entregar la carga", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EntregaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  try {
    const vista = await vistaQr(id, user);
    if (vista.rol === "transportista") redirect(`/viajes/${id}/escanear`);
    return <ComprobanteScreen initial={vista} pollUrl={`/api/viajes/${id}/comprobante`} confirmarUrl={`/api/viajes/${id}/retiro/confirmar`} />;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
