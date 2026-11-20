import type { Metadata } from "next";
import { Suspense } from "react";
import { FreeBanner } from "@/components/FreeBanner";
import { ManualReadonlyBanner } from "@/components/ManualReadonlyBanner";
import { TruckForm } from "@/components/TruckForm";
import { RetomarBorrador } from "@/components/RetomarBorrador";
import { AccreditationPanel } from "@/components/AccreditationPanel";
import { accreditationOf } from "@/lib/accreditation";
import { marketplaceViewer } from "@/lib/access";
import { todayChile } from "@/lib/format";
import { leerBorrador, rutaConBorrador } from "@/lib/portada-intencion";

export const metadata: Metadata = { title: "Publicar camión disponible", description: "Publica tu camión disponible con corredor, fechas y ficha técnica, y encuentra cargas de ida y de retorno.", alternates: { canonical: "/camiones/nuevo" } };

export default async function NuevoCamionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const borrador = leerBorrador(params, "transporte");
  const resumePath = borrador ? rutaConBorrador(borrador) : "/camiones/nuevo";
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
          <RetomarBorrador rol="transporte" />
        </Suspense>
        <div className="page-title">
          <h1>Publicar camión disponible</h1>
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
        <RetomarBorrador rol="transporte" />
      </Suspense>
      <div className="page-title">
        <h1>Publicar camión disponible</h1>
        <p>Tu corredor, tus fechas y la ficha técnica según el tipo de equipo. Te avisamos por correo cuando aparece una carga que calza.</p>
      </div>
      {nota}
      <FreeBanner user={user} />
      <TruckForm
        user={user}
        today={today}
        resumePath={resumePath}
        initial={{
          equipment: borrador?.equipo ?? "cama_baja",
          origin: borrador?.origen ?? "Santiago",
          destination: borrador?.destino ?? "Antofagasta",
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
