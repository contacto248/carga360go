import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TruckForm } from "@/components/TruckForm";
import { marketplaceViewer } from "@/lib/access";
import { todayChile } from "@/lib/format";
import { getTruck } from "@/lib/listings";
import { formatPatente, resolverPatente } from "@/lib/qr/patente";

export const metadata: Metadata = { title: "Editar camión", robots: { index: false, follow: false } };

export default async function EditarCamionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await marketplaceViewer();
  const { id } = await params;
  const truck = getTruck(id);
  if (!truck) notFound();
  if (!user || user.id !== truck.ownerId) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>No puedes editar este camión</h1>
          <p>Solo quien lo publicó puede modificarlo.</p>
          <Link className="btn" href={`/camiones/${id}`}>
            Ver publicación
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Editar camión</h1>
        <p>Actualiza el corredor, las fechas o la ficha técnica.</p>
      </div>
      <TruckForm
        user={user}
        today={todayChile()}
        initial={{
          id: truck.id,
          equipment: truck.equipment,
          origin: truck.origin,
          destination: truck.destination,
          availableFrom: truck.availableFrom,
          availableTo: truck.availableTo,
          tonnage: String(truck.tonnage),
          specs: truck.specs,
          notes: truck.notes || "",
          patente: (() => {
            const found = resolverPatente(truck.id).patente;
            return found ? formatPatente(found) : "";
          })(),
        }}
      />
    </div>
  );
}
