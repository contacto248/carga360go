"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { parseVisitorContact, whatsappContactHref } from "@/lib/format";

type KnownContact = { name: string; phone: string };

export function WhatsAppContactGate({
  number,
  text,
  className,
  children,
  known,
  label = "Escribir por WhatsApp",
}: {
  number: string;
  text: string;
  className?: string;
  children: ReactNode;
  known?: KnownContact | null;
  label?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  function openChat(visitorName: string, visitorPhone: string) {
    const href = whatsappContactHref(number, text, visitorName, visitorPhone);
    if (!href) {
      setError("Indique su nombre y un celular chileno (+56 9 XXXX XXXX).");
      setOpen(true);
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function onClick() {
    if (known && whatsappContactHref(number, text, known.name, known.phone)) {
      openChat(known.name, known.phone);
      return;
    }
    setError("");
    setOpen(true);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseVisitorContact(name, phone);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    setOpen(false);
    openChat(parsed.name, parsed.phone);
  }

  return (
    <>
      <button type="button" className={className} onClick={onClick}>
        {children}
      </button>
      {open ? (
        <div className="wa-gate" role="presentation" onClick={() => setOpen(false)}>
          <form
            className="wa-gate-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
            onSubmit={onSubmit}
          >
            <h2 id={titleId}>Antes de abrir WhatsApp</h2>
            <p>
              Indique su nombre y celular. El mensaje queda preparado; usted lo envía dentro de WhatsApp. No guardamos estos
              datos desde este formulario.
            </p>
            <label>
              Nombre
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} required />
            </label>
            <label>
              Celular
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="+56 9 XXXX XXXX"
                required
              />
            </label>
            {error ? <p className="wa-gate-error">{error}</p> : null}
            <div className="row">
              <button type="submit" className="btn wa sm">
                {label}
              </button>
              <button type="button" className="btn sec sm" onClick={() => setOpen(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
