import type { Metadata } from "next";
import { FreeBanner } from "@/components/FreeBanner";
import { ManualReadonlyBanner } from "@/components/ManualReadonlyBanner";
import { TruckForm } from "@/components/TruckForm";
import { AccreditationPanel } from "@/components/AccreditationPanel";
import { accreditationOf } from "@/lib/accreditation";
import { marketplaceViewer } from "@/lib/access";
import { todayChile } from "@/lib/format";
import { qrFase1Enabled } from "@/lib/qr/flag";

export const metadata: Metadata = { title: "Publicar camión disponible", description: "Publica tu camión disponible con corredor, fechas y ficha técnica, y encuentra cargas de ida y de retorno.", alternates: { canonical: "/camiones/nuevo" } };

export default async function NuevoCamionPage() {
  const user = await marketplaceViewer();
  const today = todayChile();
  const acc = user && user.role !== "admin" ? accreditationOf(user.id) : null;
  if (acc && !acc.accredited) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="page-title">
          <h1>Publicar camión disponible</h1>
          <p>Para publicar, tu cuenta debe estar verificada. Completa lo que falta y te avisaremos cuando un administrador la apruebe.</p>
        </div>
        <ManualReadonlyBanner user={user} />
        <FreeBanner user={user} />
        <AccreditationPanel acc={acc} role={user!.role} />
      </div>
    );
  }
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Publicar camión disponible</h1>
        <p>Tu corredor, tus fechas y la ficha técnica según el tipo de equipo. Te avisamos por correo cuando aparece una carga que calza.</p>
      </div>
      <FreeBanner user={user} />
      <TruckForm
        user={user}
        today={today}
        pedirPatente={qrFase1Enabled()}
        initial={{
          equipment: "cama_baja",
          origin: "Santiago",
          destination: "Antofagasta",
          availableFrom: today,
          availableTo: today,
          tonnage: "",
          specs: {},
          notes: "",
        }}
      />
    </div>
  );
}
