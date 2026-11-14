import { costHintFor } from "@/lib/costos/hint";
import { getSettings } from "@/lib/settings";
import { ManualReadonlyBanner } from "@/components/ManualReadonlyBanner";
import type { Metadata } from "next";
import Link from "next/link";
import { LoadCard } from "@/components/Cards";
import { LoadFilters } from "@/components/Filters";
import { SaveSearch } from "@/components/Alerts";
import { EmptyState } from "@/components/EmptyState";
import { firstParam } from "@/lib/format";
import { isPilotCorridorFilter, nearbyLoads } from "@/lib/nearby";
import { originCounts } from "@/lib/stats";
import { listLoads } from "@/lib/listings";
import { marketplaceViewer, redactLoad } from "@/lib/access";

const BASE: Metadata = {
  title: "Cargas disponibles por región",
  description: "Cargas de transporte publicadas por mandantes y empresas en las 16 regiones de Chile. Filtra por región, ciudad, equipo y fecha de retiro.",
  alternates: { canonical: "/cargas" },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = ["equipo", "regionOrigen", "origen", "regionDestino", "destino", "desde", "pesoMin", "q", "verificados", "inmediata"].some(
    (key) => firstParam(sp[key]),
  );
  return filtered ? { ...BASE, robots: { index: false, follow: true } } : BASE;
}

export default async function CargasPage({
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
    desde: firstParam(sp.desde),
    pesoMin: firstParam(sp.pesoMin),
    q: firstParam(sp.q),
    verificados: firstParam(sp.verificados),
    inmediata: firstParam(sp.inmediata),
    orden: firstParam(sp.orden),
  };
  const filtered = Object.entries(filters).some(([key, value]) => value && key !== "orden");
  const alert = <SaveSearch kind="cargas" filters={filters} loggedIn={Boolean(viewer)} />;
  const loads = listLoads(filters).map((load) => redactLoad(load, viewer));
  const nearby = loads.length === 0 && filtered ? nearbyLoads(filters, loads.map((load) => load.id)) : [];
  const showPrice = getSettings().showSuggestedPrice;
  return (
    <div className="wrap">
      <div className="page-title row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Cargas disponibles</h1>
          <p>Filtra por equipo, región y ciudad de origen o destino, y fecha. Cada carga muestra los camiones compatibles. <Link href="/cargas?inmediata=1">Ver pedidos inmediatos</Link>.</p>
        </div>
        <Link className="btn" href="/cargas/nueva">
          + Publicar carga gratis
        </Link>
      </div>
      <ManualReadonlyBanner user={viewer} />
      <LoadFilters value={filters} counts={originCounts("cargas")} />
      <div className="list-bar">
        <span className="meta">{loads.length === 1 ? "1 resultado" : `${loads.length} resultados`}</span>
        {loads.length > 0 ? alert : null}
      </div>
      {!viewer ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          🔒 El contacto (empresa y WhatsApp) solo se muestra cuando se adjudica una oferta, y solo entre las dos partes.{" "}
          <Link href="/registro">Regístrate</Link> o <Link href="/ingreso">ingresa</Link>.
        </div>
      ) : null}

      {loads.length === 0 ? (
        <EmptyState
          kind="cargas"
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
                      <LoadCard load={redactLoad(hit.item, viewer)} priceHint={showPrice ? costHintFor(hit.item) : null} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          }
        />
      ) : (
        <div className="grid c2">
          {loads.map((load) => (
            <LoadCard key={load.id} load={load} priceHint={showPrice ? costHintFor(load) : null} />
          ))}
        </div>
      )}
    </div>
  );
}
