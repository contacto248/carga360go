import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { AdminDenied } from "@/components/AdminDenied";
import { CostParamsForm, RefreshSourcesButton } from "@/components/AdminCostos";
import { getCurrentUser } from "@/lib/current-user";
import { DIESEL_ADAPTERS, dieselHistory } from "@/lib/costos/diesel";
import { GLOBAL_PARAMS, getParams, paramValue, VEHICLE_FIELDS } from "@/lib/costos/params";
import { QUOTE_STATUSES, listQuotes, type QuoteStatus } from "@/lib/costos/quotes";
import { lastRuns } from "@/lib/costos/refresh";
import { ROUTE_PROVIDERS } from "@/lib/costos/routing";
import { listPlazas, listRates, listSources } from "@/lib/costos/tolls";
import { VEHICLE_CLASSES, TOLL_CATEGORY_LABELS } from "@/lib/costos/vehicles";
import { formatClp } from "@/lib/format";

export const metadata: Metadata = { title: "Motor de costos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminCostosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <AdminDenied next="/admin/costos" />;
  const sp = await searchParams;
  const estado = typeof sp.estado === "string" && QUOTE_STATUSES.includes(sp.estado as QuoteStatus) ? (sp.estado as QuoteStatus) : undefined;
  const quotes = listQuotes(estado, 100);
  const params = getParams();
  const fields = [
    ...GLOBAL_PARAMS.map((p) => ({ key: p.key, label: p.label, unit: p.unit, kind: p.kind, options: p.options, value: paramValue(p.key), help: p.help })),
    ...Object.values(VEHICLE_CLASSES).flatMap((v) =>
      VEHICLE_FIELDS.map((f) => ({ key: `vehiculo.${v.id}.${f.field}`, label: `${v.label}: ${f.label}`, unit: f.unit, kind: "number" as const, value: params.vehicles[v.id][f.field], help: "Parámetro configurable (no es dato oficial)." })),
    ),
  ];
  const plazas = listPlazas();
  const rates = listRates();
  const sources = listSources();
  const diesel = dieselHistory(60);
  const runs = lastRuns(10);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Motor de costos logísticos</h1>
        <p>Cotizaciones en revisión, parámetros, peajes, diésel y estado de las fuentes. Ningún costo se envía a un cliente sin revisión.</p>
      </div>
      <AdminNav current="/admin/costos" />

      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Cotizaciones</h2>
        <p className="meta">
          Filtrar:{" "}
          <Link href="/admin/costos">todas</Link>
          {QUOTE_STATUSES.map((s) => (
            <span key={s}>
              {" · "}
              <Link href={`/admin/costos?estado=${s}`}>{s}</Link>
            </span>
          ))}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha (UTC)</th>
              <th>Ruta</th>
              <th>Vehículo</th>
              <th>Km</th>
              <th>Costo base</th>
              <th>Referencial</th>
              <th>Estado</th>
              <th>Canal</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td>{q.created_at.slice(0, 16).replace("T", " ")}</td>
                <td>
                  <Link href={`/admin/costos/${q.id}`}>
                    {q.origin_label} → {q.destination_label}
                  </Link>
                </td>
                <td>{VEHICLE_CLASSES[q.vehicle as keyof typeof VEHICLE_CLASSES]?.label ?? q.vehicle}</td>
                <td>{q.distance_km ? formatClp(Math.round(q.distance_km)) : "—"}</td>
                <td>${formatClp(q.base_cost)}</td>
                <td>
                  ${formatClp(q.reference_price)}
                  {q.complete ? "" : " (incompleto)"}
                  {q.method !== "motor" ? " (respaldo)" : ""}
                </td>
                <td>{q.status}</td>
                <td>{q.channel}</td>
              </tr>
            ))}
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={8} className="meta">
                  Sin cotizaciones.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Parámetros</h2>
        <p className="meta">
          Valores por defecto: parámetros profesionales de referencia, configurables, no datos oficiales. El margen es interno y no aparece en vistas públicas. Cada cambio queda en{" "}
          <Link href="/admin/auditoria">Auditoría</Link> con valor anterior y nuevo. Versión vigente: {params.version}.
        </p>
        <CostParamsForm fields={fields} />
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Fuentes</h2>
        <p>
          <RefreshSourcesButton />
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Última consulta OK</th>
              <th>Último error</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={s.url}>{s.name}</a>
                </td>
                <td>{s.kind}</td>
                <td>{s.status}</td>
                <td>{s.last_ok_at ?? "—"}</td>
                <td className="meta">{s.last_error ? `${s.last_error} (${s.last_error_at})` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Adaptadores</h3>
        <ul className="meta">
          {ROUTE_PROVIDERS.map((p) => (
            <li key={p.id}>
              Ruteo · {p.label}: <strong>{p.connected() ? "conectado" : "NO CONECTADO"}</strong> · {p.requirement}
            </li>
          ))}
          {DIESEL_ADAPTERS.map((a) => (
            <li key={a.id}>
              Diésel · {a.label}: <strong>{a.connected() ? "conectado" : "NO CONECTADO"}</strong> · {a.requirement}
            </li>
          ))}
        </ul>
        <h3>Corridas del job</h3>
        <ul className="meta">
          {runs.map((r) => (
            <li key={r.id}>
              {r.started_at} · {r.ok ? "OK" : "con errores"} · {r.detail.slice(0, 300)}
            </li>
          ))}
          {runs.length === 0 ? <li>Sin corridas registradas.</li> : null}
        </ul>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Histórico del diésel</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Consulta (UTC)</th>
              <th>Zona</th>
              <th>Promedio $/L</th>
              <th>Mín–máx</th>
              <th>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {diesel.map((d, i) => (
              <tr key={`${d.fetched_at}-${d.zone}-${i}`}>
                <td>{d.fetched_at.slice(0, 16).replace("T", " ")}</td>
                <td>{d.zone}</td>
                <td>{d.price}</td>
                <td>
                  {d.price_min ?? "—"} – {d.price_max ?? "—"}
                </td>
                <td>{d.source_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Plazas de peaje y tarifas</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Plaza</th>
              <th>Concesión / ruta</th>
              <th>Sentido</th>
              <th>Ubicación</th>
              <th>Tarifas vigentes</th>
            </tr>
          </thead>
          <tbody>
            {plazas.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  {p.km ? ` (km ${p.km})` : ""}
                </td>
                <td>
                  {p.concession} · {p.route}
                </td>
                <td>{p.direction}</td>
                <td className="meta">
                  {p.lat.toFixed(5)}, {p.lon.toFixed(5)} · {p.location_note}
                </td>
                <td className="meta">
                  {rates.filter((r) => r.plaza_id === p.id).length === 0
                    ? "PENDIENTE"
                    : rates
                        .filter((r) => r.plaza_id === p.id)
                        .map((r) => `${TOLL_CATEGORY_LABELS[r.category] ?? r.category} ${r.rate_type}: $${formatClp(r.amount)} (${r.valid_from} a ${r.valid_to})`)
                        .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
