"use client";

import { useRef } from "react";
import { EQUIPMENT } from "@/lib/catalog";
import { EQUIPMENT_CAPACITY } from "@/lib/equipment-capacity";
import { TruckArt } from "./TruckArt";


type Single = { mode: "single"; value: string; onChange: (id: string) => void };
type Multi = { mode: "multi"; value: string[]; onChange: (ids: string[]) => void };

type Props = (Single | Multi) & {
  name?: string;
  label?: string;
  /** "grid" muestra todas las tarjetas; "carousel" fuerza scroll horizontal también en escritorio. */
  layout?: "grid" | "carousel";
  include?: string[];
};

export function EquipmentSelector(props: Props) {
  const { name, label = "Tipo de equipo", layout = "grid", include } = props;
  const items = include ? EQUIPMENT.filter((item) => include.includes(item.id)) : EQUIPMENT;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = (id: string) => (props.mode === "single" ? props.value === id : props.value.includes(id));
  const hidden = props.mode === "single" ? props.value : props.value.join(",");

  function toggle(id: string) {
    if (props.mode === "single") props.onChange(id);
    else props.onChange(props.value.includes(id) ? props.value.filter((item) => item !== id) : [...props.value, id]);
  }

  function onKey(event: React.KeyboardEvent, index: number) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (event.key === "Home" || event.key === "End" || keys[event.key]) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + keys[event.key] + items.length) % items.length;
      refs.current[next]?.focus();
      refs.current[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (props.mode === "single") props.onChange(items[next].id);
    }
  }

  const single = props.mode === "single";
  const focusIndex = single ? Math.max(0, items.findIndex((item) => item.id === props.value)) : 0;

  return (
    <div className={`eqsel ${layout}`}>
      {name ? <input type="hidden" name={name} value={hidden} /> : null}
      <div
        className="eqsel-track"
        role={single ? "radiogroup" : "group"}
        aria-label={single ? label : `${label} (puedes elegir varios)`}
      >
        {items.map((item, index) => {
          const on = selected(item.id);
          return (
            <button
              key={item.id}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role={single ? "radio" : "checkbox"}
              aria-checked={on}
              tabIndex={single ? (index === focusIndex ? 0 : -1) : 0}
              className={`eqcard${on ? " on" : ""}`}
              onClick={() => toggle(item.id)}
              onKeyDown={(event) => (single ? onKey(event, index) : undefined)}
            >
              <span className="eqcheck" aria-hidden="true">
                ✓
              </span>
              <TruckArt id={item.id} />
              <span className="eqname">{item.label}</span>
              <span className="eqcap">{EQUIPMENT_CAPACITY[item.id]}</span>
            </button>
          );
        })}
      </div>
      {!single ? (
        <div className="eqsel-foot">
          <span className="meta">{props.value.length ? `${props.value.length} seleccionado(s)` : "Todos los equipos"}</span>
          {props.value.length ? (
            <button type="button" className="linkish" onClick={() => props.onChange([])}>
              Quitar selección
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
