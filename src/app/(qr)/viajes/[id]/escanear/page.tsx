import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EscanerScreen } from "@/components/qr/Pantallas";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import { qrFase1Enabled } from "@/lib/qr/flag";
import { vistaQr } from "@/lib/qr/vista";

export const metadata: Metadata = { title: "Escanear retiro", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EscanearPage({ params }: { params: Promise<{ id: string }> }) {
  if (!qrFase1Enabled()) notFound();
  const { id } = await params;
  const user = await getCurrentUser();
  try {
    const vista = await vistaQr(id, user);
    if (vista.rol === "mandante" || vista.rol === "delegado") redirect(`/viajes/${id}/comprobante`);
    return <EscanerScreen initial={vista} />;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
