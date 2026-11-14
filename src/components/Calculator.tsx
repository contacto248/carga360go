"use client";

import { useMemo, useState } from "react";
import { formatClp } from "@/lib/format";
import { roadKm } from "@/lib/geo";
import { PRICE_DISCLAIMER, estimateByKm } from "@/lib/pricing";
import { EquipmentSelector } from "./EquipmentSelector";
import { PlacePicker } from "./PlacePicker";

/** Rendimiento típico de referencia (km por litro) por tamaño de equipo. Editable por el usuario. */
const KM_PER_L: Record<string, number> = { camion_34: 6, portaautos: 3, cama_baja: 2.2 };

function num(value: string): number {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function Calculator() {
  const [origin, setOrigin] = useState("Santiago");
  const [destination, setDestination] = useState("Concepción");
  const [equipment, setEquipment] = useState("rampla_plana");
  const [kmOverride, setKmOverride] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [kmPerL, setKmPerL] = useState("2,8");
  const [diesel, setDiesel] = useState("");
  const [wear, setWear] = useState("");
  const [tolls, setTolls] = useState("");
  const [offer, setOffer] = useState("");

  const autoKm = origin === destination ? 0 : roadKm(origin, destination) ?? 0;
  const km = kmOverride ? num(kmOverride) : autoKm;
  const estimate = useMemo(() => estimateByKm(km, equipment), [km, equipment]);
  const driven = roundTrip ? km * 2 : km;
  const liters = num(kmPerL) > 0 ? driven / num(kmPerL) : 0;
  const fuel = liters * num(diesel);
  const wearCost = driven * num(wear);
  const total = fuel + wearCost + num(tolls);
  const offerValue = num(offer);
  const hasCosts = num(diesel) > 0 || num(wear) > 0 || num(tolls) > 0;

  return (
    <div className="calc">
      <form className="card" onSubmit={(event) => event.preventDefault()}>
        <h3>1. Ruta y equipo</h3>
        <div className="form-grid">
          <PlacePicker label="origen" value={origin} onChange={setOrigin} />
          <PlacePicker label="destino" value={destination} onChange={setDestination} />
          <label className="f">
            Distancia (km, un tramo)
            <input inputMode="numeric" placeholder={autoKm ? `${autoKm} (estimado)` : "km"} value={kmOverride} onChange={(event) => setKmOverride(event.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="meta" style={{ fontWeight: 700, marginBottom: 6 }}>Tipo de equipo</div>
          <EquipmentSelector
            mode="single"
            layout="carousel"
            name="equipment"
            value={equipment}
            onChange={(id) => {
              setEquipment(id);
              setKmPerL(String(KM_PER_L[id] ?? 2.8).replace(".", ","));
            }}
          />
        </div>
        <p className="meta">
          Distancia estimada {origin} → {destination}: <strong>{autoKm ? `${formatClp(autoKm)} km` : "—"}</strong>. Si conoces la distancia exacta, escríbela arriba.
        </p>

        <h3 style={{ marginTop: 16 }}>2. Tus costos (opcional)</h3>
        <div className="form-grid">
          <label className="f chk full">
            <input type="checkbox" checked={roundTrip} onChange={(event) => setRoundTrip(event.target.checked)} />
            Calcular ida y vuelta (si vuelves vacío)
          </label>
          <label className="f">
            Rendimiento (km por litro)
            <input inputMode="decimal" value={kmPerL} onChange={(event) => setKmPerL(event.target.value)} />
          </label>
          <label className="f">
            Precio del diésel (CLP por litro)
            <input inputMode="numeric" placeholder="Ingresa el valor de hoy" value={diesel} onChange={(event) => setDiesel(event.target.value)} />
          </label>
          <label className="f">
            Neumáticos y mantención (CLP por km)
            <input inputMode="numeric" placeholder="Ej: según tu flota" value={wear} onChange={(event) => setWear(event.target.value)} />
          </label>
          <label className="f">
            Peajes del viaje (CLP)
            <input inputMode="numeric" value={tolls} onChange={(event) => setTolls(event.target.value)} />
          </label>
          <label className="f full">
            Pago ofrecido por el viaje (CLP, opcional)
            <input inputMode="numeric" value={offer} onChange={(event) => setOffer(event.target.value)} />
          </label>
        </div>
      </form>

      <aside className="card calc-result" aria-live="polite">
        <h3>Resultado</h3>
        {estimate ? (
          <>
            <div className="meta">Precio sugerido referencial ({formatClp(km)} km)</div>
            <div className="price-range">
              ${formatClp(estimate.min)} – ${formatClp(estimate.max)}
            </div>
            <div className="meta">
              Tarifa usada: ${formatClp(estimate.rateMin)} a ${formatClp(estimate.rateMax)} por km. {PRICE_DISCLAIMER}
            </div>
          </>
        ) : (
          <p className="meta">Elige un origen y un destino distintos para ver el rango referencial.</p>
        )}
        {hasCosts ? (
          <div className="cost-box">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Combustible ({formatClp(Math.round(liters))} L)</span>
              <strong>${formatClp(Math.round(fuel))}</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Neumáticos y mantención</span>
              <strong>${formatClp(Math.round(wearCost))}</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Peajes</span>
              <strong>${formatClp(Math.round(num(tolls)))}</strong>
            </div>
            <div className="row total" style={{ justifyContent: "space-between" }}>
              <span>Costo directo del viaje</span>
              <strong>${formatClp(Math.round(total))}</strong>
            </div>
            {offerValue > 0 ? (
              <div className={`row margin ${offerValue - total >= 0 ? "pos" : "neg"}`} style={{ justifyContent: "space-between" }}>
                <span>Te queda (antes de sueldo, seguros y costos fijos)</span>
                <strong>${formatClp(Math.round(offerValue - total))}</strong>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="meta">Ingresa tus costos para ver cuánto te cuesta el viaje y cuánto te queda con el pago ofrecido.</p>
        )}
      </aside>
    </div>
  );
}
