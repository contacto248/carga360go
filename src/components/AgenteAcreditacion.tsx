"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ENLACE_MI_CUENTA, LISTA_MANDANTE, LISTA_TRANSPORTISTA, SIN_DATOS } from "@/lib/bassam/agente-copia";
import { DOCUMENTOS_POR_CLIENTE, type TipoCliente } from "@/lib/bassam/tipos-cliente";

type Msg = { id: string; role: "user" | "assistant"; text: string };

function rolDeQuery(value: string | null): TipoCliente | null {
  if (value === "transportista" || value === "mandante") return value;
  return null;
}

export function agenteVisible(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function AgenteAcreditacion() {
  const params = useSearchParams();
  const pathname = usePathname();
  const rol = rolDeQuery(params.get("rol"));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener("c360-abrir-agente", abrir);
    return () => window.removeEventListener("c360-abrir-agente", abrir);
  }, []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { id: "hola", role: "assistant", text: `Puedo revisar los documentos guardados en carga360go.cl y en /admin/bassam. Si no hay registros, digo ${SIN_DATOS}` },
  ]);
  async function ask(message: string) {
    if (!message || busy) return;
    setBusy(true);
    setText("");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: message }]);
    try {
      const response = await fetch("/api/bassam/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, rol }),
      });
      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: data?.reply || data?.error || SIN_DATOS }]);
    } catch {
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: SIN_DATOS }]);
    }
    setBusy(false);
  }

  // En /mi-cuenta y en el sitio público queda un solo flotante: Asistente ÓRBITA.
  // Este panel de documentos solo aparece en /admin.
  if (!agenteVisible(pathname)) return null;

  function send(event: FormEvent) {
    event.preventDefault();
    void ask(text.trim());
  }

  return (
    <div className="agente-acred" id="agente-bassam">
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
          <div className="chat-quick">
            {rol ? (
              <>
                <a className="chat-chip" href={`${ENLACE_MI_CUENTA}?rol=${rol}`}>
                  Subir documentos en /mi-cuenta
                </a>
                {DOCUMENTOS_POR_CLIENTE[rol].map((item) => (
                  <button key={item.id} type="button" className="chat-chip" disabled={busy} onClick={() => void ask(rol === "mandante" ? `Soy mandante ${item.label}` : `Soy transportista ${item.label}`)}>
                    {item.label}
                  </button>
                ))}
                <p>{rol === "mandante" ? LISTA_MANDANTE : LISTA_TRANSPORTISTA}</p>
              </>
            ) : (
              <>
                <a className="chat-chip" href="/mi-cuenta?rol=transportista">
                  Soy transportista
                </a>
                <a className="chat-chip" href="/mi-cuenta?rol=mandante">
                  Soy mandante
                </a>
              </>
            )}
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
        Agente de acreditación
      </button>
    </div>
  );
}
