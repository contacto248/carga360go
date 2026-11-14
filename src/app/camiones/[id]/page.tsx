import Link from "next/link";
import { notFound } from "next/navigation";
import { TruckCard } from "@/components/Cards";
import { marketplaceViewer, redactTruck } from "@/lib/access";
import { getTruck } from "@/lib/listings";

export default async function CamionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await marketplaceViewer();
  const { id } = await params;
  const found = getTruck(id);
  if (!found) notFound();
  const truck = redactTruck(found, user);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Detalle del camión</h1>
        <p>
          <Link href="/camiones">← Volver a camiones</Link>
        </p>
      </div>
      <TruckCard truck={truck} canManage={user?.id === truck.ownerId} />
    </div>
  );
}
