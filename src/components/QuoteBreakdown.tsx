import { Fragment } from "react";
import type { QuoteResult } from "@/lib/costos/engine";
import { formatClp } from "@/lib/format";

const money = (v: number | null) => (v === null ? "PENDIENTE" : `$${formatClp(Math.round(v))}`);
const GROUP: Record<string, string> = { obligatorio: "Costos obligatorios", operacional: "Costos operacionales estimados", margen: "Margen interno", impuesto: "Impuestos" };

/** Desglose completo de una cotización (vista de administración). */
export function QuoteBreakdown({ q }: { q: QuoteResult }) {
  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <h3>Ruta y vehículo</h3>
        <p>
          {q.origin.label} → {q.destination.label} · <strong>{q.vehicle.label}</strong> ({q.vehicle.axles} ejes{q.vehicle.trailer ? ", con remolque" : ""})
        </p>
        <ul className="meta">
          {q.vehicle.tollClassification.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {q.route ? (
          <p className="meta">
            {formatClp(q.route.km)} km · {q.route.provider} ({q.route.profile}) · duración ruteo {q.route.durationProviderH} h, camión {q.route.durationTruckH} h ·{" "}
            {q.route.cached ? "desde caché" : "consulta nueva"} del {q.route.fetchedAt.slice(0, 16).replace("T", " ")} UTC
            {q.route.viaLabel ? ` · ${q.route.viaLabel}` : ""} · {q.route.attribution}
          </p>
        ) : (
          <p className="error">Sin ruta: cálculo de respaldo.</p>
        )}
        {q.route?.roads.length ? <p className="meta">Vías: {q.route.roads.map((r) => `${r.name} ${r.km} km`).join(" · ")}</p> : null}
        {q.driving ? (
          <p className="meta">
            Manejo {q.driving.drivingH} h · {q.driving.shortRests} descansos cortos ({q.driving.shortRestH} h) · {q.driving.dailyRests} descanso(s) de 8 h · trabajo {q.driving.workH} h ·
            total {q.driving.totalElapsedH} h · {q.driving.serviceDays} día(s). Regla: {q.driving.rule} (<a href={q.driving.sourceUrl}>BCN</a>, <a href={q.driving.sourceUrl2}>DT</a>).
          </p>
        ) : null}
      </div>
      <div className="card">
        <h3>Peajes detectados ({q.tolls.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Plaza</th>
              <th>Concesión</th>
              <th>Categoría</th>
              <th>Tarifa publicada</th>
              <th>Neto</th>
              <th>Estado</th>
              <th>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {q.tolls.map((t) => (
              <tr key={t.plazaId}>
                <td title={t.note}>{t.name}</td>
                <td>{t.concession}</td>
                <td>{t.categoryLabel} ({t.rateType})</td>
                <td>{money(t.amountGross)}</td>
                <td>{money(t.amountNet)}</td>
                <td>{t.status}</td>
                <td>{t.sourceUrl ? <a href={t.sourceUrl}>MOP {t.checkedAt}</a> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Desglose</h3>
        {q.diesel ? (
          <p className="meta">
            Diésel {q.diesel.zone}: público {money(q.diesel.priceGross)}/L, neto {money(q.diesel.priceNet)}/L · {q.diesel.source} · {q.diesel.fetchedAt ?? "sin fecha"} ·{" "}
            {q.diesel.kmPerL} km/L → {q.diesel.liters} L (estimación). {q.diesel.warning ?? ""}
          </p>
        ) : null}
        <table className="table">
          <tbody>
            {["obligatorio", "operacional", "margen", "impuesto"].map((group) => (
              <Fragment key={group}>
                <tr>
                  <th colSpan={4}>{GROUP[group]}</th>
                </tr>
                {q.components
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td>{money(c.amount)}</td>
                      <td>{c.status}</td>
                      <td className="meta">
                        {c.detail} · {c.source}
                        {c.date ? ` · ${c.date.slice(0, 10)}` : ""}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
            <tr>
              <th>Costo base</th>
              <th>{money(q.totals.costoBase)}</th>
              <td colSpan={2} className="meta">
                Obligatorios {money(q.totals.obligatorios)} + operacionales {money(q.totals.operacionales)}
              </td>
            </tr>
            <tr>
              <th>Precio referencial (neto + IVA)</th>
              <th>{money(q.totals.precioTotal)}</th>
              <td colSpan={2} className="meta">
                {q.totals.complete ? "Completo" : `Incompleto: ${q.totals.pending.join(", ")}`} · {q.notice}
              </td>
            </tr>
          </tbody>
        </table>
        {q.warnings.length ? (
          <ul className="meta">
            {q.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {q.fallback ? <p className="notice">Respaldo: ${formatClp(q.fallback.min)} – ${formatClp(q.fallback.max)} · {q.fallback.note}</p> : null}
        <p className="meta">
          Motor {q.engineVersion} · calculado {q.computedAt} · parámetros {q.paramsVersion}
        </p>
      </div>
    </div>
  );
}
