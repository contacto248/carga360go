"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatRut, formatWhatsappDisplay, isValidRut } from "@/lib/format";
import type { PublicUser } from "@/lib/types";
import { PlacePicker } from "./PlacePicker";

/**
 * "Mis datos": corrige correo, RUT, razón social, contacto, WhatsApp y ciudad.
 * Con `adminId` (el id de la cuenta a editar) guarda vía /api/admin/usuarios/[id].
 */
export function ProfileForm({ user, rutLocked = false, adminId }: { user: PublicUser; rutLocked?: boolean; adminId?: string }) {
  const router = useRouter();
  const [razonSocial, setRazonSocial] = useState(user.razonSocial);
  const [rut, setRut] = useState(user.rut);
  const [contactName, setContactName] = useState(user.contactName);
  const [email, setEmail] = useState(user.email);
  const [whatsapp, setWhatsapp] = useState(formatWhatsappDisplay(user.whatsapp));
  const [city, setCity] = useState(user.city);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!rutLocked && !isValidRut(rut)) return setError("El RUT no es válido (revisa el dígito verificador).");
    setPending(true);
    setError("");
    setMsg("");
    const payload: Record<string, string> = { razonSocial, contactName, email, whatsapp, city };
    if (!rutLocked) payload.rut = rut;
    const response = await fetch(adminId ? `/api/admin/usuarios/${adminId}` : "/api/cuenta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    const data = (await response.json().catch(() => null)) as { error?: string; emailChanged?: boolean } | null;
    if (!response.ok) return setError(data?.error || "No se pudieron guardar los datos.");
    setMsg(
      data?.emailChanged
        ? `Datos guardados. Te enviamos un enlace a ${email.trim().toLowerCase()} para confirmar el correo nuevo.`
        : "Datos guardados.",
    );
    router.refresh();
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="form-grid">
        <label className="f">
          Razón social / nombre *
          <input value={razonSocial} onChange={(event) => setRazonSocial(event.target.value)} required />
        </label>
        <label className="f">
          RUT *
          <input
            value={rut}
            disabled={rutLocked}
            onChange={(event) => setRut(event.target.value)}
            onBlur={() => isValidRut(rut) && setRut(formatRut(rut))}
            required
          />
          {rutLocked ? <span className="meta">Para cambiar el RUT de una cuenta verificada, escríbenos.</span> : null}
        </label>
        <label className="f">
          Nombre de contacto *
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} required />
        </label>
        <label className="f">
          Correo *
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <span className="meta">Si lo cambias, hay que confirmarlo de nuevo.</span>
        </label>
        <label className="f">
          WhatsApp *
          <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} inputMode="tel" required />
        </label>
        <PlacePicker label="tu base" value={city} onChange={setCity} />
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {msg ? <p className="okmsg">{msg}</p> : null}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm" type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar datos"}
        </button>
      </div>
    </form>
  );
}
