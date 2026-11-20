import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComprobanteScreen } from "@/components/qr/Pantallas";
import { AppError } from "@/lib/errors";
import { qrFase1Enabled } from "@/lib/qr/flag";
import { delegadoVigente } from "@/lib/qr/handoff";
import { vistaQr } from "@/lib/qr/vista";

export const metadata: Metadata = { title: "Entrega en bodega", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DelegadoPage({ params }: { params: Promise<{ token: string }> }) {
  if (!qrFase1Enabled()) notFound();
  const { token } = await params;
  const link = delegadoVigente(token);
  if (!link) notFound();
  try {
    const vista = await vistaQr(link.load_id, null, token);
    return (
      <ComprobanteScreen
        initial={vista}
        pollUrl={`/api/d/${token}`}
        confirmarUrl={`/api/d/${token}/confirmar`}
        fotoSrc={`/api/d/${token}/foto`}
        pdfHref={`/api/d/${token}/pdf`}
      />
    );
  } catch (error) {
    if (error instanceof AppError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
}
