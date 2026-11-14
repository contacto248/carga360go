"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettingsForm({ initial, choices }: { initial: { offerHours: number; allowImprove: boolean; showSuggestedPrice: boolean }; choices: readonly number[] }) {
  const router = useRouter();
  const [offerHours, setOfferHours] = useState(String(initial.offerHours));
  const [allowImprove, setAllowImprove] = useState(initial.allowImprove);
  const [showSuggestedPrice, setShowSuggestedPrice] = useState(initial.showSuggestedPrice);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMsg("");
    setErr("");
    const response = await fetch("/api/admin/ajustes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerHours: Number(offerHours), allowImprove, showSuggestedPrice }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) return setErr(data?.error || "No se pudo guardar.");
    setMsg("Ajustes guardados.");
    router.refresh();
  }
  const options = choices.includes(Number(offerHours)) ? choices : [...choices, Number(offerHours)].sort((a, b) => a - b);
  return (
    <form className="card" onSubmit={save}>
      <h3>Valores por defecto de las solicitudes</h3>
      <p className="meta">Cada mandante puede cambiarlos en su carga; estos se usan cuando no elige nada.</p>
      <div className="form-grid">
        <label className="f">
          Plazo para recibir ofertas
          <select value={offerHours} onChange={(event) => setOfferHours(event.target.value)}>
            {options.map((hours) => (
              <option key={hours} value={String(hours)}>
                {hours % 24 === 0 ? `${hours / 24} ${hours === 24 ? "día" : "días"} (${hours} h)` : `${hours} horas`}
              </option>
            ))}
          </select>
        </label>
        <label className="f chk">
          <input type="checkbox" checked={allowImprove} onChange={(event) => setAllowImprove(event.target.checked)} />
          Los transportistas pueden mejorar (bajar) su oferta
        </label>
        <label className="f chk full">
          <input type="checkbox" checked={showSuggestedPrice} onChange={(event) => setShowSuggestedPrice(event.target.checked)} />
          Mostrar precio sugerido por la plataforma en las cargas (rango referencial por km)
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" type="submit">
          Guardar ajustes
        </button>
        {msg ? <span className="okmsg">{msg}</span> : null}
        {err ? <span className="err">{err}</span> : null}
      </div>
    </form>
  );
}
