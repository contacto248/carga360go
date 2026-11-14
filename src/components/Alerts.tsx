"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function errorOf(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || fallback;
}

export function Unsubscribe({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  async function confirm() {
    const response = await fetch("/api/alertas/baja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
    });
    if (response.ok) setState("ok");
    else {
      setState("error");
      setMessage(await errorOf(response, "No se pudo procesar la baja."));
    }
  }
  if (!token) return <div className="card">El enlace está incompleto. Puedes administrar tus alertas desde <Link href="/panel#alertas">tu panel</Link>.</div>;
  return (
    <div className="card">
      {state === "ok" ? (
        <>
          <h3>Listo, no te enviaremos más alertas.</h3>
          <p className="meta">Puedes volver a activarlas cuando quieras desde <Link href="/panel#alertas">tu panel</Link>.</p>
        </>
      ) : (
        <>
          <p>Dejarás de recibir correos con cargas y camiones que calzan con tus publicaciones o búsquedas guardadas. Los correos de tu cuenta (verificación, contraseña) se siguen enviando.</p>
          <button className="btn" type="button" onClick={confirm}>
            Sí, dejar de recibir alertas
          </button>
          {state === "error" ? <p className="err">{message}</p> : null}
        </>
      )}
    </div>
  );
}

export function SaveSearch({ kind, filters, loggedIn }: { kind: "cargas" | "camiones"; filters: Record<string, string>; loggedIn: boolean }) {
  const [state, setState] = useState<"idle" | "pending" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const hasFilter = Object.entries(filters).some(([key, value]) => value && key !== "orden");
  if (!loggedIn) {
    return (
      <span className="save-search">
        <Link className="btn sec sm" href="/registro">
          🔔 Crea tu cuenta para guardar una alerta
        </Link>
        <span className="meta">Basta con confirmar tu correo y aceptar recibir avisos compatibles. Puedes pausarlas cuando quieras.</span>
      </span>
    );
  }
  async function save() {
    if (!consent) return;
    setState("pending");
    const response = await fetch("/api/alertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, filters }),
    });
    if (response.ok) {
      setState("ok");
      setMessage("Alerta guardada. Te avisaremos por correo cuando aparezca algo que calce.");
    } else {
      setState("error");
      setMessage(await errorOf(response, "No se pudo guardar la alerta."));
    }
  }
  return (
    <span className="save-search">
      <label className="f chk alert-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        Acepto recibir alertas de avisos compatibles; puedo pausarlas cuando quiera.
      </label>
      <span className="row">
        <button className="btn sec sm" type="button" onClick={save} disabled={!hasFilter || !consent || state === "pending" || state === "ok"} title={!hasFilter ? "Elige al menos un filtro" : !consent ? "Confirma que aceptas las alertas" : ""}>
          🔔 {state === "ok" ? "Alerta guardada" : "Guardar alerta por correo"}
        </button>
        {!hasFilter ? <span className="meta">Elige región, ciudad o equipo para crear una alerta.</span> : null}
        {message ? <span className={state === "error" ? "err" : "okmsg"}>{message}</span> : null}
      </span>
    </span>
  );
}

type Alert = { id: string; label: string; kind: string };

export function AlertsPanel({ alerts, enabled }: { alerts: Alert[]; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch("/api/alertas/estado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) });
    setBusy(false);
    router.refresh();
  }
  async function remove(id: string) {
    await fetch(`/api/alertas/${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <section className="card" id="alertas" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>🔔 Alertas por correo</h3>
        <button className="btn sec sm" type="button" onClick={toggle} disabled={busy}>
          {enabled ? "Pausar todas las alertas" : "Activar alertas"}
        </button>
      </div>
      <p className="meta">
        {enabled
          ? "Activas. Te avisamos cuando se publica algo que calza con tus cargas, tus camiones o tus búsquedas guardadas (máximo 6 correos al día)."
          : "Pausadas. No recibirás correos de cargas o camiones que calzan."}
      </p>
      {alerts.length === 0 ? (
        <p className="meta">
          No tienes búsquedas guardadas. En <Link href="/cargas">Cargas</Link> o <Link href="/camiones">Camiones</Link> elige filtros y pulsa “Avisarme por correo”.
        </p>
      ) : (
        <ul className="alert-list">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <span>{alert.label}</span>
              <button className="linkish" type="button" onClick={() => remove(alert.id)}>
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
