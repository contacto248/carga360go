"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { equipmentById } from "@/lib/catalog";
import { formatClp, formatDateCL } from "@/lib/format";
import { REFERENCE_NOTICE } from "@/lib/costos/notice";
import { canPublishLoad, roleLabel } from "@/lib/roles";
import type { PublicUser, Specs } from "@/lib/types";
import { PlacePicker } from "./PlacePicker";
import { EquipmentPicker, SpecFields } from "./SpecFields";

type Initial = {
  id?: string;
  equipment: string;
  origin: string;
  destination: string;
  pickupDate: string;
  weightT: string;
  description: string;
  specs: Specs;
  budgetClp: string;
  notes: string;
  soloVerificados: boolean;
  inmediata: boolean;
  /** "" = plazo por defecto del administrador; al editar, "" mantiene el plazo actual. */
  offerHours: string;
  /** "" = valor por defecto del administrador. */
  allowImprove: "" | "si" | "no";
};

type Defaults = { offerHours: number; allowImprove: boolean; showSuggestedPrice: boolean; hourChoices: readonly number[] };

function hoursLabel(hours: number) {
  if (hours % 24 === 0) return hours === 24 ? "24 horas (1 día)" : `${hours / 24} días`;
  return `${hours} horas`;
}

export function LoadForm({ user, today, initial, defaults }: { user: PublicUser | null; today: string; initial: Initial; defaults: Defaults }) {
  const router = useRouter();
  const [equipment, setEquipment] = useState(initial.equipment);
  const [origin, setOrigin] = useState(initial.origin);
  const [destination, setDestination] = useState(initial.destination);
  const [pickupDate, setPickupDate] = useState(initial.pickupDate);
  const [weightT, setWeightT] = useState(initial.weightT);
  const [description, setDescription] = useState(initial.description);
  const [specs, setSpecs] = useState<Specs>(initial.specs);
  const [budgetClp, setBudgetClp] = useState(initial.budgetClp);
  const [notes, setNotes] = useState(initial.notes);
  const [soloVerificados, setSoloVerificados] = useState(initial.soloVerificados);
  const [inmediata, setInmediata] = useState(initial.inmediata);
  const [offerHours, setOfferHours] = useState(initial.offerHours);
  const [allowImprove, setAllowImprove] = useState(initial.allowImprove);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState<{ km: number | null; costo: { costoTotal: number | null; complete: boolean; method: string } | null; compatibles: number | null } | null>(null);
  const def = equipmentById(equipment);
  const allowed = Boolean(user && canPublishLoad(user.role));

  useEffect(() => {
    if (origin === destination) {
      setPreview(null);
      return;
    }
    const params = new URLSearchParams({ origen: origin, destino: destination, equipo: equipment, peso: weightT || "0", fecha: pickupDate });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/estimacion?${params}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setPreview(data))
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [origin, destination, equipment, weightT, pickupDate]);

  function stepError(target: number): string {
    if (target >= 2) {
      if (origin === destination) return "El origen y el destino no pueden ser iguales.";
      if (!pickupDate) return "Indica la fecha de retiro.";
    }
    if (target >= 3) {
      const weight = Number(weightT);
      if (!weight || weight <= 0) return "Indica el peso de la carga en toneladas.";
      if (!description.trim()) return "Describe la carga.";
      for (const field of def.loadFields) {
        if (field.required && (specs[field.key] === undefined || specs[field.key] === "")) return `Falta: ${field.label}`;
      }
    }
    return "";
  }

  function goTo(target: number) {
    const problem = target > step ? stepError(target) : "";
    if (problem) return setError(problem);
    setError("");
    setStep(target);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (step < 3) return goTo(step + 1);
    // Solo publica el botón "Publicar": evita que un clic en "Siguiente" (que cambia de botón) envíe el formulario.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter && submitter.dataset.publish !== "1") return;
    if (!user || !allowed) return;
    if (origin === destination) return setError("El origen y el destino no pueden ser iguales.");
    const weight = Number(weightT);
    if (!weight || weight <= 0) return setError("Indica el peso de la carga en toneladas.");
    if (!description.trim()) return setError("Describe la carga.");
    for (const field of def.loadFields) {
      if (field.required && (specs[field.key] === undefined || specs[field.key] === "")) {
        return setError(`Falta: ${field.label}`);
      }
    }
    setPending(true);
    setError("");
    const response = await fetch(initial.id ? `/api/cargas/${initial.id}` : "/api/cargas", {
      method: initial.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipment,
        origin,
        destination,
        pickupDate,
        weightT: weight,
        description,
        specs,
        budgetClp: budgetClp ? Number(budgetClp) : null,
        notes,
        soloVerificados,
        inmediata,
        offerHours: offerHours ? Number(offerHours) : null,
        allowImprove: allowImprove === "" ? null : allowImprove === "si",
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "No se pudo guardar la carga.");
      return;
    }
    router.push("/panel?ok=carga");
    router.refresh();
  }

  return (
    <>
      {!user ? (
        <div className="notice" style={{ margin: "16px 0" }}>
          Para publicar necesitas una cuenta de empresa o transportista (toma 1 minuto y valida tu RUT).{" "}
          <Link href="/registro">
            <strong>Registrar ahora →</strong>
          </Link>{" "}
          · <Link href={`/ingreso?next=/cargas/${initial.id ? `${initial.id}/editar` : "nueva"}`}>Ya tengo cuenta</Link>
        </div>
      ) : null}
      {user && !allowed ? (
        <div className="notice" style={{ margin: "16px 0" }}>
          Tu cuenta es de {roleLabel(user.role).toLowerCase()}. Las cargas las publican mandantes y empresas que necesitan transporte.
        </div>
      ) : null}
      <form className="card" onSubmit={onSubmit}>
        <ol className="wizard-steps" aria-label="Pasos">
          {["Ruta y fecha", "Carga y equipo", "Precio y publicar"].map((label, index) => (
            <li key={label} className={step === index + 1 ? "on" : step > index + 1 ? "done" : ""}>
              <button type="button" className="linkish" onClick={() => goTo(index + 1)}>
                <span>{index + 1}</span> {label}
              </button>
            </li>
          ))}
        </ol>
        {step === 1 ? (
          <>
            <h3>¿Desde dónde y hacia dónde?</h3>
            <div className="form-grid">
              <PlacePicker label="origen" value={origin} onChange={setOrigin} />
              <PlacePicker label="destino" value={destination} onChange={setDestination} />
              <label className="f">
                Fecha de retiro *
                <input type="date" min={today} value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} required />
              </label>
              <div className="wizard-km">
                <span>Distancia estimada</span>
                <strong>{preview?.km ? `≈ ${formatClp(preview.km)} km` : "—"}</strong>
              </div>
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <h3>Tipo de equipo requerido</h3>
            <EquipmentPicker
              value={equipment}
              onChange={(id) => {
                setEquipment(id);
                setSpecs({});
              }}
            />
            <p className="meta">{def.desc}</p>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label className="f">
                Peso total (t) *
                <input type="number" inputMode="decimal" min={0} step="any" value={weightT} onChange={(event) => setWeightT(event.target.value)} required />
              </label>
              <label className="f">
                Descripción de la carga *
                <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: 24 pallets de abarrotes, fierro de construcción, excavadora" required />
              </label>
            </div>
            {def.loadFields.length > 0 ? <h3 style={{ marginTop: 14 }}>Requisitos específicos — {def.label}</h3> : null}
            <div className="form-grid">
              <SpecFields fields={def.loadFields} values={specs} onChange={(key, value) => setSpecs((current) => ({ ...current, [key]: value }))} />
            </div>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <div className="wizard-preview">
              <div>
                <div className="meta">Vista previa</div>
                <div className="route">
                  {origin} <span className="arrow">→</span> {destination}
                </div>
                <div className="meta">
                  {def.icon} {def.label} · {weightT} t · retiro {formatDateCL(pickupDate)}
                  {preview?.km ? ` · ≈ ${formatClp(preview.km)} km` : ""}
                </div>
                <div style={{ marginTop: 4 }}>{description}</div>
              </div>
              <div className="wizard-stats">
                <div>
                  <strong>{preview?.compatibles ?? "—"}</strong>
                  <span>camiones calzan hoy</span>
                </div>
                {defaults.showSuggestedPrice ? (
                  <div>
                    <strong>{preview?.costo?.costoTotal ? `$${formatClp(preview.costo.costoTotal)}` : "—"}</strong>
                    <span>
                      costo referencial del flete{preview?.costo && !preview.costo.complete ? " (incompleto)" : ""}
                      {preview?.costo?.method === "respaldo_linea_recta" ? " · cálculo de respaldo" : ""}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="meta">
              {defaults.showSuggestedPrice ? `Costo calculado con ruta real, peajes, diésel, conductor y desgaste. ${REFERENCE_NOTICE} ` : ""}Al publicar, avisamos por correo a los
              transportistas con camiones compatibles y los transportistas aprobados pueden enviarte ofertas. Tú eliges la que prefieras.
            </p>
            <div className="form-grid">
              <label className="f">
                Precio que ofreces (CLP, opcional; lo ven los transportistas)
                <input type="number" inputMode="numeric" min={1} step={1} value={budgetClp} onChange={(event) => setBudgetClp(event.target.value)} placeholder="Déjalo vacío para recibir ofertas libres" />
              </label>
              <label className="f">
                Plazo para recibir ofertas
                <select value={offerHours} onChange={(event) => setOfferHours(event.target.value)}>
                  <option value="">{initial.id ? "Mantener el plazo actual" : `Recomendado: ${hoursLabel(defaults.offerHours)}`}</option>
                  {defaults.hourChoices.map((hours) => (
                    <option key={hours} value={String(hours)}>
                      {initial.id ? `Reabrir por ${hoursLabel(hours)} desde ahora` : hoursLabel(hours)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="f">
                ¿Los transportistas pueden mejorar su oferta?
                <select value={allowImprove} onChange={(event) => setAllowImprove(event.target.value as Initial["allowImprove"])}>
                  <option value="">Recomendado: {defaults.allowImprove ? "sí, pueden bajar su precio" : "no, una sola oferta"}</option>
                  <option value="si">Sí, pueden bajar su precio hasta el cierre</option>
                  <option value="no">No, una sola oferta por transportista</option>
                </select>
              </label>
              {defaults.showSuggestedPrice && preview?.costo?.costoTotal && preview.costo.complete && !budgetClp ? (
                <div className="f">
                  &nbsp;
                  <button className="btn sec sm" type="button" onClick={() => setBudgetClp(String(Math.round(preview.costo!.costoTotal! / 1000) * 1000))}>
                    Usar el costo referencial
                  </button>
                </div>
              ) : null}
              <label className="f full">
                Observaciones
                <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
              <label className="f chk full">
                <input type="checkbox" checked={soloVerificados} onChange={(event) => setSoloVerificados(event.target.checked)} />
                Solo transportistas verificados
              </label>
              <label className="f chk full">
                <input type="checkbox" checked={inmediata} onChange={(event) => setInmediata(event.target.checked)} />
                Pedido de camión inmediato
              </label>
            </div>
            <p className="meta">Si lo marcas, el match y los avisos llegan solo a camiones de cuentas que un administrador ya verificó.</p>
          </>
        ) : null}
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row" style={{ marginTop: 14 }}>
          {step > 1 ? (
            <button className="btn sec" type="button" onClick={() => goTo(step - 1)}>
              ← Atrás
            </button>
          ) : null}
          {step < 3 ? (
            <button key="siguiente" className="btn" type="button" onClick={() => goTo(step + 1)}>
              Siguiente →
            </button>
          ) : (
            <button key="publicar" data-publish="1" className="btn" type="submit" disabled={!allowed || pending}>
              {pending ? "Guardando…" : initial.id ? "Guardar cambios" : "Publicar carga"}
            </button>
          )}
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
