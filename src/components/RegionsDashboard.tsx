"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MAP_H, MAP_PANELS, MAP_W, REGION_SHAPES } from "@/lib/chile-map-data";
import type { RegionIndicators } from "@/lib/stats";

const NAVY = "#0B1633";
const CYAN = "#22B8CF";
const SCALE = ["#E6EBF3", "#FDE6D6", "#FBC29C", "#F69A5E", "#F26B1D"];

/** Escala de 5 tramos: 0 = sin avisos; el resto se reparte según el máximo real. */
function level(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
}

function shortName(name: string): string {
  return name
    .replace("Libertador General Bernardo O'Higgins", "O'Higgins")
    .replace("Aysén del General Carlos Ibáñez del Campo", "Aysén")
    .replace("Magallanes y de la Antártica Chilena", "Magallanes")
    .replace("Metropolitana de Santiago", "Metropolitana");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const PANEL_LABEL: Record<string, string> = {
  norte: "Norte",
  centro: "Centro",
  sur: "Sur y Austral",
};

export function RegionsDashboard({
  regions,
  compact = false,
}: {
  regions: RegionIndicators[];
  compact?: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [hover, setHover] = useState<{
    id: string;
    x: number;
    y: number;
    flip: boolean;
  } | null>(null);
  const max = Math.max(0, ...regions.map((region) => region.activity));
  const byId = useMemo(
    () => Object.fromEntries(regions.map((region) => [region.id, region])),
    [regions],
  );
  const totals = regions.reduce(
    (acc, region) => ({
      loadsFrom: acc.loadsFrom + region.loadsFrom,
      loadsTo: acc.loadsTo + region.loadsTo,
      trucks: acc.trucks + region.trucks,
      verifiedCarriers: acc.verifiedCarriers + region.verifiedCarriers,
    }),
    { loadsFrom: 0, loadsTo: 0, trucks: 0, verifiedCarriers: 0 },
  );
  const empty = totals.loadsFrom + totals.loadsTo + totals.trucks === 0;
  const current = selected ? byId[selected] : undefined;
  const tip = hover ? byId[hover.id] : undefined;
  const toggle = (id: string) => setSelected((prev) => (prev === id ? "" : id));

  return (
    <div className={`rdash${compact ? " compact" : ""}`}>
      <div className="rdash-map card">
        <div className="rdash-maphead">
          <strong>Actividad por región</strong>
          <span className="meta">Cargas que salen + camiones disponibles</span>
        </div>
        {empty ? (
          <div className="rdash-empty">
            <span>
              <b>Aún no hay avisos activos</b>
              El mapa se colorea con cada carga o camión que se publique.
            </span>
            <div className="row">
              <Link className="btn sm" href="/cargas/nueva">
                Publicar carga gratis
              </Link>
              <Link className="btn sm sec" href="/camiones/nuevo">
                Publicar camión
              </Link>
            </div>
          </div>
        ) : null}
        <div className="rdash-svgwrap" onMouseLeave={() => setHover(null)}>
          <svg
            viewBox={`-4 -4 ${MAP_W + 8} ${MAP_H + 8}`}
            role="group"
            aria-label="Mapa de Chile por regiones, coloreado según avisos activos"
          >
            {MAP_PANELS.map((panel) => (
              <text
                key={panel.id}
                className="rdash-panel"
                x={
                  panel.id === "sur"
                    ? panel.x + panel.w - 4
                    : panel.x + panel.w / 2
                }
                y={panel.id === "sur" ? 16 : MAP_H - 4}
                textAnchor={panel.id === "sur" ? "end" : "middle"}
              >
                {PANEL_LABEL[panel.id]}
              </text>
            ))}
            {regions.map((region) => {
              const shape = REGION_SHAPES[region.id];
              if (!shape) return null;
              const on = selected === region.id;
              return (
                <path
                  key={region.id}
                  d={shape.d}
                  fill={SCALE[level(region.activity, max)]}
                  stroke={on ? CYAN : "#ffffff"}
                  strokeWidth={on ? 2.4 : 0.8}
                  strokeLinejoin="round"
                  className={`rdash-reg${on ? " on" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={on}
                  aria-label={`${region.numeral} ${region.name}: ${region.loadsFrom} cargas salen, ${region.loadsTo} llegan, ${region.trucks} camiones disponibles`}
                  onClick={() => toggle(region.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(region.id);
                    }
                  }}
                  onMouseMove={(event) => {
                    const box = (
                      event.currentTarget.ownerSVGElement
                        ?.parentElement as HTMLElement
                    ).getBoundingClientRect();
                    const x = event.clientX - box.left;
                    setHover({
                      id: region.id,
                      x,
                      y: event.clientY - box.top,
                      flip: x > box.width * 0.55,
                    });
                  }}
                  onFocus={() => setHover(null)}
                />
              );
            })}
            {selected && REGION_SHAPES[selected] ? (
              <path
                d={REGION_SHAPES[selected].d}
                fill="none"
                stroke={CYAN}
                strokeWidth={2.4}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            ) : null}
            {regions.map((region) => {
              const shape = REGION_SHAPES[region.id];
              if (!shape) return null;
              return (
                <text
                  key={`t-${region.id}`}
                  x={shape.cx}
                  y={shape.cy + 3}
                  textAnchor="middle"
                  className="rdash-num"
                  fill={level(region.activity, max) >= 3 ? "#ffffff" : NAVY}
                >
                  {region.numeral}
                </text>
              );
            })}
          </svg>
          {tip && hover ? (
            <div
              className="rdash-tip"
              style={
                hover.flip
                  ? {
                      right: `calc(100% - ${hover.x - 12}px)`,
                      top: hover.y + 12,
                    }
                  : { left: hover.x + 12, top: hover.y + 12 }
              }
              aria-hidden="true"
            >
              <b>
                {tip.numeral} · {shortName(tip.name)}
              </b>
              <span>
                {plural(tip.loadsFrom, "carga sale", "cargas salen")} ·{" "}
                {plural(tip.loadsTo, "llega", "llegan")}
              </span>
              <span>
                {plural(
                  tip.trucks,
                  "camión disponible",
                  "camiones disponibles",
                )}
              </span>
            </div>
          ) : null}
        </div>
        <div className="map-legend">
          <span>
            <i style={{ background: SCALE[0] }} /> sin avisos
          </span>
          <span>
            <i style={{ background: SCALE[1] }} /> baja
          </span>
          <span>
            <i style={{ background: SCALE[2] }} /> media
          </span>
          <span>
            <i style={{ background: SCALE[4] }} /> alta
          </span>
        </div>
        {current ? (
          <div className="rdash-sel">
            <span>
              <b>
                {current.numeral} · {shortName(current.name)}
              </b>{" "}
              {plural(current.loadsFrom, "carga sale", "cargas salen")} ·{" "}
              {plural(current.loadsTo, "llega", "llegan")} ·{" "}
              {plural(current.trucks, "camión", "camiones")}
            </span>
            <Link
              className="btn sm"
              href={`/cargas?regionOrigen=${current.id}`}
            >
              Ver cargas
            </Link>
          </div>
        ) : null}
        <p className="rdash-note">
          Límites regionales: geoBoundaries / BCN (CC BY 3.0 IGO),
          simplificados. No se muestran Rapa Nui, Juan Fernández ni el
          Territorio Chileno Antártico.
        </p>
      </div>

      <div className="rdash-side">
        <div className="card rdash-pick">
          <label className="f">
            Región
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Todo Chile (16 regiones)</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.numeral} · {shortName(region.name)}
                  {region.activity ? ` (${region.activity})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="rdash-card" aria-live="polite">
            <h3>
              {current ? `${current.numeral} · ${current.name}` : "Todo Chile"}
            </h3>
            <div className="rdash-kpis">
              <div>
                <b>{current ? current.loadsFrom : totals.loadsFrom}</b>
                <span>cargas activas (origen)</span>
              </div>
              <div>
                <b>{current ? current.loadsTo : totals.loadsTo}</b>
                <span>cargas con destino</span>
              </div>
              <div>
                <b>{current ? current.trucks : totals.trucks}</b>
                <span>camiones disponibles</span>
              </div>
              <div>
                <b>
                  {current ? current.verifiedCarriers : totals.verifiedCarriers}
                </b>
                <span>transportistas verificados</span>
              </div>
            </div>
            <div className="row">
              <Link
                className="btn sm"
                href={
                  current ? `/cargas?regionOrigen=${current.id}` : "/cargas"
                }
              >
                Ver cargas
              </Link>
              <Link
                className="btn sm sec"
                href={
                  current ? `/camiones?regionOrigen=${current.id}` : "/camiones"
                }
              >
                Ver camiones
              </Link>
            </div>
          </div>
        </div>

        <div className="card rdash-tablecard">
          <table className="rdash-table">
            <thead>
              <tr>
                <th scope="col">Región</th>
                <th scope="col" title="Cargas activas que salen de la región">
                  Salen
                </th>
                <th scope="col" title="Cargas con destino en la región">
                  Llegan
                </th>
                <th scope="col" title="Camiones disponibles desde la región">
                  Camiones
                </th>
                <th scope="col" title="Transportistas verificados">
                  Verif.
                </th>
              </tr>
            </thead>
            <tbody>
              {regions.map((region) => (
                <tr
                  key={region.id}
                  className={selected === region.id ? "on" : ""}
                >
                  <th scope="row">
                    <button
                      type="button"
                      onClick={() => toggle(region.id)}
                      aria-pressed={selected === region.id}
                    >
                      <i
                        style={{
                          background: SCALE[level(region.activity, max)],
                        }}
                      />
                      <span className="n">{region.numeral}</span>{" "}
                      {shortName(region.name)}
                    </button>
                  </th>
                  <td className={region.loadsFrom ? "" : "z"}>
                    {region.loadsFrom}
                  </td>
                  <td className={region.loadsTo ? "" : "z"}>
                    {region.loadsTo}
                  </td>
                  <td className={region.trucks ? "" : "z"}>{region.trucks}</td>
                  <td className={region.verifiedCarriers ? "" : "z"}>
                    {region.verifiedCarriers}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total Chile</th>
                <td>{totals.loadsFrom}</td>
                <td>{totals.loadsTo}</td>
                <td>{totals.trucks}</td>
                <td>{totals.verifiedCarriers}</td>
              </tr>
            </tfoot>
          </table>
          <p className="rdash-note">
            Solo avisos reales y vigentes. Se actualiza con cada publicación.
          </p>
        </div>
      </div>
    </div>
  );
}
