import type { Metadata } from "next";
import { FreeBanner } from "@/components/FreeBanner";
import { LoadForm } from "@/components/LoadForm";
import { OFFER_HOUR_CHOICES, getSettings } from "@/lib/settings";
import { AccreditationPanel } from "@/components/AccreditationPanel";
import { accreditationOf } from "@/lib/accreditation";
import { marketplaceViewer } from "@/lib/access";
import { todayChile } from "@/lib/format";

export const metadata: Metadata = { title: "Publicar carga", description: "Publica tu carga general o masiva con región de origen y destino y encuentra camiones compatibles en todo Chile.", alternates: { canonical: "/cargas/nueva" } };

export default async function NuevaCargaPage() {
  const user = await marketplaceViewer();
  const today = todayChile();
  const acc = user && user.role !== "admin" ? accreditationOf(user.id) : null;
  if (acc && !acc.accredited) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="page-title">
          <h1>Publicar carga</h1>
          <p>Para publicar, tu cuenta debe estar verificada. Completa lo que falta y te avisaremos cuando un administrador la apruebe.</p>
        </div>
        <FreeBanner user={user} />
        <AccreditationPanel acc={acc} role={user!.role} />
      </div>
    );
  }
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Publicar carga</h1>
        <p>Tres pasos: ruta, carga y precio. Gratis durante tus 30 días desde la inscripción y avisamos por correo a los camiones que calzan.</p>
      </div>
      <FreeBanner user={user} />
      <LoadForm
        defaults={{ ...getSettings(), hourChoices: OFFER_HOUR_CHOICES }}
        user={user}
        today={today}
        initial={{
          equipment: "rampla_plana",
          origin: "Santiago",
          destination: "Concepción",
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
