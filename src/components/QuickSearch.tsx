"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REGIONS } from "@/lib/catalog";
import { fechaChilenaAIso } from "@/lib/fecha-cl";
import { EquipmentSelector } from "./EquipmentSelector";

export function QuickSearch() {
  const router = useRouter();
  const [kind, setKind] = useState<"cargas" | "camiones">("cargas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fecha, setFecha] = useState("");
  const [fechaError, setFechaError] = useState("");
  const [equipos, setEquipos] = useState<string[]>([]);
  const [showEq, setShowEq] = useState(false);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const texto = fecha.trim();
    const iso = texto ? fechaChilenaAIso(texto) : "";
    if (texto && !iso) {
      setFechaError("Usa la fecha en formato chileno dd-mm-aaaa.");
      return;
    }
    setFechaError("");
    const params = new URLSearchParams();
    if (from) params.set("regionOrigen", from);
    if (to) params.set("regionDestino", to);
    if (iso) params.set(kind === "cargas" ? "desde" : "dia", iso);
    if (equipos.length) params.set("equipo", equipos.join(","));
    const query = params.toString();
    router.push(`/${kind}${query ? `?${query}` : ""}`);
  }
  return (
    <form className="qsearch" lang="es-CL" onSubmit={submit}>
      <div className="qtabs" role="tablist">
        <button type="button" role="tab" aria-selected={kind === "cargas"} className={kind === "cargas" ? "on" : ""} onClick={() => setKind("cargas")}>
          Busco carga
        </button>
        <button type="button" role="tab" aria-selected={kind === "camiones"} className={kind === "camiones" ? "on" : ""} onClick={() => setKind("camiones")}>
          Busco camión
        </button>
      </div>
      <div className="qfields">
        <select aria-label="Región de origen" value={from} onChange={(event) => setFrom(event.target.value)}>
          <option value="">Origen: todo Chile</option>
          {REGIONS.map((region) => (
            <option key={region.id} value={region.id}>
              {region.numeral} · {region.name}
            </option>
          ))}
        </select>
        <select aria-label="Región de destino" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Destino: todo Chile</option>
          {REGIONS.map((region) => (
            <option key={region.id} value={region.id}>
              {region.numeral} · {region.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          lang="es-CL"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd-mm-aaaa"
          aria-label="Fecha (dd-mm-aaaa)"
          aria-describedby={fechaError ? "fecha-busqueda-error" : undefined}
          pattern="\d{2}-\d{2}-\d{4}"
          value={fecha}
          onChange={(event) => {
            setFecha(event.target.value);
            setFechaError("");
          }}
        />
        <button className="btn" type="submit">
          Buscar
        </button>
      </div>
      {fechaError ? (
        <p id="fecha-busqueda-error" className="fecha-error" role="alert">
          {fechaError}
        </p>
      ) : null}
      <button type="button" className="linkish qeq-toggle" aria-expanded={showEq} onClick={() => setShowEq((value) => !value)}>
        {showEq ? "▾" : "▸"} Tipo de camión {equipos.length ? `(${equipos.length})` : "(opcional)"}
      </button>
      {showEq ? <EquipmentSelector mode="multi" layout="carousel" name="equipo" value={equipos} onChange={setEquipos} /> : null}
    </form>
  );
}
