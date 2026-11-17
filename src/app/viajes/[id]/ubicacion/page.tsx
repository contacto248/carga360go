import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DriverGpsPanel } from "@/components/DriverGpsPanel";
import { getCurrentUser } from "@/lib/current-user";
import { getLoad } from "@/lib/listings";
import { opsGpsEnabled } from "@/lib/ops/gps/flag";
import { tripView } from "@/lib/viaje";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ubicación del viaje",
  robots: { index: false, follow: false },
};

/** El 404 HTTP lo pone el middleware. Esto evita pintar el panel si esa capa no corrió. */
export default async function DriverLocationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!opsGpsEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();
  const { id } = await params;
  const viaje = tripView(id, user);
  const load = getLoad(id);
  if (!viaje || !load) notFound();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Ubicación del viaje</h1>
        <p>
          <Link href={`/cargas/${id}`}>← Volver a la carga</Link>
        </p>
      </div>
      <p>
        {load.origin} → {load.destination}. Estado declarado: {viaje.label}.
      </p>
      <DriverGpsPanel loadId={id} canSimulate={user.role === "admin"} />
    </div>
  );
}
