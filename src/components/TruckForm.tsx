"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { equipmentById } from "@/lib/catalog";
import { canPublishTruck, roleLabel } from "@/lib/roles";
import type { PublicUser, Specs } from "@/lib/types";
import { PlacePicker } from "./PlacePicker";
import { EquipmentPicker, SpecFields } from "./SpecFields";

type Initial = {
  id?: string;
  equipment: string;
  origin: string;
  destination: string;
  availableFrom: string;
  availableTo: string;
  tonnage: string;
  specs: Specs;
  notes: string;
};

export function TruckForm({ user, today, initial }: { user: PublicUser | null; today: string; initial: Initial }) {
  const router = useRouter();
  const [equipment, setEquipment] = useState(initial.equipment);
  const [origin, setOrigin] = useState(initial.origin);
  const [destination, setDestination] = useState(initial.destination);
  const [availableFrom, setAvailableFrom] = useState(initial.availableFrom);
  const [availableTo, setAvailableTo] = useState(initial.availableTo);
  const [tonnage, setTonnage] = useState(initial.tonnage);
  const [specs, setSpecs] = useState<Specs>(initial.specs);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const def = equipmentById(equipment);
  const allowed = Boolean(user && canPublishTruck(user.role));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !allowed) return;
    if (origin === destination) return setError("El origen y el destino no pueden ser iguales.");
    if (availableTo < availableFrom) return setError("La fecha final no puede ser anterior a la inicial.");
    const capacity = Number(tonnage);
    if (!capacity || capacity <= 0) return setError("Indica la capacidad en toneladas.");
    for (const field of def.truckFields) {
      if (field.required && (specs[field.key] === undefined || specs[field.key] === "")) {
        return setError(`Falta: ${field.label}`);
      }
    }
    if (equipment === "refrigerado" && Number(specs.tempMin) > Number(specs.tempMax)) {
      return setError("La temperatura mínima no puede ser mayor que la máxima.");
    }
    setPending(true);
    setError("");
    const response = await fetch(initial.id ? `/api/camiones/${initial.id}` : "/api/camiones", {
      method: initial.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipment,
        origin,
        destination,
        availableFrom,
        availableTo,
        tonnage: capacity,
        specs,
        notes,
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "No se pudo guardar el camión.");
      return;
    }
    router.push("/panel?ok=camion");
    router.refresh();
  }

  return (
    <>
      {!user ? (
        <div className="notice" style={{ margin: "16px 0" }}>
          Para publicar necesitas registrar tu empresa o transportista (toma 1 minuto y valida tu RUT).{" "}
          <Link href="/registro">
            <strong>Registrar ahora →</strong>
          </Link>{" "}
          · <Link href={`/ingreso?next=/camiones/${initial.id ? `${initial.id}/editar` : "nuevo"}`}>Ya tengo cuenta</Link>
        </div>
      ) : null}
      {user && !allowed ? (
        <div className="notice" style={{ margin: "16px 0" }}>
          Tu cuenta es de {roleLabel(user.role).toLowerCase()}. Los camiones los publican transportistas.
        </div>
      ) : null}
      <form className="card" onSubmit={onSubmit}>
        <h3>1. Tipo de equipo</h3>
        <EquipmentPicker
          value={equipment}
          onChange={(id) => {
            setEquipment(id);
            setSpecs({});
          }}
        />
        <p className="meta">{def.desc}</p>
        <h3 style={{ marginTop: 14 }}>2. Corredor y disponibilidad</h3>
        <div className="form-grid">
          <PlacePicker label="origen (dónde estás)" value={origin} onChange={setOrigin} />
          <PlacePicker label="destino (hacia dónde vas)" value={destination} onChange={setDestination} />
          <label className="f">
            Disponible desde *
            <input type="date" min={today} value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} required />
          </label>
          <label className="f">
            Disponible hasta *
            <input type="date" min={availableFrom} value={availableTo} onChange={(event) => setAvailableTo(event.target.value)} required />
          </label>
        </div>
        <h3 style={{ marginTop: 14 }}>3. Ficha técnica — {def.label}</h3>
        <div className="form-grid">
          <label className="f">
            Capacidad de carga (t) *
            <input type="number" inputMode="decimal" min={0} step="any" value={tonnage} onChange={(event) => setTonnage(event.target.value)} required />
          </label>
          <SpecFields fields={def.truckFields} values={specs} onChange={(key, value) => setSpecs((current) => ({ ...current, [key]: value }))} />
          <label className="f full">
            Observaciones
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" type="submit" disabled={!allowed || pending}>
            {pending ? "Guardando…" : initial.id ? "Guardar cambios" : "Publicar camión"}
          </button>
          {user && allowed ? (
            <span className="meta">
              Publicas como {user.razonSocial} · contacto WhatsApp {user.whatsapp}
            </span>
          ) : null}
        </div>
      </form>
    </>
  );
}
