"use client";

import { useEffect, useState } from "react";
import { REFERENCE_NOTICE } from "@/lib/costos/notice";
import { formatClp } from "@/lib/format";
import { EquipmentSelector } from "./EquipmentSelector";
import { PlacePicker } from "./PlacePicker";

type PublicCost = {
  method: "motor" | "respaldo_linea_recta";
  notice: string;
  km: number | null;
  durationTruckH: number | null;
  serviceDays: number | null;
  vehicle: string;
  complete: boolean;
  pending: string[];
  showAmount: boolean;
  components: { key: string; label: string; group: string; status: string; source: string; date: string | null; detail: string; amount: number | null }[];
  tolls: { name: string; concession: string; category: string; amount: number | null; status: string; sourceUrl: string | null }[];
  diesel: { zone: string | null; price: number | null; fetchedAt: string | null; source: string; liters: number; status: string } | null;
  costoBase: number | null;
  iva: number | null;
  costoTotal: number | null;
  rango?: { pct: number; min: number; max: number } | null;
  fallback: { min: number | null; max: number | null; km: number; note: string } | null;
  warnings: string[];
  attribution: string | null;
};

const VEHICLES = [
  { id: "", label: "Según el equipo" },
  { id: "camion_2_ejes", label: "Camión simple 2 ejes" },
  { id: "camion_3_ejes", label: "Camión simple 3 ejes" },
  { id: "tracto_semirremolque_5_ejes", label: "Tracto + semirremolque (5 ejes)" },
  { id: "tracto_semirremolque_6_ejes", label: "Tracto + semirremolque (6 ejes)" },
];

const STATUS: Record<string, string> = { verificado: "verificado", estimado: "estimado", pendiente: "PENDIENTE", vencido: "VENCIDO" };

function num(value: string): number {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | null) {
  return value === null ? "—" : `$${formatClp(Math.round(value))}`;
}

/**
 * Cotizador: el costo real del flete lo calcula el motor de costos en el servidor (ruta real, peajes oficiales,
 * diésel CNE, conductor según art. 25 bis, desgaste). Mismo cálculo que la publicación de cargas, el panel y la API.
 */
export function Calculator() {
  const [origin, setOrigin] = useState("Santiago");
  const [destination, setDestination] = useState("Concepción");
  const [equipment, setEquipment] = useState("rampla_plana");
  const [vehicle, setVehicle] = useState("");
  const [weight, setWeight] = useState("");
  const [offer, setOffer] = useState("");
  const [contact, setContact] = useState("");
  const [cost, setCost] = useState<PublicCost | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSent("");
    if (origin === destination) {
      setCost(null);
      return;
    }
    const params = new URLSearchParams({ origen: origin, destino: destination, equipo: equipment, peso: String(num(weight) || 0) });
    if (vehicle) params.set("vehiculo", vehicle);
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/estimacion?${params}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setCost(data?.costo ?? null))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [origin, destination, equipment, vehicle, weight]);

  async function requestReview() {
    setError("");
    setSent("");
    const response = await fetch("/api/cotizaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origen: origin, destino: destination, equipo: equipment, vehiculo: vehicle || undefined, pesoT: num(weight) || undefined, contacto: contact }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "No se pudo enviar la solicitud.");
    setSent("Solicitud registrada. Un ejecutivo de Carga360go la revisa antes de confirmar cualquier valor.");
  }

  const offerValue = num(offer);
  const obligatorios = cost?.components.filter((c) => c.group === "obligatorio") ?? [];
  const operacionales = cost?.components.filter((c) => c.group === "operacional" && (c.amount !== 0 || !cost.showAmount)) ?? [];

  return (
    <div className="calc">
      <form className="card" onSubmit={(event) => event.preventDefault()}>
        <h3>1. Ruta, equipo y carga</h3>
        <div className="form-grid">
          <PlacePicker label="origen" value={origin} onChange={setOrigin} />
          <PlacePicker label="destino" value={destination} onChange={setDestination} />
          <label className="f">
            Vehículo (define la categoría de peaje)
            <select value={vehicle} onChange={(event) => setVehicle(event.target.value)}>
              {VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Peso de la carga (t, opcional)
            <input inputMode="decimal" placeholder="Sin peso: se calcula a plena carga" value={weight} onChange={(event) => setWeight(event.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="meta" style={{ fontWeight: 700, marginBottom: 6 }}>Tipo de equipo</div>
          <EquipmentSelector mode="single" layout="carousel" name="equipment" value={equipment} onChange={setEquipment} />
        </div>
        <h3 style={{ marginTop: 16 }}>2. Solicitar revisión (opcional)</h3>
        <div className="form-grid">
          <label className="f full">
            Correo o teléfono de contacto
            <input value={contact} maxLength={200} onChange={(event) => setContact(event.target.value)} placeholder="Para que un ejecutivo te responda" />
          </label>
          {cost?.showAmount ? (
            <label className="f full">
              Pago ofrecido por el viaje (CLP, opcional, para comparar)
              <input inputMode="numeric" value={offer} onChange={(event) => setOffer(event.target.value)} />
            </label>
          ) : null}
        </div>
        <button className="btn" type="button" onClick={requestReview} disabled={origin === destination}>
          Solicitar cotización revisada
        </button>
        {sent ? <p className="notice" role="status">{sent}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </form>

      <aside className="card calc-result" aria-live="polite">
        <h3>Costo del flete</h3>
        {origin === destination ? <p className="meta">Elige un origen y un destino distintos.</p> : null}
        {loading && !cost ? <p className="meta">Calculando ruta real, peajes y diésel…</p> : null}
        {cost ? (
          <>
            <div className="meta">
              {cost.km ? `${formatClp(cost.km)} km por ruta real` : "Ruta no disponible"}
              {cost.durationTruckH ? ` · ≈ ${formatClp(Math.round(cost.durationTruckH))} h de manejo` : ""}
              {cost.serviceDays ? ` · ${cost.serviceDays} ${cost.serviceDays === 1 ? "día" : "días"} con descansos legales` : ""}
            </div>
            <div className="meta">{cost.vehicle}</div>
            {cost.method === "respaldo_linea_recta" ? (
              <p className="notice">
                Sin datos del motor para esta ruta: {cost.fallback?.min ? `rango de respaldo ${money(cost.fallback.min)} – ${money(cost.fallback.max)} (cálculo antiguo, línea recta).` : "inténtalo más tarde."}
              </p>
            ) : (
              <>
                {cost.showAmount ? (
                  <div className="price-range">
                    {cost.complete ? money(cost.costoTotal) : "Total pendiente"}
                    <div className="meta">
                      {cost.complete
                        ? `Costo neto ${money(cost.costoBase)} + IVA ${money(cost.iva)}`
                        : `Faltan datos para el total (${cost.pending.join(", ") || "valores pendientes"}). Un ejecutivo lo revisa.`}
                      {cost.rango ? ` · rango ${money(cost.rango.min)} – ${money(cost.rango.max)}` : ""}
                    </div>
                  </div>
                ) : (
                  <p className="notice">Un ejecutivo revisa el costo de este viaje. Pide tu cotización revisada.</p>
                )}
                <div className="cost-box">
                  <div className="meta" style={{ fontWeight: 700 }}>Costos obligatorios</div>
                  {obligatorios.map((c) => (
                    <div key={c.key} className="row" style={{ justifyContent: "space-between" }} title={`${c.detail} Fuente: ${c.source}`}>
                      <span>
                        {c.label} <small className="meta">({STATUS[c.status] ?? c.status})</small>
                      </span>
                      <strong>{cost.showAmount ? money(c.amount) : ""}</strong>
                    </div>
                  ))}
                  <div className="meta" style={{ fontWeight: 700, marginTop: 6 }}>Costos operacionales estimados</div>
                  {operacionales.map((c) => (
                    <div key={c.key} className="row" style={{ justifyContent: "space-between" }} title={`${c.detail} Fuente: ${c.source}`}>
                      <span>{c.label}</span>
                      <strong>{cost.showAmount ? money(c.amount) : ""}</strong>
                    </div>
                  ))}
                  {cost.showAmount && offerValue > 0 && cost.costoBase ? (
                    <div className={`row margin ${offerValue - cost.costoBase >= 0 ? "pos" : "neg"}`} style={{ justifyContent: "space-between" }}>
                      <span>Diferencia con el pago ofrecido (neto)</span>
                      <strong>{money(offerValue - cost.costoBase)}</strong>
                    </div>
                  ) : null}
                </div>
                {cost.tolls.length ? (
                  <details style={{ marginTop: 8 }}>
                    <summary>Peajes en la ruta ({cost.tolls.length})</summary>
                    <ul className="meta">
                      {cost.tolls.map((t) => (
                        <li key={t.name}>
                          {t.name} · {t.concession} · {t.category}: {cost.showAmount ? money(t.amount) : ""} ({STATUS[t.status] ?? t.status})
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {cost.diesel ? (
                  <p className="meta">
                    Diésel: {cost.diesel.zone ?? "—"}
                    {cost.showAmount && cost.diesel.price ? `, $${formatClp(Math.round(cost.diesel.price))}/L` : ""} · {cost.diesel.source}
                    {cost.diesel.fetchedAt ? ` (${cost.diesel.fetchedAt.slice(0, 10)})` : ""} · {formatClp(Math.round(cost.diesel.liters))} L estimados
                  </p>
                ) : null}
              </>
            )}
            {cost.warnings.length ? (
              <ul className="meta">
                {cost.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            {cost.attribution ? <p className="meta">{cost.attribution}</p> : null}
          </>
        ) : null}
        <p className="meta">{REFERENCE_NOTICE}</p>
      </aside>
    </div>
  );
}
