"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { WEB_GREETING } from "@/lib/whatsapp/intents";

type ChatMsg = { id: string; role: "user" | "assistant"; text: string; at: string };
type Contacts = { whatsapp: string; whatsappUrl: string; email: string };

const QUICK: { label: string; message: string }[] = [
  { label: "Soy empresa con carga", message: "Soy empresa con carga" },
  { label: "Soy transportista", message: "Soy transportista" },
  { label: "Costo del flete", message: "¿Cuánto cuesta un flete?" },
  { label: "Hablar con una persona", message: "Quiero hablar con una persona" },
];

const GREETING: ChatMsg = { id: "greeting", role: "assistant", text: WEB_GREETING, at: "" };

function useBassamDock() {
  const [flags, setFlags] = useState({ hide: false, bassam: false });
  useEffect(() => {
    const sync = () => {
      const path = window.location.pathname;
      const bassam = path === "/admin/bassam" || path.startsWith("/admin/bassam/");
      setFlags({ hide: path.startsWith("/admin") && !bassam, bassam });
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return flags;
}

export function HelpLauncher({ chatEnabled, waHref }: { chatEnabled: boolean; waHref: string }) {
  const [open, setOpen] = useState(false);
  const { hide, bassam } = useBassamDock();

  if (hide) return null;

  if (!chatEnabled) {
    if (!bassam) {
      return (
        <a className="btn wa fab" href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp">
          💬 WhatsApp
        </a>
      );
    }
    return (
      <div className={`help-dock${open ? " is-open" : ""}`}>
        <button type="button" className="help-fab help-exec" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="c360-chat-panel">
          Asistente IA ejecutivo
        </button>
        {open ? (
          <section id="c360-chat-panel" className="chat-panel" role="dialog" aria-modal="true" aria-labelledby="c360-exec-off">
            <header className="chat-head">
              <div>
                <h2 id="c360-exec-off">Asistente IA ejecutivo</h2>
                <p>Usa el chat que ya existe en esta página. Ahora está apagado: no hay otro proveedor ni otra clave.</p>
              </div>
              <button type="button" className="chat-x" onClick={() => setOpen(false)} aria-label="Cerrar el chat">
                ✕
              </button>
            </header>
            <p className="chat-note">sin datos de un asistente distinto.</p>
          </section>
        ) : (
          <a className="btn wa fab help-wa" href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp">
            💬 WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`help-dock${open ? " is-open" : ""}`}>
      {bassam ? (
        <button type="button" className="help-fab help-exec" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="c360-chat-panel">
          Asistente IA ejecutivo
        </button>
      ) : null}
      {open ? <ChatPanel waHref={waHref} onClose={() => setOpen(false)} executive={bassam} /> : null}
      {!open ? (
        <div className="help-stack">
          <a className="btn wa fab help-wa" href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp">
            💬 WhatsApp
          </a>
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

function ChatPanel({ waHref, onClose, executive = false }: { waHref: string; onClose: () => void; executive?: boolean }) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState(false);

  const scrollToEnd = useCallback(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/chat", { credentials: "same-origin" });
        const data = (await response.json().catch(() => null)) as { messages?: ChatMsg[]; contacts?: Contacts } | null;
        if (cancelled || !data) return;
        if (data.contacts) setContacts(data.contacts);
        if (data.messages && data.messages.length) setMessages(data.messages);
      } catch {
        // El saludo local basta si falla la red.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
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
        body: JSON.stringify(executive ? { message, executive: true } : { message }),
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
          <h2 id={titleId}>{executive ? "Asistente IA ejecutivo" : "Carga 360 Go"}</h2>
          <p>{executive ? "Mismo asistente de este chat. Sin otro proveedor ni otra clave." : "Asistente virtual · español de Chile"}</p>
        </div>
        <a className="chat-wa-mini" href={waHref} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
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
            <a className="btn wa sm" href={contacts.whatsappUrl} target="_blank" rel="noopener noreferrer">
              WhatsApp {contacts.whatsapp}
            </a>
            <a className="btn sec sm" href={`mailto:${contacts.email}`}>
              {contacts.email}
            </a>
          </div>
        ) : null}
        {busy ? <div className="chat-bubble from-bot is-wait">Escribiendo…</div> : null}
        {error ? <div className="chat-error">{error}</div> : null}
      </div>
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
      <p className="chat-note">Asistente automático. No aprueba documentos ni gestiona pagos.</p>
    </section>
  );
}
