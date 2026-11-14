"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Bloquea el sitio a una cuenta con sesión hasta que acepte las versiones vigentes de la Política de Privacidad y de los Términos de uso. */
export function PrivacyGate({
  name,
  version,
  termsVersion,
  firstTime,
  children,
  terms,
}: {
  name: string;
  version: string;
  termsVersion: string;
  firstTime: boolean;
  children: React.ReactNode;
  terms: React.ReactNode;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accepted) return setError("Marca la casilla para continuar.");
    setPending(true);
    setError("");
    const response = await fetch("/api/cuenta/privacidad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptPrivacy: true, acceptTerms: true }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return setError(body?.error || "No se pudo guardar. Inténtalo de nuevo.");
    }
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/salir", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }

  return (
    <div className="wrap" style={{ padding: "24px 16px 40px", maxWidth: 640 }}>
      <form className="card" onSubmit={onSubmit}>
        <h1 style={{ fontSize: "1.4rem" }}>
          {firstTime ? "Acepta la Política de Privacidad y los Términos de uso" : "Actualizamos la Política de Privacidad y los Términos de uso"}
        </h1>
        <p>
          Hola {name}. Para seguir usando Carga360go necesitamos que leas y aceptes la Política de Privacidad (versión {version}) y los
          Términos de uso (versión {termsVersion}). Entre otras cosas: los datos de contacto se comparten solo entre el mandante y el
          transportista elegido cuando se adjudica una oferta, y cada cuenta tiene 30 días gratis desde su inscripción; luego se cobrará una
          membresía (valores por definir) con beneficios y convenios. Te avisaremos antes de cualquier cobro y no se cobra nada sin tu
          aceptación.
        </p>
        <h2 style={{ fontSize: "1.1rem" }}>Política de Privacidad</h2>
        <div className="legal privacy-gate-text" tabIndex={0} aria-label="Texto de la Política de Privacidad">
          {children}
        </div>
        <p className="meta">
          <a href="/carga360go-politica-privacidad.pdf" target="_blank" rel="noopener noreferrer">
            Descargar la Política en PDF
          </a>
        </p>
        <h2 style={{ fontSize: "1.1rem" }}>Términos de uso</h2>
        <div className="legal privacy-gate-text" tabIndex={0} aria-label="Texto de los Términos de uso">
          {terms}
        </div>
        <p className="meta">
          <a href="/carga360go-terminos-uso.pdf" target="_blank" rel="noopener noreferrer">
            Descargar los Términos en PDF
          </a>
        </p>
        <div className="privacy-accept">
          <label className="f chk">
            <input type="checkbox" name="acceptPrivacy" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required />
            <span>
              He leído y acepto la{" "}
              <a href="/carga360go-politica-privacidad.pdf" target="_blank" rel="noopener noreferrer">
                Política de Privacidad
              </a>{" "}
              y los{" "}
              <a href="/carga360go-terminos-uso.pdf" target="_blank" rel="noopener noreferrer">
                Términos de uso
              </a>
            </span>
          </label>
        </div>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Aceptar y continuar"}
          </button>
          <button className="btn sec" type="button" onClick={logout}>
            Salir
          </button>
        </div>
      </form>
    </div>
  );
}
