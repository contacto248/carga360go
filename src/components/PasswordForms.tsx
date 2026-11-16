"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PASSWORD_MIN } from "@/lib/security";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [devLink, setDevLink] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/recuperar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "No se pudo enviar el enlace.");
      return;
    }
    const body = (await response.json()) as { devLink?: string };
    setDone("Si el correo está registrado, enviamos el enlace. Revisa la bandeja de entrada y el correo no deseado. El mensaje sale de Carga360go.");
    setDevLink(body.devLink || "");
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <label className="f">
        Correo de la cuenta *
        <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {done ? <p className="okmsg">{done}</p> : null}
      {devLink ? (
        <p className="notice" style={{ marginTop: 12 }}>
          Entorno sin SMTP: <a href={devLink}>abrir enlace de restablecimiento</a>
        </p>
      ) : null}
      <p className="meta">No indicamos si el correo existe, para no revelar cuentas.</p>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar enlace"}
        </button>
        <Link href="/ingreso">Ingresar</Link>
      </div>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== password2) return setError("Las contraseñas no coinciden.");
    if (password.length < PASSWORD_MIN) return setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/restablecer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "No se pudo restablecer la contraseña.");
      return;
    }
    router.push("/ingreso?ok=clave");
    router.refresh();
  }

  if (!token) {
    return (
      <div className="card">
        <p>Falta el enlace de restablecimiento. Pide uno nuevo desde recuperar contraseña.</p>
        <Link className="btn" href="/recuperar">
          Pedir enlace
        </Link>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="form-grid">
        <label className="f">
          Nueva contraseña *
          <input type="password" autoComplete="new-password" minLength={PASSWORD_MIN} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <label className="f">
          Repite la contraseña *
          <input type="password" autoComplete="new-password" minLength={PASSWORD_MIN} value={password2} onChange={(event) => setPassword2(event.target.value)} required />
        </label>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar contraseña"}
        </button>
      </div>
    </form>
  );
}
