"use client";

import { useEffect, useState } from "react";
import { DEFAULT_RATES, MIN_TRIP_CLP, ROAD_FACTOR } from "./freight-defaults";

export type FreightParams = {
  fuente: "base" | "respaldo";
  factorRuta: number;
  minimoLiviano: number;
  minimoPesado: number;
  tarifas: Record<string, [number, number]>;
};

export const FREIGHT_FALLBACK: FreightParams = {
  fuente: "respaldo",
  factorRuta: ROAD_FACTOR,
  minimoLiviano: MIN_TRIP_CLP.liviano,
  minimoPesado: MIN_TRIP_CLP.pesado,
  tarifas: { ...DEFAULT_RATES },
};

let cache: FreightParams | null = null;
let inflight: Promise<FreightParams> | null = null;

function validPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [min, max] = value;
  if (typeof min !== "number" || typeof max !== "number" || !(min > 0) || !(max >= min)) return null;
  return [min, max];
}

export function parseFreightParams(data: unknown): FreightParams | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const factorRuta = Number(row.factorRuta);
  const minimoLiviano = Number(row.minimoLiviano);
  const minimoPesado = Number(row.minimoPesado);
  if (!(factorRuta > 0) || !(minimoLiviano > 0) || !(minimoPesado > 0)) return null;
  const tarifas: Record<string, [number, number]> = {};
  for (const [key, value] of Object.entries(DEFAULT_RATES)) tarifas[key] = [value[0], value[1]];
  if (row.tarifas && typeof row.tarifas === "object") {
    for (const [key, value] of Object.entries(row.tarifas as Record<string, unknown>)) {
      const pair = validPair(value);
      if (pair) tarifas[key] = pair;
    }
  }
  return {
    fuente: row.fuente === "base" ? "base" : "respaldo",
    factorRuta,
    minimoLiviano,
    minimoPesado,
    tarifas,
  };
}

export function loadFreightParams(): Promise<FreightParams> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/estimacion/parametros")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const parsed = parseFreightParams(data);
        if (!parsed) return FREIGHT_FALLBACK;
        cache = parsed;
        return parsed;
      })
      .catch(() => FREIGHT_FALLBACK)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function resetFreightParamsCache() {
  cache = null;
  inflight = null;
}

export function useFreightParams(): FreightParams {
  const [params, setParams] = useState<FreightParams>(cache ?? FREIGHT_FALLBACK);
  useEffect(() => {
    let cancel = false;
    loadFreightParams().then((value) => {
      if (!cancel) setParams(value);
    });
    return () => {
      cancel = true;
    };
  }, []);
  return params;
}
