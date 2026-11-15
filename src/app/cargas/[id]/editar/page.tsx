import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadForm } from "@/components/LoadForm";
import { OFFER_HOUR_CHOICES, getSettings } from "@/lib/settings";
import { loadVisibility, marketplaceViewer } from "@/lib/access";
import { todayChile } from "@/lib/format";
import { getLoad } from "@/lib/listings";

export const metadata: Metadata = { title: "Editar carga", robots: { index: false, follow: false } };

export default async function EditarCargaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await marketplaceViewer();
  const { id } = await params;
  const load = getLoad(id);
  if (!load || loadVisibility(load, user) === "hidden") notFound();
  if (!user || user.id !== load.ownerId) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>No puedes editar esta carga</h1>
          <p>Solo quien la publicó puede modificarla.</p>
          <Link className="btn" href={`/cargas/${id}`}>
            Ver publicación
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Editar carga</h1>
        <p>Actualiza la ruta, el peso o los requisitos. El aviso sigue publicado con los datos nuevos.</p>
      </div>
      <LoadForm
        defaults={{ ...getSettings(), hourChoices: OFFER_HOUR_CHOICES }}
        user={user}
        today={todayChile()}
        initial={{
          id: load.id,
          equipment: load.equipment,
          origin: load.origin,
          destination: load.destination,
          pickupDate: load.pickupDate,
          weightT: String(load.weightT),
          description: load.description,
          specs: load.specs,
          budgetClp: load.budgetClp ? String(load.budgetClp) : "",
          notes: load.notes || "",
          soloVerificados: load.soloVerificados,
          inmediata: load.inmediata,
          offerHours: "",
          allowImprove: load.allowImprove === null ? "" : load.allowImprove ? "si" : "no",
        }}
      />
    </div>
  );
}
