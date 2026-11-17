"use client";

import { useEffect, useState } from "react";

type Point = { lat: number; lng: number; recordedAt: string; provider: "simulado" | "conductor" | null };

export function DriverGpsPanel({ loadId, canSimulate }: { loadId: string; canSimulate: boolean }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);

  async function reload() {
    const response = await fetch(`/api/ops/gps/viajes/${loadId}`, { headers: { accept: "application/json" } });
    const data = (await response.json().catch(() => null)) as { points?: Point[]; error?: string } | null;
    if (!response.ok || !data?.points) {
      setError(data?.error || "No se pudo leer la ubicación.");
      return;
    }
    setPoints(data.points);
  }

  useEffect(() => {
    let alive = true;
    fetch(`/api/ops/gps/viajes/${loadId}`, { headers: { accept: "application/json" } })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { points?: Point[]; error?: string } | null;
        if (!alive) return;
        if (!response.ok || !data?.points) {
          setError(data?.error || "No se pudo leer la ubicación.");
          return;
        }
        setPoints(data.points);
      })
      .catch(() => {
        if (alive) setError("No hay conexión.");
      });
    return () => {
      alive = false;
    };
  }, [loadId]);

  async function send(url: string, body: unknown) {
    setPending(true);
    setError("");
    setInfo("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error || "No se pudo guardar la ubicación.");
        return;
      }
      setInfo("Ubicación guardada.");
      await reload();
    } catch {
      setError("No hay conexión.");
    } finally {
      setPending(false);
    }
  }

  function usePhone() {
    setError("");
    if (!navigator.geolocation) {
      setError("Este navegador no entrega la ubicación. Escribe latitud y longitud.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(Math.round(position.coords.latitude * 1e6) / 1e6));
        setLng(String(Math.round(position.coords.longitude * 1e6) / 1e6));
        setInfo("Ubicación del teléfono lista. Confirma para guardarla.");
      },
      () => setError("No se pudo leer la ubicación del teléfono. Puedes escribir latitud y longitud."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <section className="card" id="ubicacion-conductor">
      <h2 style={{ marginTop: 0 }}>Ubicación del conductor</h2>
      <p className="meta">Se guarda latitud, longitud y la hora del servidor en el viaje autorizado. No hay un proveedor GPS externo ni una clave.</p>
      {points.length ? (
        <ol>
          {points.map((point) => (
            <li key={`${point.recordedAt}-${point.lat}-${point.lng}`}>
              {point.lat}, {point.lng}
              <span className="meta">
                {" "}
                · {point.provider === "simulado" ? "simulado" : point.provider === "conductor" ? "conductor" : "viaje"} ·{" "}
                {new Date(point.recordedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="meta">Todavía no hay puntos en este viaje.</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const latN = Number(lat);
          const lngN = Number(lng);
          if (!Number.isFinite(latN) || !Number.isFinite(lngN) || lat.trim() === "" || lng.trim() === "") {
            setError("Escribe latitud y longitud.");
            return;
          }
          void send("/api/ops/gps/conductor", { loadId, lat: latN, lng: lngN });
        }}
      >
        <label className="f">
          Latitud
          <input inputMode="decimal" value={lat} onChange={(event) => setLat(event.target.value)} />
        </label>
        <label className="f">
          Longitud
          <input inputMode="decimal" value={lng} onChange={(event) => setLng(event.target.value)} />
        </label>
        <div className="row">
          <button className="btn sec sm" type="button" disabled={pending} onClick={usePhone}>
            Usar la ubicación de este teléfono
          </button>
          <button className="btn sm" type="submit" disabled={pending}>
            Guardar ubicación
          </button>
          {canSimulate ? (
            <button className="btn sec sm" type="button" disabled={pending} onClick={() => void send("/api/ops/gps/simulado", { loadId })}>
              Generar recorrido simulado
            </button>
          ) : null}
        </div>
      </form>
      {info ? <p className="meta">{info}</p> : null}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
