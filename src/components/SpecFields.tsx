"use client";

import { EquipmentSelector } from "./EquipmentSelector";
import type { SpecField, Specs } from "@/lib/types";

export function EquipmentPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return <EquipmentSelector mode="single" name="equipment" value={value} onChange={onChange} />;
}

export function SpecFields({
  fields,
  values,
  onChange,
}: {
  fields: SpecField[];
  values: Specs;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  return (
    <>
      {fields.map((field) => {
        const label = `${field.label}${field.unit ? ` (${field.unit})` : ""}${field.required ? " *" : ""}`;
        if (field.kind === "bool") {
          return (
            <label key={field.key} className="f chk">
              <input
                type="checkbox"
                checked={values[field.key] === true}
                onChange={(event) => onChange(field.key, event.target.checked)}
              />
              {field.label}
            </label>
          );
        }
        if (field.kind === "select") {
          return (
            <label key={field.key} className="f">
              {label}
              <select value={String(values[field.key] ?? "")} onChange={(event) => onChange(field.key, event.target.value)}>
                <option value="">Selecciona…</option>
                {field.options?.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          );
        }
        if (field.kind === "number") {
          const allowNegative = field.key === "tempMin" || field.key === "tempMax" || field.key === "tempReq";
          return (
            <label key={field.key} className="f">
              {label}
              <input
                type="number"
                inputMode="decimal"
                min={allowNegative ? undefined : 0}
                step={field.step ?? "any"}
                value={values[field.key] === undefined ? "" : String(values[field.key])}
                onChange={(event) => onChange(field.key, event.target.value === "" ? "" : Number(event.target.value))}
              />
            </label>
          );
        }
        return (
          <label key={field.key} className="f">
            {label}
            <input
              type="text"
              placeholder={field.placeholder}
              value={String(values[field.key] ?? "")}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </label>
        );
      })}
    </>
  );
}
