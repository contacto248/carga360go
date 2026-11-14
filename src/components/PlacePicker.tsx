"use client";

import { CITIES, REGIONS, citiesInRegion, cityByName } from "@/lib/catalog";

/**
 * Selector en dos pasos: primero la región (las 16, de norte a sur) y luego la ciudad o comuna de esa región.
 * Guarda el nombre de la ciudad; la región se deduce de ella.
 */
export function PlacePicker({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (city: string) => void;
  required?: boolean;
}) {
  const current = cityByName(value) ?? CITIES[0];
  const regionId = current.regionId;
  const cities = citiesInRegion(regionId);
  const mark = required ? " *" : "";
  return (
    <>
      <label className="f">
        {`Región de ${label}${mark}`}
        <select
          value={regionId}
          onChange={(event) => {
            const first = citiesInRegion(event.target.value)[0];
            if (first) onChange(first.name);
          }}
        >
          {REGIONS.map((region) => (
            <option key={region.id} value={region.id}>
              {region.numeral} · {region.name}
            </option>
          ))}
        </select>
      </label>
      <label className="f">
        {`Ciudad / comuna de ${label}${mark}`}
        <select value={current.name} onChange={(event) => onChange(event.target.value)}>
          {cities.map((city) => (
            <option key={city.name} value={city.name}>
              {city.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
