"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";

type Msg = { id: string; role: "user" | "assistant"; text: string };

export function AgenteAcreditacion() {
  const pathname = usePathname();
  const onBassam = pathname === "/admin/bassam" || pathname.startsWith("/admin/bassam/");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ id: "hola", role: "assistant", text: "Puedo revisar los documentos guardados en carga360go.cl y en /admin/bassam. Si no hay registros, digo Sin datos." }]);
  if (pathname.startsWith("/admin") && !onBassam) return null;

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setText("");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: message }]);
    try {
      const response = await fetch("/api/bassam/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: data?.reply || data?.error || "sin datos" }]);
    } catch {
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: "sin datos" }]);
    }
    setBusy(false);
  }

  return (
    <div className="agente-acred">
      {open ? (
        <section className="chat-panel" role="dialog" aria-label="Agente de acreditación">
          <header className="chat-head">
            <div>
              <h2>Agente de acreditación</h2>
              <p>Sobre el asistente. Lee los documentos guardados.</p>
            </div>
            <button type="button" className="chat-x" onClick={() => setOpen(false)} aria-label="Cerrar el agente">
              ✕
            </button>
          </header>
          <div className="chat-log">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble ${msg.role === "user" ? "from-me" : "from-bot"}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={send}>
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={1} placeholder="Pregunte por los documentos…" />
            <button type="submit" className="btn sm" disabled={busy || !text.trim()}>
              Enviar
            </button>
          </form>
        </section>
      ) : null}
      <button type="button" className="help-fab help-exec" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Agente
      </button>
    </div>
  );
}
