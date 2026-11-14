"use client";

import { useState } from "react";

/** Botón "Reenviar correo de verificación". Con sesión usa la cuenta actual; sin sesión pide el correo. */
export function ResendVerification({ email: initial = "", loggedIn = false }: { email?: string; loggedIn?: boolean }) {
  const [email, setEmail] = useState(initial);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMsg("");
    const response = await fetch(loggedIn ? "/api/verificacion/correo" : "/api/verificacion/correo/reenviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loggedIn ? {} : { email }),
    });
    setPending(false);
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) return setError(data?.error || "No se pudo reenviar el correo.");
    setMsg(
      loggedIn
        ? `Te enviamos un enlace nuevo a ${initial}. Revisa también la carpeta de spam.`
        : "Si ese correo tiene una cuenta sin confirmar, le enviamos un enlace nuevo. Revisa también la carpeta de spam.",
    );
  }

  return (
    <form className="row" style={{ marginTop: 10, flexWrap: "wrap" }} onSubmit={onSubmit}>
      {loggedIn ? null : (
        <input
          type="email"
          aria-label="Correo de la cuenta"
          placeholder="tu@correo.cl"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={{ maxWidth: 280 }}
          required
        />
      )}
      <button className="btn sec sm" type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Reenviar correo de verificación"}
      </button>
      {msg ? <p className="okmsg" style={{ width: "100%" }}>{msg}</p> : null}
      {error ? (
        <p className="err" role="alert" style={{ width: "100%" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
