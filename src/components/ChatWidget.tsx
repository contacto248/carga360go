"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { WhatsAppContactGate } from "@/components/WhatsAppContactGate";
import { parseVisitorContact } from "@/lib/format";
import { WEB_GREETING } from "@/lib/whatsapp/intents";

type ChatMsg = { id: string; role: "user" | "assistant"; text: string; at: string };
type Contacts = { whatsapp: string; whatsappUrl: string; email: string };
type Visitor = { name: string; phone: string };

const QUICK: { label: string; message: string }[] = [
  { label: "Soy empresa con carga", message: "Soy empresa con carga" },
  { label: "Soy transportista", message: "Soy transportista" },
  { label: "Costo del flete", message: "¿Cuánto cuesta un flete?" },
  { label: "Hablar con una persona", message: "Quiero hablar con una persona" },
];

const GREETING: ChatMsg = { id: "greeting", role: "assistant", text: WEB_GREETING, at: "" };

export function HelpLauncher({ chatEnabled, waNumber, waText }: { chatEnabled: boolean; waNumber: string; waText: string }) {
  const [open, setOpen] = useState(false);
  const [hiddenOnAdmin, setHiddenOnAdmin] = useState(false);
  const [visitor, setVisitor] = useState<Visitor | null>(null);

  useEffect(() => {
    const sync = () => setHiddenOnAdmin(window.location.pathname.startsWith("/admin"));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    if (!chatEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/chat", { credentials: "same-origin" });
        const data = (await response.json().catch(() => null)) as { visitor?: Visitor | null } | null;
        if (!cancelled && data?.visitor?.name && data.visitor.phone) setVisitor(data.visitor);
      } catch {
        // Sin contacto guardado, el botón pide los datos.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatEnabled]);

  if (hiddenOnAdmin) return null;

  const whatsapp = (
    <WhatsAppContactGate number={waNumber} text={waText} className="btn wa fab help-wa" known={visitor}>
      💬 WhatsApp
    </WhatsAppContactGate>
  );

  if (!chatEnabled) return whatsapp;

  return (
    <div className={`help-dock${open ? " is-open" : ""}`}>
      {open ? <ChatPanel waNumber={waNumber} waText={waText} known={visitor} onVisitor={setVisitor} onClose={() => setOpen(false)} /> : null}
      {!open ? (
        <div className="help-stack">
          {whatsapp}
          <button type="button" className="help-fab" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="c360-chat-panel">
            <span aria-hidden="true">💬</span>
            <span>Ayuda</span>
          </button>
        </div>
      ) : (
        <button type="button" className="help-fab is-close" onClick={() => setOpen(false)} aria-expanded={true} aria-controls="c360-chat-panel" aria-label="Cerrar el chat">
          ✕
        </button>
      )}
    </div>
  );
}

function ChatPanel({
  waNumber,
  waText,
  known,
  onVisitor,
  onClose,
}: {
  waNumber: string;
  waText: string;
  known: Visitor | null;
  onVisitor: (visitor: Visitor) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState(false);
  const [visitor, setVisitor] = useState<Visitor | null>(known);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const scrollToEnd = useCallback(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/chat", { credentials: "same-origin" });
        const data = (await response.json().catch(() => null)) as { messages?: ChatMsg[]; contacts?: Contacts; visitor?: Visitor | null } | null;
        if (cancelled || !data) return;
        if (data.contacts) setContacts(data.contacts);
        if (data.visitor?.name && data.visitor.phone) {
          setVisitor(data.visitor);
          onVisitor(data.visitor);
        }
        if (data.messages && data.messages.length) setMessages(data.messages);
      } catch {
        // El saludo local basta si falla la red.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onVisitor]);

  useEffect(() => {
    scrollToEnd();
  }, [messages, handoff, scrollToEnd]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseVisitorContact(contactName, contactPhone);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: { name: parsed.name, phone: parsed.phone } }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; visitor?: Visitor | null } | null;
      if (!response.ok || !data?.visitor) {
        setError(data?.error || "No se pudo guardar el contacto.");
        setBusy(false);
        return;
      }
      setVisitor(data.visitor);
      onVisitor(data.visitor);
    } catch {
      setError("No hay conexión. Inténtelo de nuevo o escríbanos a contacto@carga360go.cl.");
    }
    setBusy(false);
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy || !visitor) return;
    setError("");
    setBusy(true);
    const optimistic: ChatMsg = { id: `local-${Date.now()}`, role: "user", text: message, at: new Date().toISOString() };
    setMessages((prev) => [...prev.filter((m) => m.id !== "greeting" || prev.length > 1), optimistic]);
    setText("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; reply?: string; handoff?: boolean; messages?: ChatMsg[]; contacts?: Contacts }
        | null;
      if (!response.ok) {
        setError(data?.error || "No se pudo enviar el mensaje.");
        setBusy(false);
        return;
      }
      if (data?.contacts) setContacts(data.contacts);
      if (data?.handoff) setHandoff(true);
      if (data?.messages && data.messages.length) setMessages(data.messages);
      else if (data?.reply) {
        setMessages((prev) => [...prev, { id: `bot-${Date.now()}`, role: "assistant", text: data.reply!, at: new Date().toISOString() }]);
      }
    } catch {
      setError("No hay conexión. Inténtelo de nuevo o escríbanos a contacto@carga360go.cl.");
    }
    setBusy(false);
  }

  return (
    <section id="c360-chat-panel" className="chat-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="chat-head">
        <div>
          <h2 id={titleId}>Carga 360 Go</h2>
          <p>Asistente virtual · español de Chile</p>
        </div>
        <WhatsAppContactGate number={waNumber} text={waText} className="chat-wa-mini" known={visitor} label="Abrir WhatsApp">
          WhatsApp
        </WhatsAppContactGate>
        <button type="button" className="chat-x" onClick={onClose} aria-label="Cerrar el chat">
          ✕
        </button>
      </header>
      <div className="chat-log" ref={listRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble ${msg.role === "user" ? "from-me" : "from-bot"}`}>
            {msg.text}
          </div>
        ))}
        {handoff && contacts ? (
          <div className="chat-contacts">
            <p>También puede escribirnos ahora:</p>
            <WhatsAppContactGate number={waNumber} text={waText} className="btn wa sm" known={visitor}>
              WhatsApp {contacts.whatsapp}
            </WhatsAppContactGate>
            <a className="btn sec sm" href={`mailto:${contacts.email}`}>
              {contacts.email}
            </a>
          </div>
        ) : null}
        {busy ? <div className="chat-bubble from-bot is-wait">Escribiendo…</div> : null}
        {error ? <div className="chat-error">{error}</div> : null}
      </div>
      {!visitor ? (
        <form className="chat-form wa-gate-inline" onSubmit={saveContact}>
          <label>
            Nombre
            <input value={contactName} onChange={(event) => setContactName(event.target.value)} autoComplete="name" maxLength={120} required />
          </label>
          <label>
            Celular
            <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="+56 9 XXXX XXXX" required />
          </label>
          <button type="submit" className="btn sm" disabled={busy}>
            Continuar
          </button>
        </form>
      ) : (
        <>
      {!handoff ? (
        <div className="chat-quick" role="group" aria-label="Consultas frecuentes">
          {QUICK.map((item) => (
            <button key={item.label} type="button" className="chat-chip" disabled={busy} onClick={() => send(item.message)}>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <label className="sr-only" htmlFor="c360-chat-input">
          Escriba su consulta
        </label>
        <textarea
          id="c360-chat-input"
          ref={inputRef}
          rows={1}
          maxLength={1000}
          value={text}
          disabled={busy}
          placeholder="Escriba su consulta…"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(text);
            }
          }}
        />
        <button type="submit" className="btn sm" disabled={busy || !text.trim()}>
          Enviar
        </button>
      </form>
        </>
      )}
      <p className="chat-note">Asistente automático. No aprueba documentos ni gestiona pagos. El chat pide su nombre y celular antes del primer mensaje.</p>
    </section>
  );
}
