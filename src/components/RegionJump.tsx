"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REGIONS } from "@/lib/catalog";

/** Selector desplegable de región (norte → sur) que lleva a cargas o camiones filtrados. */
export function RegionJump({ counts = {} }: { counts?: Record<string, number> }) {
  const router = useRouter();
  const [region, setRegion] = useState("");
  const go = (path: "cargas" | "camiones") => router.push(region ? `/${path}?regionOrigen=${region}` : `/${path}`);
  return (
    <div className="region-jump">
      <label className="f">
        Región de origen
        <select value={region} onChange={(event) => setRegion(event.target.value)}>
          <option value="">Todas las regiones (Arica a Punta Arenas)</option>
          {REGIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.numeral} · {item.name}
              {counts[item.id] ? ` (${counts[item.id]})` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <button className="btn" type="button" onClick={() => go("cargas")}>
          Ver cargas
        </button>
        <button className="btn sec" type="button" onClick={() => go("camiones")}>
          Ver camiones
        </button>
      </div>
    </div>
  );
}
