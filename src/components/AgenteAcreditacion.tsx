"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ENLACE_MI_CUENTA, LISTA_MANDANTE, LISTA_TRANSPORTISTA, SIN_DATOS } from "@/lib/bassam/agente-copia";
import { DOCUMENTOS_POR_CLIENTE, type TipoCliente } from "@/lib/bassam/tipos-cliente";

type Msg = { id: string; role: "user" | "assistant"; text: string };
type Modo = "flotante" | "conversacion";

function rolDeQuery(value: string | null): TipoCliente | null {
  if (value === "transportista" || value === "mandante") return value;
  return null;
}

export function agenteVisible(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/mi-cuenta" || pathname.startsWith("/mi-cuenta/");
}

/** En Administración la conversación no ofrece elegir perfil. En Mi cuenta esas opciones siguen. */
export function selectorRolVisible(pathname: string | null): boolean {
  if (!pathname) return true;
  return !(pathname === "/admin" || pathname.startsWith("/admin/"));
}

/** Quita la instrucción de elegir perfil. El texto público de Mi cuenta no pasa por aquí. */
export function textoConversacionAdmin(text: string): string {
  const limpio = text.replace(/Elige Transportista o Mandante con carga\.?/gi, "").replace(/[ \t]{2,}/g, " ").trim();
  return limpio || "Sin datos.";
}

export function AgenteAcreditacion({ modo = "flotante" }: { modo?: Modo }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const rol = rolDeQuery(params.get("rol"));
  const limpio = modo === "conversacion" || !selectorRolVisible(pathname);
  const [open, setOpen] = useState(modo === "conversacion");
  useEffect(() => {
    if (modo === "conversacion") return;
    const abrir = () => setOpen(true);
    window.addEventListener("c360-abrir-agente", abrir);
    return () => window.removeEventListener("c360-abrir-agente", abrir);
  }, [modo]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      id: "hola",
      role: "assistant",
      text: limpio
        ? "Soy el asistente de administración. Escribe tu consulta sobre documentos o el estado de una cuenta."
        : `Puedo revisar los documentos guardados en carga360go.cl y en /admin/bassam. Si no hay registros, digo ${SIN_DATOS}`,
    },
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
        body: JSON.stringify({ message, rol: limpio ? null : rol }),
      });
      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      const reply = data?.reply || data?.error || SIN_DATOS;
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: limpio ? textoConversacionAdmin(reply) : reply }]);
    } catch {
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: limpio ? "Sin datos." : SIN_DATOS }]);
    }
    setBusy(false);
  }

  if (modo !== "conversacion" && !agenteVisible(pathname)) return null;

  function send(event: FormEvent) {
    event.preventDefault();
    void ask(text.trim());
  }

  const abierto = modo === "conversacion" || open;

  return (
    <div className={modo === "conversacion" ? "agente-embed" : "agente-acred"} id={modo === "conversacion" ? "agente-bassam-panel" : "agente-bassam"}>
      {abierto ? (
        <section className="chat-panel" role={modo === "conversacion" ? "region" : "dialog"} aria-label={limpio ? "Conversación con el agente" : "Agente de acreditación"}>
          <header className="chat-head">
            <div>
              <h2>{limpio ? "Agente BASSAM 360" : "Agente de acreditación"}</h2>
              <p>{limpio ? "Conversación directa. No aprueba ni rechaza solo." : "Sobre el asistente. Lee los documentos guardados."}</p>
            </div>
            {modo === "conversacion" ? null : (
              <button type="button" className="chat-x" onClick={() => setOpen(false)} aria-label="Cerrar el agente">
                ✕
              </button>
            )}
          </header>
          <div className="chat-log" aria-live="polite" aria-relevant="additions">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble ${msg.role === "user" ? "from-me" : "from-bot"}`}>
                {msg.text}
              </div>
            ))}
          </div>
          {limpio ? null : (
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
          )}
          <form className="chat-form" onSubmit={send}>
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={1} aria-label="Mensaje para el agente" placeholder={limpio ? "Escribe tu consulta…" : "Pregunte por los documentos…"} />
            <button type="submit" className="btn sm" disabled={busy || !text.trim()}>
              {busy ? "Enviando…" : "Enviar"}
            </button>
          </form>
        </section>
      ) : null}
      {modo === "conversacion" ? null : (
        <button type="button" className="help-fab help-exec" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          Agente BASSAM 360
        </button>
      )}
    </div>
  );
}
