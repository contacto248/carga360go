"use client";

import { useEffect, useState } from "react";
import { formatClp } from "@/lib/format";
import { DEFAULT_VIATICO_CLP, JORNADA_CAMION_KM, ROUTE_COST_NOTICE, computeRouteCost, routeCostLines } from "@/lib/costos/ruta-costo";
import { EquipmentSelector } from "./EquipmentSelector";
import { PlacePicker } from "./PlacePicker";

type RutaToll = {
  name: string;
  route: string;
  concession: string;
  category: string;
  amount: number;
  sourceUrl: string | null;
  validTo: string | null;
  checkedAt: string | null;
};

type RutaCosto = {
  notice: string;
  km: number | null;
  kmPerL: number;
  days: number;
  viaticoDia: number;
  dieselPrice: number | null;
  dieselDate: string | null;
  dieselSource: string;
  dieselZone: string | null;
  tollsClp: number;
  tollsPartial: boolean;
  tollsNote: string | null;
  provider: string | null;
  attribution: string | null;
  tolls: RutaToll[];
};

const VEHICLES = [
  { id: "", label: "Según el equipo" },
  { id: "camion_2_ejes", label: "Camión simple 2 ejes" },
  { id: "camion_3_ejes", label: "Camión simple 3 ejes" },
  { id: "tracto_semirremolque_5_ejes", label: "Tracto + semirremolque (5 ejes)" },
  { id: "tracto_semirremolque_6_ejes", label: "Tracto + semirremolque (6 ejes)" },
];

function clp(value: string): number {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimal(value: string): number {
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function plain(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 1000) / 1000);
}

function money(value: number | null) {
  return value === null ? "—" : `$${formatClp(Math.round(value))}`;
}

/**
 * Calculadora de ruta: kilómetros, peajes que cruza, diésel y viático. El desglose es un costo de referencia.
 */
export function Calculator() {
  const [origin, setOrigin] = useState("Santiago");
  const [destination, setDestination] = useState("Concepción");
  const [equipment, setEquipment] = useState("rampla_plana");
  const [vehicle, setVehicle] = useState("");
  const [weight, setWeight] = useState("");
  const [contact, setContact] = useState("");
  const [ruta, setRuta] = useState<RutaCosto | null>(null);
  const [kmField, setKmField] = useState("");
  const [tollField, setTollField] = useState("");
  const [dieselField, setDieselField] = useState("");
  const [yieldField, setYieldField] = useState("2.6");
  const [viaticoField, setViaticoField] = useState(String(DEFAULT_VIATICO_CLP));
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSent("");
    if (origin === destination) {
      setRuta(null);
      return;
    }
    const params = new URLSearchParams({ origen: origin, destino: destination, equipo: equipment, peso: String(clp(weight) || 0) });
    if (vehicle) params.set("vehiculo", vehicle);
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/estimacion?${params}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          const next = (data?.rutaCosto ?? null) as RutaCosto | null;
          setRuta(next);
          if (next) {
            setKmField(plain(next.km));
            setTollField(String(Math.round(next.tollsClp)));
            setDieselField(next.dieselPrice == null ? "" : plain(next.dieselPrice));
            setYieldField(plain(next.kmPerL));
            setViaticoField(String(next.viaticoDia || DEFAULT_VIATICO_CLP));
          }
        })
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
      body: JSON.stringify({ origen: origin, destino: destination, equipo: equipment, vehiculo: vehicle || undefined, pesoT: clp(weight) || undefined, contacto: contact }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "No se pudo enviar la solicitud.");
    setSent("Solicitud registrada. Un ejecutivo de Carga360go la revisa antes de confirmar cualquier valor.");
  }

  const dieselTyped = dieselField.trim() === "" ? null : decimal(dieselField);
  const routeCost = computeRouteCost({
    km: decimal(kmField),
    kmPerL: decimal(yieldField),
    dieselPrice: dieselTyped,
    tollsClp: clp(tollField),
    viaticoDia: clp(viaticoField),
  });
  const lines = routeCostLines(routeCost);
  const dieselIsStored = ruta?.dieselPrice != null && dieselTyped != null && Math.abs(dieselTyped - ruta.dieselPrice) < 0.02;
  const sameToll = ruta != null && Math.round(clp(tollField)) === Math.round(ruta.tollsClp);

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
        <h3 style={{ marginTop: 16 }}>2. Ajustar a mano</h3>
        <p className="meta">Los valores salen de la ruta. Puedes cambiar kilómetros, peajes, precio del diésel, rendimiento y viático.</p>
        <div className="form-grid">
          <label className="f">
            Kilómetros
            <input inputMode="decimal" value={kmField} onChange={(event) => setKmField(event.target.value)} />
          </label>
          <label className="f">
            Peajes (CLP)
            <input inputMode="numeric" value={tollField} onChange={(event) => setTollField(event.target.value)} />
          </label>
          <label className="f">
            Precio del diésel (CLP/L)
            <input inputMode="decimal" value={dieselField} onChange={(event) => setDieselField(event.target.value)} />
          </label>
          <label className="f">
            Rendimiento (km/L)
            <input inputMode="decimal" value={yieldField} onChange={(event) => setYieldField(event.target.value)} />
          </label>
          <label className="f">
            Viático diario (CLP)
            <input inputMode="numeric" value={viaticoField} onChange={(event) => setViaticoField(event.target.value)} />
          </label>
        </div>
        <h3 style={{ marginTop: 16 }}>3. Solicitar revisión (opcional)</h3>
        <div className="form-grid">
          <label className="f full">
            Correo o teléfono de contacto
            <input value={contact} maxLength={200} onChange={(event) => setContact(event.target.value)} placeholder="Para que un ejecutivo te responda" />
          </label>
        </div>
        <button className="btn" type="button" onClick={requestReview} disabled={origin === destination}>
          Solicitar cotización revisada
        </button>
        {sent ? <p className="notice" role="status">{sent}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </form>

      <aside className="card calc-result" aria-live="polite">
        <h3>Costo de referencia desglosado</h3>
        {origin === destination ? <p className="meta">Elige un origen y un destino distintos.</p> : null}
        {loading && !ruta ? <p className="meta">Calculando kilómetros, ruta, peajes y diésel…</p> : null}
        <div className="meta">
          {routeCost.km > 0 ? `${formatClp(Math.round(routeCost.km))} km` : "Sin kilómetros todavía"}
          {ruta?.provider ? ` · ${ruta.provider === "google_maps" ? "Google Maps" : "OSRM"}` : ""}
          {` · ${routeCost.days} ${routeCost.days === 1 ? "día" : "días"} de viaje`}
        </div>
        <p className="meta">Jornada razonable de camión: {formatClp(JORNADA_CAMION_KM)} km por día. Los días son el redondeo hacia arriba de los kilómetros divididos por esa jornada (mínimo 1).</p>
        <div className="cost-box">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Diésel</span>
            <strong>{lines.diesel === "Pendiente" ? "Pendiente" : money(routeCost.dieselClp)}</strong>
          </div>
          <p className="meta">
            {routeCost.liters ? `${formatClp(Math.round(routeCost.liters))} L × ` : ""}
            {dieselTyped ? `$${formatClp(Math.round(dieselTyped))}/L` : "sin precio"}
            {dieselIsStored && ruta?.dieselDate ? ` · último valor guardado del ${ruta.dieselDate}` : ""}
            {ruta?.dieselSource ? ` · ${ruta.dieselSource}` : ""}
            {ruta?.dieselZone ? ` · ${ruta.dieselZone}` : ""}
          </p>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Peajes</span>
            <strong>{money(routeCost.tollsClp)}</strong>
          </div>
          {ruta?.tollsNote ? <p className="meta">{sameToll ? ruta.tollsNote : "Monto de peajes ajustado a mano."}</p> : null}
          {sameToll && ruta?.tolls.length ? (
            <ul className="meta">
              {ruta.tolls.map((toll) => (
                <li key={`${toll.name}-${toll.category}`}>
                  {toll.name} · {toll.route} · {toll.category}: {money(toll.amount)}
                  {toll.validTo ? ` · vigencia hasta ${toll.validTo}` : ""}
                  {toll.checkedAt ? ` · consultado ${toll.checkedAt}` : ""}
                  {toll.sourceUrl ? ` · ${toll.sourceUrl}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Viático</span>
            <strong>{money(routeCost.viaticoClp)}</strong>
          </div>
          <p className="meta">
            {routeCost.days} {routeCost.days === 1 ? "día" : "días"} × ${formatClp(routeCost.viaticoDia)} por día
          </p>
          <div className="row total" style={{ justifyContent: "space-between" }}>
            <span>Total</span>
            <strong>{lines.total === "Total pendiente" ? "Total pendiente" : money(routeCost.total)}</strong>
          </div>
        </div>
        {ruta?.attribution ? <p className="meta">{ruta.attribution}</p> : null}
        <p className="meta">{ROUTE_COST_NOTICE}</p>
      </aside>
    </div>
  );
}
