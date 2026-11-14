"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  emailChannel: boolean;
  phoneChannel: boolean;
  phoneCodeActive: boolean;
  /** inbound = la persona envía el código al WhatsApp de Carga360go (gratis). */
  phoneMode?: "inbound" | "outbound" | "none";
};

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as {
    error?: string;
    sent?: boolean;
    delivery?: string;
    waLink?: string;
    prefilledText?: string;
    businessPhone?: string;
    verified?: boolean;
  } | null;
  return { ok: response.ok, data };
}

export function ContactVerify(props: Props) {
  const router = useRouter();
  const mode = props.phoneMode ?? (props.phoneChannel ? "outbound" : "none");
  const inbound = mode === "inbound";
  const [emailMsg, setEmailMsg] = useState("");
  const [phoneMsg, setPhoneMsg] = useState("");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState("");
  const [codeBox, setCodeBox] = useState(props.phoneCodeActive && !inbound);
  const [waLink, setWaLink] = useState("");
  const [checking, setChecking] = useState(false);

  async function sendEmail() {
    setPending("email");
    setError("");
    const { ok, data } = await post("/api/verificacion/correo");
    setPending("");
    if (!ok) return setError(data?.error || "No se pudo enviar el correo.");
    setEmailMsg(
      data?.sent
        ? `Te enviamos un enlace a ${props.email}. Revisa también la carpeta de spam.`
        : "Verificación de correo pendiente: te contactaremos para confirmarlo.",
    );
  }

  async function sendPhone() {
    setPending("phone");
    setError("");
    const { ok, data } = await post("/api/verificacion/telefono");
    setPending("");
    if (!ok) return setError(data?.error || "No se pudo enviar el código.");
    if (inbound && data?.waLink) {
      setWaLink(data.waLink);
      setPhoneMsg(
        `Abre WhatsApp y envía el mensaje preparado al ${data.businessPhone || "WhatsApp de Carga360go"} desde el número ${props.phone}. El código vence en 10 minutos.`,
      );
      return;
    }
    setCodeBox(true);
    setPhoneMsg(
      data?.sent
        ? `Te enviamos un código de 6 dígitos al ${props.phone}. Vence en 10 minutos.`
        : "Verificación de teléfono pendiente: te contactaremos. Si te damos un código, ingrésalo aquí.",
    );
  }

  async function confirmPhone(event: React.FormEvent) {
    event.preventDefault();
    setPending("code");
    setError("");
    const { ok, data } = await post("/api/verificacion/telefono/confirmar", { code });
    setPending("");
    if (!ok) return setError(data?.error || "No se pudo confirmar el código.");
    setPhoneMsg("✓ Teléfono verificado.");
    router.refresh();
  }

  async function refreshInbound() {
    setChecking(true);
    setError("");
    const response = await fetch("/api/verificacion/telefono", { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { verified?: boolean; error?: string } | null;
    setChecking(false);
    if (!response.ok) return setError(data?.error || "No se pudo revisar el estado.");
    if (data?.verified) {
      setPhoneMsg("✓ Teléfono verificado.");
      router.refresh();
      return;
    }
    setPhoneMsg("Aún no recibimos el mensaje. Envíalo desde el número que registraste y vuelve a pulsar «Ya lo envié».");
  }

  return (
    <div className="grid c2">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Correo</h3>
          {props.emailVerified ? <span className="pill ok">Verificado</span> : <span className="pill warn">Pendiente</span>}
        </div>
        <p className="meta">{props.email}</p>
        {props.emailVerified ? null : props.emailChannel ? (
          <>
            <p className="meta">Abre el enlace que te enviamos al registrarte. Si no te llegó, pide otro.</p>
            <button className="btn sec sm" type="button" disabled={pending === "email"} onClick={sendEmail}>
              {pending === "email" ? "Enviando…" : "Reenviar correo de verificación"}
            </button>
          </>
        ) : (
          <p className="notice">Verificación de correo pendiente: te contactaremos para confirmarlo.</p>
        )}
        {emailMsg ? <p className="okmsg">{emailMsg}</p> : null}
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Teléfono / WhatsApp</h3>
          {props.phoneVerified ? <span className="pill ok">Verificado</span> : <span className="pill warn">Pendiente</span>}
        </div>
        <p className="meta">{props.phone}</p>
        {props.phoneVerified ? null : inbound ? (
          <>
            <p className="meta">
              Para confirmar tu número, te daremos un mensaje listo para enviar por WhatsApp al número de Carga360go. Debe salir desde{" "}
              {props.phone}. No te llega un código: lo envías tú. Vence en 10 minutos.
            </p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sec sm" type="button" disabled={pending === "phone"} onClick={sendPhone}>
                {pending === "phone" ? "Preparando…" : waLink ? "Pedir otro mensaje" : "Preparar mensaje de WhatsApp"}
              </button>
            </div>
            {waLink ? (
              <div className="row" style={{ marginTop: 10 }}>
                <a className="btn sm" href={waLink} target="_blank" rel="noopener noreferrer">
                  Abrir WhatsApp y enviar
                </a>
                <button className="btn sec sm" type="button" disabled={checking} onClick={refreshInbound}>
                  {checking ? "Revisando…" : "Ya lo envié"}
                </button>
              </div>
            ) : props.phoneCodeActive ? (
              <p className="meta">Ya tienes un mensaje vigente. Si no te quedó el enlace, espera un minuto y pide otro.</p>
            ) : null}
          </>
        ) : (
          <>
            {props.phoneChannel ? (
              <p className="meta">Te enviaremos un código de 6 dígitos para confirmar tu número.</p>
            ) : (
              <p className="notice">Verificación de teléfono pendiente: te contactaremos para confirmarlo.</p>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sec sm" type="button" disabled={pending === "phone"} onClick={sendPhone}>
                {pending === "phone" ? "Enviando…" : props.phoneChannel ? "Enviar código" : "Solicitar verificación"}
              </button>
            </div>
            {codeBox ? (
              <form className="row" style={{ marginTop: 10 }} onSubmit={confirmPhone}>
                <input
                  aria-label="Código de 6 dígitos"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="Código de 6 dígitos"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  style={{ maxWidth: 200 }}
                  required
                />
                <button className="btn sm" type="submit" disabled={pending === "code" || code.length !== 6}>
                  {pending === "code" ? "Confirmando…" : "Confirmar"}
                </button>
              </form>
            ) : null}
          </>
        )}
        {phoneMsg ? <p className="okmsg">{phoneMsg}</p> : null}
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
