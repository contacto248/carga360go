"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeNextPath } from "@/lib/format";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  // Segundo paso (solo administrador): código de 6 dígitos enviado al correo.
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [info, setInfo] = useState("");

  function done() {
    router.push(safeNextPath(nextPath));
    router.refresh();
  }

  async function sendPassword(event?: React.FormEvent) {
    event?.preventDefault();
    setPending(true);
    setError("");
    setInfo("");
    const response = await fetch("/api/auth/ingreso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string; twoFactor?: boolean; sentTo?: string } | null;
    if (!response.ok) return setError(body?.error || "No se pudo ingresar.");
    if (body?.twoFactor) {
      setSentTo(body.sentTo || "tu correo");
      setCode("");
      if (sentTo) setInfo("Te enviamos un código nuevo.");
      return;
    }
    done();
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setInfo("");
    const response = await fetch("/api/auth/ingreso/codigo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, trustDevice: trust }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (!response.ok) {
      if (body?.code === "codigo_vencido" || body?.code === "codigo_bloqueado") setSentTo("");
      return setError(body?.error || "No se pudo validar el código.");
    }
    done();
  }

  if (sentTo) {
    return (
      <form className="card" onSubmit={sendCode}>
        <h3 style={{ marginTop: 0 }}>Código de ingreso</h3>
        <p>
          Por seguridad, la cuenta administradora necesita un código. Te lo enviamos a <strong>{sentTo}</strong>. Vence en 10 minutos y tienes 5
          intentos.
        </p>
        <div className="form-grid">
          <label className="f">
            Código de 6 dígitos *
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              autoFocus
            />
          </label>
          <label className="f chk full">
            <input type="checkbox" name="trustDevice" checked={trust} onChange={(event) => setTrust(event.target.checked)} />
            Confiar en este dispositivo por 30 días (no lo marques en computadores compartidos)
          </label>
        </div>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        {info ? <p className="okmsg">{info}</p> : null}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" type="submit" disabled={pending || code.length !== 6}>
            {pending ? "Validando…" : "Validar código"}
          </button>
          <button className="btn sec" type="button" disabled={pending} onClick={() => sendPassword()}>
            Enviar otro código
          </button>
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              setSentTo("");
              setError("");
            }}
          >
            Volver
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="card" onSubmit={sendPassword}>
      <div className="form-grid">
        <label className="f">
          Correo *
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="f">
          Contraseña *
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Ingresando…" : "Ingresar"}
        </button>
        <Link href="/recuperar">Olvidé mi contraseña</Link>
        <Link href="/verificar-correo">¿No te llegó el correo de verificación?</Link>
      </div>
    </form>
  );
}
