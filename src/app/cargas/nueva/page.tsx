import type { Metadata } from "next";
import { Suspense } from "react";
import { FreeBanner } from "@/components/FreeBanner";
import { ManualReadonlyBanner } from "@/components/ManualReadonlyBanner";
import { LoadForm } from "@/components/LoadForm";
import { RetomarBorrador } from "@/components/RetomarBorrador";
import { OFFER_HOUR_CHOICES, getSettings } from "@/lib/settings";
import { AccreditationPanel } from "@/components/AccreditationPanel";
import { accreditationOf } from "@/lib/accreditation";
import { marketplaceViewer } from "@/lib/access";
import { todayChile } from "@/lib/format";
import { leerBorrador, rutaConBorrador } from "@/lib/portada-intencion";

export const metadata: Metadata = { title: "Publicar carga", description: "Publica tu carga general o masiva con región de origen y destino y encuentra camiones compatibles en todo Chile.", alternates: { canonical: "/cargas/nueva" } };

export default async function NuevaCargaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const borrador = leerBorrador(params, "carga");
  const resumePath = borrador ? rutaConBorrador(borrador) : "/cargas/nueva";
  const user = await marketplaceViewer();
  const today = todayChile();
  const acc = user && user.role !== "admin" ? accreditationOf(user.id) : null;
  const nota = borrador ? (
    <p className="notice">
      Ruta anotada: {borrador.origen} → {borrador.destino}. Nada se ha publicado. El formulario la retoma cuando puedas continuar.
    </p>
  ) : null;
  if (acc && !acc.accredited) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <Suspense fallback={null}>
          <RetomarBorrador rol="carga" />
        </Suspense>
        <div className="page-title">
          <h1>Publicar carga</h1>
          <p>Para publicar, tu cuenta debe estar verificada. Completa lo que falta y te avisaremos cuando un administrador la apruebe.</p>
        </div>
        {nota}
        <ManualReadonlyBanner user={user} />
        <FreeBanner user={user} />
        <AccreditationPanel acc={acc} role={user!.role} />
      </div>
    );
  }
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <Suspense fallback={null}>
        <RetomarBorrador rol="carga" />
      </Suspense>
      <div className="page-title">
        <h1>Publicar carga</h1>
        <p>Tres pasos: ruta, carga y precio. Avisamos por correo a los camiones que calzan.</p>
      </div>
      {nota}
      <FreeBanner user={user} />
      <LoadForm
        defaults={{ ...getSettings(), hourChoices: OFFER_HOUR_CHOICES }}
        user={user}
        today={today}
        resumePath={resumePath}
        initial={{
          equipment: borrador?.equipo ?? "rampla_plana",
          origin: borrador?.origen ?? "Santiago",
          destination: borrador?.destino ?? "Concepción",
          pickupDate: today,
          weightT: "",
          description: "",
          specs: {},
          budgetClp: "",
          notes: "",
          soloVerificados: false,
          inmediata: false,
          offerHours: "",
          allowImprove: "",
        }}
      />
    </div>
  );
}
