"use client";

import { usePathname, useRouter } from "next/navigation";
import { EquipmentSelector } from "./EquipmentSelector";
import { CITIES, REGIONS, citiesInRegion, isEquipmentId } from "@/lib/catalog";

type RouteFilter = { regionOrigen: string; origen: string; regionDestino: string; destino: string };
type LoadFilter = RouteFilter & { equipo: string; desde: string; pesoMin: string; q: string; verificados: string; orden: string };
type TruckFilter = RouteFilter & { equipo: string; dia: string; capacidadMin: string; verificados: string; orden: string };

type Field =
  | { name: string; kind: "equipo"; value: string; label: string }
  | { name: string; kind: "region"; value: string; label: string; clears: string; counts?: Record<string, number> }
  | { name: string; kind: "select"; value: string; label: string; options: [string, string][] }
  | { name: string; kind: "city"; value: string; label: string; region: string }
  | { name: string; kind: "date" | "number" | "text"; value: string; label: string; placeholder?: string };

function routeFields(value: RouteFilter, counts?: Record<string, number>): Field[] {
  return [
    { name: "regionOrigen", kind: "region", value: value.regionOrigen, label: "Región origen", clears: "origen", counts },
    { name: "origen", kind: "city", value: value.origen, label: "Ciudad origen", region: value.regionOrigen },
    { name: "regionDestino", kind: "region", value: value.regionDestino, label: "Región destino", clears: "destino" },
    { name: "destino", kind: "city", value: value.destino, label: "Ciudad destino", region: value.regionDestino },
  ];
}

const VERIFIED: [string, string][] = [
  ["", "Todos los publicadores"],
  ["1", "Solo verificados"],
];

export function LoadFilters({ value, counts }: { value: LoadFilter; counts?: Record<string, number> }) {
  return (
    <FilterBar
      fields={[
        { name: "equipo", kind: "equipo", value: value.equipo, label: "Equipo" },
        ...routeFields(value, counts),
        { name: "desde", kind: "date", value: value.desde, label: "Retiro desde" },
        { name: "pesoMin", kind: "number", value: value.pesoMin, label: "Peso mín. (t)", placeholder: "Peso mín. (t)" },
        { name: "q", kind: "text", value: value.q, label: "Buscar", placeholder: "Buscar…" },
        { name: "verificados", kind: "select", value: value.verificados, label: "Publicador", options: VERIFIED },
        {
          name: "orden",
          kind: "select",
          value: value.orden,
          label: "Ordenar",
          options: [
            ["", "Más recientes"],
            ["fecha", "Retiro más próximo"],
            ["compatibles", "Más camiones compatibles"],
          ],
        },
      ]}
    />
  );
}

export function TruckFilters({ value, counts }: { value: TruckFilter; counts?: Record<string, number> }) {
  return (
    <FilterBar
      fields={[
        { name: "equipo", kind: "equipo", value: value.equipo, label: "Equipo" },
        ...routeFields(value, counts),
        { name: "dia", kind: "date", value: value.dia, label: "Disponible el" },
        {
          name: "capacidadMin",
          kind: "number",
          value: value.capacidadMin,
          label: "Capacidad mín. (t)",
          placeholder: "Capacidad mín. (t)",
        },
        { name: "verificados", kind: "select", value: value.verificados, label: "Publicador", options: VERIFIED },
        {
          name: "orden",
          kind: "select",
          value: value.orden,
          label: "Ordenar",
          options: [
            ["", "Más recientes"],
            ["fecha", "Disponible antes"],
            ["compatibles", "Más cargas compatibles"],
          ],
        },
      ]}
    />
  );
}

function FilterBar({ fields }: { fields: Field[] }) {
  const router = useRouter();
  const pathname = usePathname();

  function update(name: string, next: string, clears?: string) {
    const params = new URLSearchParams(window.location.search);
    if (next) params.set(name, next);
    else params.delete(name);
    if (clears) params.delete(clears);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const active = fields.some((field) => field.value && field.name !== "orden");

  return (
    <div className="filters">
      {fields.map((field) => {
        if (field.kind === "equipo") {
          const value = field.value.split(",").filter((id) => isEquipmentId(id));
          return (
            <div key={field.name} className="filters-eq">
              <EquipmentSelector mode="multi" layout="carousel" name="equipo" label="Equipo" value={value} onChange={(ids) => update(field.name, ids.join(","))} />
            </div>
          );
        }
        if (field.kind === "region") {
          return (
            <select
              key={field.name}
              value={field.value}
              aria-label={field.label}
              onChange={(event) => update(field.name, event.target.value, field.clears)}
            >
              <option value="">{field.label}</option>
              {REGIONS.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.numeral} · {region.name}
                  {field.counts?.[region.id] ? ` (${field.counts[region.id]})` : ""}
                </option>
              ))}
            </select>
          );
        }
        if (field.kind === "select") {
          return (
            <select key={field.name} value={field.value} aria-label={field.label} onChange={(event) => update(field.name, event.target.value)}>
              {field.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          );
        }
        if (field.kind === "city") {
          const cities = field.region ? citiesInRegion(field.region) : CITIES;
          return (
            <select key={field.name} value={field.value} aria-label={field.label} onChange={(event) => update(field.name, event.target.value)}>
              <option value="">{field.label}</option>
              {cities.map((city) => (
                <option key={city.name} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
          );
        }
        return (
          <input
            key={field.name}
            type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
            min={field.kind === "number" ? 0 : undefined}
            placeholder={field.placeholder}
            aria-label={field.label}
            value={field.value}
            onChange={(event) => update(field.name, event.target.value)}
          />
        );
      })}
      {active ? (
        <button className="btn sec sm" type="button" onClick={() => router.replace(pathname)}>
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}
