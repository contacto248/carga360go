import { costHintFor } from "@/lib/costos/hint";
import type { Metadata } from "next";
import { ManualReadonlyBanner } from "@/components/ManualReadonlyBanner";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadCard } from "@/components/Cards";
import { OffersPanel } from "@/components/OffersPanel";
import { TripBoard } from "@/components/TripBoard";
import { accreditationOf } from "@/lib/accreditation";
import { loadForViewer, loadVisibility, marketplaceViewer } from "@/lib/access";
import { equipmentById } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/current-user";
import { todayChile } from "@/lib/format";
import { getLoad, listOwn } from "@/lib/listings";
import { awardedContact, canOffer, effectiveAllowImprove, offersOpen, offersVisibleTo } from "@/lib/offers";
import { getSettings } from "@/lib/settings";
import { tratoDeCarga } from "@/lib/qr/deal";
import { qrFase1Enabled } from "@/lib/qr/flag";
import { tripView } from "@/lib/viaje";
import { driverLocationHref } from "@/lib/ops/gps/flag";
import { trackingCodeFor, trackingCodeVisibleTo } from "@/lib/agent/tracking";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const viewer = await getCurrentUser();
  const load = getLoad(id);
  // Adjudicadas o cerradas: no indexar ni revelar ruta/peso a quien no es parte.
  if (!load || loadVisibility(load, viewer) === "hidden") {
    return { title: "Carga no encontrada", robots: { index: false, follow: false } };
  }
  const title = `Carga ${load.origin} → ${load.destination} · ${equipmentById(load.equipment).label}`;
  return {
    title,
    description: `${title}, ${load.weightT} t. Transportistas verificados pueden ofertar en Carga360go.`,
    alternates: { canonical: `/cargas/${id}` },
    robots: load.status === "abierta" ? undefined : { index: false, follow: true },
  };
}

export default async function CargaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await marketplaceViewer();
  const { id } = await params;
  const visible = loadForViewer(id, user);
  if (!visible) notFound();
  const load = visible.load;
  const settings = getSettings();
  const viaje = tripView(load.id, user);
  const isOwner = user?.id === load.ownerId;
  // Código corto de seguimiento: solo lo ven la dueña, el transportista adjudicado y los administradores.
  const trackingCode = !load.isDemo && trackingCodeVisibleTo(load.id, user) ? trackingCodeFor(load.id) : null;
  let mode: "owner" | "admin" | "carrier" | "carrier_locked" | "guest" | "other" = "guest";
  let lockReason = "";
  if (user) {
    if (isOwner) mode = "owner";
    else if (user.role === "admin") mode = "admin";
    else if (user.role === "transportista") {
      if (canOffer(user)) mode = "carrier";
      else {
        mode = "carrier_locked";
        const missing = accreditationOf(user.id).missing;
        lockReason = `Para ofertar tu cuenta debe estar verificada.${missing.length ? ` Falta: ${missing.join(", ")}.` : ""} Revisa "Acreditación" en tu panel.`;
      }
    } else mode = "other";
  }
  const trucks =
    mode === "carrier" && user
      ? listOwn(user.id).trucks.map((truck) => ({ id: truck.id, label: `${equipmentById(truck.equipment).label} ${truck.tonnage} t · ${truck.origin} → ${truck.destination}` }))
      : [];
  const gpsHref = viaje ? driverLocationHref(load.id) : null;
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Detalle de la carga</h1>
        <p>
          <Link href="/cargas">← Volver a cargas</Link>
        </p>
      </div>
      <ManualReadonlyBanner user={user} />
      {trackingCode ? (
        <p className="notice" style={{ margin: "0 0 12px" }}>
          Código de seguimiento: <strong>{trackingCode}</strong>. Con él y un código de un solo uso enviado al contacto registrado de la dueña de la carga,
          el asistente puede informar el estado sin iniciar sesión. No lo comparta con quien no deba ver esta carga.
        </p>
      ) : null}
      <LoadCard load={load} canManage={isOwner} priceHint={settings.showSuggestedPrice ? costHintFor(load) : null} showOfferButton={false} />
      {load.isDemo ? null : (
        <OffersPanel
          loadId={load.id}
          loadRoute={`${load.origin} → ${load.destination}`}
          status={load.status}
          offersOpen={offersOpen(load)}
          offersUntil={load.offersUntil}
          allowImprove={effectiveAllowImprove(load)}
          budgetClp={load.budgetClp}
          pickupDate={load.pickupDate}
          today={todayChile()}
          mode={mode}
          lockReason={lockReason}
          offers={offersVisibleTo(load.id, user)}
          trucks={trucks}
          awardedContact={awardedContact(load.id, user)}
        />
      )}
      {gpsHref ? (
        <p className="meta">
          <Link href={gpsHref}>Informar ubicación del viaje</Link>
        </p>
      ) : null}
      {qrFase1Enabled() && viaje && tratoDeCarga(load.id) ? (
        <p className="notice">
          <Link href={isOwner ? `/viajes/${load.id}/comprobante` : `/viajes/${load.id}/escanear`}>Abrir el trato y el QR de retiro</Link>
        </p>
      ) : null}
      {viaje ? <TripBoard loadId={load.id} initial={viaje} /> : null}
    </div>
  );
}
