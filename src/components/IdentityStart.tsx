"use client";

import { useState } from "react";

type Props = {
  consentVersion: string;
  title: string;
  paragraphs: string[];
  checkbox: string;
  links: { href: string; label: string }[];
  buttonText: string;
};

/** Consentimiento expreso + botón que crea la sesión en Didit y redirige al flujo alojado. */
export function IdentityStart({ consentVersion, title, paragraphs, checkbox, links, buttonText }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/verificacion/identidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, consentVersion }),
      });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !data?.url) throw new Error(data?.error || "No pudimos iniciar la verificación.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos iniciar la verificación.");
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {paragraphs.map((text, index) => (
        <p key={index} className="meta">
          {text}
        </p>
      ))}
      <p className="meta">
        {links.map((link, index) => (
          <span key={link.href}>
            {index ? " · " : ""}
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          </span>
        ))}
        {" · "}
        <a href="/privacidad" target="_blank" rel="noopener noreferrer">
          Política de Privacidad de Carga360go
        </a>
      </p>
      <label className="row" style={{ alignItems: "flex-start", gap: 8, margin: "10px 0" }}>
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} style={{ marginTop: 4 }} />
        <span>{checkbox}</span>
      </label>
      {error ? (
        <div className="notice" style={{ background: "#fee2e2", borderColor: "#f3c0c0", color: "#991b1b", marginBottom: 10 }}>
          {error}
        </div>
      ) : null}
      <button className="btn" type="button" disabled={!accepted || busy} onClick={start}>
        {busy ? "Abriendo la verificación…" : buttonText}
      </button>
      <p className="meta" style={{ marginBottom: 0 }}>
        Necesitas tu cédula de identidad vigente y un celular con cámara (si estás en el computador, podrás seguir con un código QR).
      </p>
    </div>
  );
}
