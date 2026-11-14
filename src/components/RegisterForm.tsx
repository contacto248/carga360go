"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatRut, isValidRut } from "@/lib/format";
import { PlacePicker } from "./PlacePicker";
import { ResendVerification } from "./ResendVerification";

export function RegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState("transportista");
  const [razonSocial, setRazonSocial] = useState("");
  const [rut, setRut] = useState("");
  const [rutTouched, setRutTouched] = useState(false);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [whatsapp, setWhatsapp] = useState("+56 9 ");
  const [city, setCity] = useState("Santiago");
  const [backupContact, setBackupContact] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [pending, setPending] = useState(false);
  const [website, setWebsite] = useState("");
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const startedAt = useRef(Date.now());
  const rutOk = isValidRut(rut);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!rutOk) return setError("El RUT no es válido (revisa el dígito verificador).");
    if (password !== password2) return setError("Las contraseñas no coinciden.");
    if (password.length < 10) return setError("La contraseña debe tener al menos 10 caracteres.");
    if (!acceptPrivacy) return setError("Para crear tu cuenta debes leer y aceptar la Política de Privacidad.");
    if (!acceptTerms) return setError("Para crear tu cuenta debes leer y aceptar los Términos de uso.");
    if (!backupContact.trim()) return setError("Indica un teléfono o correo de respaldo.");
    setPending(true);
    setError("");
    setErrorCode("");
    const response = await fetch("/api/auth/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, razonSocial, rut, contactName, email, password, whatsapp, city, backupContact, website, formStartedAt: startedAt.current, acceptPrivacy, acceptTerms }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      setError(body?.error || "No se pudo crear la cuenta.");
      setErrorCode(body?.code || "");
      return;
    }
    router.push(role === "transportista" ? "/cuenta-en-revision" : "/panel?ok=perfil");
    router.refresh();
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="hp" aria-hidden="true">
        <label>
          Sitio web (no completar)
          <input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(event) => setWebsite(event.target.value)} />
        </label>
      </div>
      <div className="form-grid">
        <label className="f full">
          Tipo de cuenta
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="transportista">Transportista (tengo camiones)</option>
            <option value="mandante">Mandante / empresa con carga (necesito transporte)</option>
          </select>
        </label>
        <label className="f">
          Razón social / nombre *
          <input value={razonSocial} onChange={(event) => setRazonSocial(event.target.value)} required />
        </label>
        <label className="f">
          RUT *
          <input
            value={rut}
            onChange={(event) => setRut(event.target.value)}
            onBlur={() => {
              setRutTouched(true);
              if (isValidRut(rut)) setRut(formatRut(rut));
            }}
            placeholder="12.345.678-5"
            required
          />
          {rutTouched && rut ? (
            rutOk ? (
              <span className="okmsg">✓ RUT válido</span>
            ) : (
              <span className="err">RUT inválido: revisa el dígito verificador</span>
            )
          ) : null}
        </label>
        <label className="f">
          Nombre de contacto *
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} required />
        </label>
        <label className="f">
          Correo *
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="f">
          Contraseña * (mínimo 10 caracteres)
          <input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <label className="f">
          Repite la contraseña *
          <input type="password" autoComplete="new-password" minLength={10} value={password2} onChange={(event) => setPassword2(event.target.value)} required />
        </label>
        <label className="f">
          WhatsApp *
          <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} inputMode="tel" required />
        </label>
        <label className="f">
          Teléfono o correo de respaldo *
          <input
            name="backupContact"
            value={backupContact}
            onChange={(event) => setBackupContact(event.target.value)}
            placeholder="+56 9 XXXX XXXX o correo@ejemplo.cl"
            required
          />
          <span className="meta">Distinto de tu correo y WhatsApp. Lo usamos solo si no alcanzas a terminar tu verificación.</span>
        </label>
        <PlacePicker label="tu base" value={city} onChange={setCity} />
        <div className="full privacy-accept">
          <p className="meta" style={{ margin: "0 0 6px" }}>
            Antes de crear tu cuenta, lee cómo tratamos tus datos (quién los ve, para qué y cómo ejercer tus derechos) y las condiciones de uso.
          </p>
          <label className="f chk">
            <input
              type="checkbox"
              name="acceptPrivacy"
              checked={acceptPrivacy}
              onChange={(event) => setAcceptPrivacy(event.target.checked)}
              required
            />
            <span>
              He leído y acepto la{" "}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer">
                Política de Privacidad
              </a>{" "}
              *
            </span>
          </label>
          <label className="f chk">
            <input type="checkbox" name="acceptTerms" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} required />
            <span>
              He leído y acepto los{" "}
              <a href="/terminos" target="_blank" rel="noopener noreferrer">
                Términos de uso
              </a>{" "}
              (incluye la campaña de 30 días gratis desde la inscripción y la futura membresía) *
            </span>
          </label>
        </div>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {errorCode === "email_pendiente" ? <ResendVerification email={email} /> : null}
      {errorCode === "email_pendiente" || errorCode === "email_registrado" || errorCode === "rut_registrado" ? (
        <p className="meta">
          <Link href="/ingreso">Ingresar</Link> · <Link href="/recuperar">Olvidé mi contraseña</Link>
        </p>
      ) : null}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}
