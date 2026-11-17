"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./agente-360go.module.css";

const STORAGE_KEY = "c360.agente360.historial";
const GREETING =
  "Soy el Agente 360go. Ayudo a operar cargas, camiones, retornos y la torre de control, de Arica a Punta Arenas. La conversación queda en este dispositivo.";

type Role = "user" | "assistant";
type Turn = { id: string; role: Role; text: string };

type InstallPrompt = Event & { prompt: () => Promise<void> };

function greeting(): Turn {
  return { id: "saludo", role: "assistant", text: GREETING };
}

function readStored(): Turn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const turns: Turn[] = [];
    for (const item of parsed.slice(-40)) {
      if (!item || typeof item !== "object") continue;
      const id = "id" in item && typeof item.id === "string" ? item.id : "";
      const role = "role" in item ? item.role : null;
      const text = "text" in item && typeof item.text === "string" ? item.text.trim() : "";
      if (!id || (role !== "user" && role !== "assistant") || !text) continue;
      turns.push({ id, role, text: text.slice(0, 4000) });
    }
    return turns;
  } catch {
    return [];
  }
}

function writeStored(turns: Turn[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-40)));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `t-${Date.now()}`;
}

export function Agente360goApp() {
  const titleId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const [turns, setTurns] = useState<Turn[]>([greeting()]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [install, setInstall] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const stored = readStored();
    if (stored.length) setTurns(stored);
    const ios = /iPhone|iPad/i.test(navigator.userAgent);
    const nav = navigator as Navigator & { standalone?: boolean };
    const installed = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (!installed && ios) setHint("En iPhone: Compartir y luego Agregar a inicio.");
    if (!installed && !ios) setHint("En Windows 11, instálelo desde Edge con el icono de la barra de direcciones.");
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/agente-360go/sw.js", { scope: "/agente-360go" }).catch(() => undefined);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns, busy]);

  function borrar() {
    localStorage.removeItem(STORAGE_KEY);
    setTurns([greeting()]);
  }

  async function enviar(event: { preventDefault(): void }) {
    event.preventDefault();
    const message = text.replace(/\s+/g, " ").trim();
    if (!message || busy) return;
    const history = turns
      .filter((turn) => turn.id !== "saludo")
      .slice(-12)
      .map((turn) => ({ role: turn.role, text: turn.text }));
    const next = [...turns, { id: newId(), role: "user" as const, text: message }];
    setTurns(next);
    setText("");
    setBusy(true);
    try {
      const response = await fetch("/api/agente-360go", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await response.json().catch(() => null)) as { reply?: unknown; error?: unknown } | null;
      const reply = data && typeof data.reply === "string" && data.reply.trim()
        ? data.reply.trim()
        : data && typeof data.error === "string" && data.error.trim()
          ? data.error.trim()
          : "No pude completar la consulta. Puede reenviarla.";
      const saved = [...next, { id: newId(), role: "assistant" as const, text: reply }];
      setTurns(saved);
      writeStored(saved);
    } catch {
      const saved = [...next, { id: newId(), role: "assistant" as const, text: "No hay conexión con Carga360go. La conversación sigue en este dispositivo." }];
      setTurns(saved);
      writeStored(saved);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.shell} aria-labelledby={titleId}>
      <header className={styles.top}>
        <div>
          <p className={styles.brand}>Carga360go</p>
          <h1 id={titleId} className={styles.title}>Agente 360go</h1>
        </div>
        <button type="button" className={styles.borrar} onClick={borrar} disabled={busy}>
          Borrar historial
        </button>
      </header>
      {hint || install ? (
        <p className={styles.hint}>
          {hint}
          {install ? (
            <button
              type="button"
              className={styles.instalar}
              onClick={() => {
                void install.prompt().finally(() => setInstall(null));
              }}
            >
              Instalar
            </button>
          ) : null}
        </p>
      ) : null}
      <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-relevant="additions">
        {turns.map((turn) => (
          <p key={turn.id} className={`${styles.bubble} ${turn.role === "user" ? styles.user : styles.assistant}`}>
            {turn.text}
          </p>
        ))}
        {busy ? <p className={`${styles.bubble} ${styles.assistant}`}>Consultando la operación…</p> : null}
      </div>
      <form className={styles.form} onSubmit={(event) => void enviar(event)}>
        <textarea
          className={styles.input}
          value={text}
          maxLength={2000}
          rows={2}
          placeholder="Carga, camión, retorno o torre de control"
          aria-label="Mensaje para el Agente 360go"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void enviar(event);
            }
          }}
        />
        <button type="submit" className={styles.enviar} disabled={busy || !text.trim()}>
          Enviar
        </button>
      </form>
    </section>
  );
}
