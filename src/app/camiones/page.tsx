import type { Metadata } from "next";
import { ManualReadonlyBanner } from "@/components/ManualReadonlyBanner";
import Link from "next/link";
import { TruckCard } from "@/components/Cards";
import { TruckFilters } from "@/components/Filters";
import { SaveSearch } from "@/components/Alerts";
import { EmptyState } from "@/components/EmptyState";
import { firstParam } from "@/lib/format";
import { isPilotCorridorFilter, nearbyTrucks } from "@/lib/nearby";
import { originCounts } from "@/lib/stats";
import { listTrucks } from "@/lib/listings";
import { marketplaceViewer, redactTruck } from "@/lib/access";

const BASE: Metadata = {
  title: "Camiones disponibles por región",
  description: "Camiones y transportistas disponibles de Arica a Punta Arenas. Filtra por región de origen y destino, equipo y fecha.",
  alternates: { canonical: "/camiones" },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = ["equipo", "regionOrigen", "origen", "regionDestino", "destino", "dia", "capacidadMin", "verificados"].some(
    (key) => firstParam(sp[key]),
  );
  return filtered ? { ...BASE, robots: { index: false, follow: true } } : BASE;
}

export default async function CamionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await marketplaceViewer();
  const sp = await searchParams;
  const filters = {
    equipo: firstParam(sp.equipo),
    regionOrigen: firstParam(sp.regionOrigen),
    origen: firstParam(sp.origen),
    regionDestino: firstParam(sp.regionDestino),
    destino: firstParam(sp.destino),
    dia: firstParam(sp.dia),
    capacidadMin: firstParam(sp.capacidadMin),
    verificados: firstParam(sp.verificados),
    orden: firstParam(sp.orden),
  };
  const filtered = Object.entries(filters).some(([key, value]) => value && key !== "orden");
  const alert = <SaveSearch kind="camiones" filters={filters} loggedIn={Boolean(viewer)} />;
  const trucks = listTrucks(filters).map((truck) => redactTruck(truck, viewer));
  const nearby = trucks.length === 0 && filtered ? nearbyTrucks(filters, trucks.map((truck) => truck.id)) : [];
  return (
    <div className="wrap">
      <div className="page-title row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Camiones disponibles</h1>
          <p>Camiones disponibles por región y corredor, de Arica a Punta Arenas, en una ventana de fechas.</p>
        </div>
        <Link className="btn" href="/camiones/nuevo">
          + Publicar camión gratis
        </Link>
      </div>
      <ManualReadonlyBanner user={viewer} />
      <TruckFilters value={filters} counts={originCounts("camiones")} />
      <div className="list-bar">
        <span className="meta">{trucks.length === 1 ? "1 resultado" : `${trucks.length} resultados`}</span>
        {trucks.length > 0 ? alert : null}
      </div>
      {!viewer ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          🔒 El contacto (empresa y WhatsApp) solo se muestra cuando se adjudica una oferta, y solo entre las dos partes.{" "}
          <Link href="/registro">Regístrate</Link> o <Link href="/ingreso">ingresa</Link>.
        </div>
      ) : null}

      {trucks.length === 0 ? (
        <EmptyState
          kind="camiones"
          filtered={filtered}
          alert={alert}
          pilot={isPilotCorridorFilter(filters)}
          nearby={
            nearby.length ? (
              <div className="nearby">
                <h4>Avisos cercanos</h4>
                <p className="meta">Misma región, fechas próximas u otro equipo, solo si existen de verdad.</p>
                <div className="grid c2">
                  {nearby.map((hit) => (
                    <div key={hit.item.id}>
                      <p className="meta">{hit.why}</p>
                      <TruckCard truck={redactTruck(hit.item, viewer)} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          }
        />
      ) : (
        <div className="grid c2">
          {trucks.map((truck) => (
            <TruckCard key={truck.id} truck={truck} />
          ))}
        </div>
      )}
    </div>
  );
}
