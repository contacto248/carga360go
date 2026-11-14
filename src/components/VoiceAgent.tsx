"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Widget del agente comercial CARGA360 (texto y voz).
 * Voz: Web Speech API del navegador en es-CL (reconocimiento y síntesis). No se graba ni se guarda audio:
 * solo se envía el texto reconocido. Si el navegador no soporta la API, se usa solo texto.
 */
type Msg = { id: string; role: "user" | "assistant"; text: string; at: string };
type VoiceStatus = { id: string; label: string; connected: boolean; state: string };
type Init = {
  enabled: boolean;
  greeting?: string;
  greetingSpeak?: string;
  quick?: string[];
  messages?: Msg[];
  maxLength?: number;
  status?: { ai: string; modeLabel: string; voice: VoiceStatus[] };
};
type Reply = { reply?: string; speak?: string; quick?: string[]; messages?: Msg[]; handoff?: boolean; mode?: string; error?: string };

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

const CONSENT_KEY = "c360_agente_voz_ok";
const MUTE_KEY = "c360_agente_silencio";

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const by = (re: RegExp) => voices.find((v) => re.test(v.lang));
  return by(/^es[-_]CL/i) ?? by(/^es[-_](419|US|MX|AR|CO|PE)/i) ?? by(/^es/i) ?? null;
}

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "El navegador no dio permiso para usar el micrófono. Puede activarlo en la configuración del sitio o seguir escribiendo.",
  "service-not-allowed": "El navegador no permite el reconocimiento de voz aquí. Puede seguir escribiendo.",
  "no-speech": "No escuché nada. Toque el micrófono e inténtelo de nuevo.",
  "audio-capture": "No se encontró un micrófono.",
  network: "El reconocimiento de voz necesita conexión. Inténtelo de nuevo o escriba su consulta.",
};

export function VoiceAgentLauncher({ waHref }: { waHref: string }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(window.location.pathname.startsWith("/admin"));
  }, []);
  if (hidden) return null;
  return (
    <div className={`help-dock${open ? " is-open" : ""}`}>
      {open ? <AgentPanel waHref={waHref} onClose={() => setOpen(false)} /> : null}
      {!open ? (
        <div className="help-stack">
          <a className="btn wa fab help-wa" href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp">
            💬 WhatsApp
          </a>
          <button type="button" className="help-fab agent-fab" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="c360-agent-panel">
            <span aria-hidden="true">🎙️</span>
            <span>Asistente</span>
          </button>
        </div>
      ) : (
        <button type="button" className="help-fab is-close" onClick={() => setOpen(false)} aria-expanded={true} aria-controls="c360-agent-panel" aria-label="Cerrar el asistente">
          ✕
        </button>
      )}
    </div>
  );
}

function AgentPanel({ waHref, onClose }: { waHref: string; onClose: () => void }) {
  const titleId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const [greeting, setGreeting] = useState<Msg | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quick, setQuick] = useState<string[]>([]);
  const [status, setStatus] = useState<Init["status"] | null>(null);
  const [maxLength, setMaxLength] = useState(500);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);

  useEffect(() => {
    setVoiceSupported(Boolean(recognitionCtor()));
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    setMuted(window.localStorage.getItem(MUTE_KEY) === "1");
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agente", { credentials: "same-origin" });
        const data = (await res.json().catch(() => null)) as Init | null;
        if (cancelled || !data?.enabled) return;
        setGreeting({ id: "greeting", role: "assistant", text: data.greeting || "", at: "" });
        setMessages(data.messages || []);
        setQuick(data.quick || []);
        setStatus(data.status || null);
        if (data.maxLength) setMaxLength(data.maxLength);
      } catch {
        if (!cancelled) setError("No hay conexión con el asistente. Puede escribirnos por WhatsApp.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (line: string) => {
      if (muted || !line || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(line);
      utter.lang = "es-CL";
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      utter.rate = 1;
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utter);
    },
    [muted],
  );

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy, interim, error]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      recRef.current?.abort();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [onClose]);

  async function send(raw: string, via: "texto" | "voz") {
    const message = raw.trim();
    if (!message || busy) return;
    stopSpeaking();
    setError("");
    setBusy(true);
    setText("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", text: message, at: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/agente", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, via }),
      });
      const data = (await res.json().catch(() => null)) as Reply | null;
      if (!res.ok || !data) {
        setError(data?.error || "No se pudo enviar el mensaje.");
      } else {
        if (data.messages?.length) setMessages(data.messages);
        if (data.quick) setQuick(data.quick);
        if (data.speak) speak(data.speak);
      }
    } catch {
      setError("No hay conexión. Inténtelo de nuevo o escríbanos a contacto@carga360go.cl.");
    }
    setBusy(false);
  }

  async function reset() {
    stopSpeaking();
    setError("");
    try {
      const res = await fetch("/api/agente", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const data = (await res.json().catch(() => null)) as { quick?: string[] } | null;
      if (res.ok) {
        setMessages([]);
        if (data?.quick) setQuick(data.quick);
      }
    } catch {
      setError("No hay conexión.");
    }
  }

  function startListening() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (window.sessionStorage.getItem(CONSENT_KEY) !== "1") {
      setAskConsent(true);
      return;
    }
    stopSpeaking();
    setError("");
    const rec = new Ctor();
    rec.lang = "es-CL";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (event) => {
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else partial += result[0].transcript;
      }
      setInterim(partial || finalText);
    };
    rec.onerror = (event) => {
      if (event.error !== "aborted") setError(MIC_ERRORS[event.error] || "No pude usar el micrófono. Puede escribir su consulta.");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recRef.current = null;
      if (finalText.trim()) void send(finalText.slice(0, maxLength), "voz");
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("No pude iniciar el micrófono.");
    }
  }

  function stopListening() {
    recRef.current?.stop();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    if (next) stopSpeaking();
  }

  const all = greeting ? [greeting, ...messages] : messages;
  const aiLabel = status?.modeLabel;

  return (
    <section id="c360-agent-panel" className="chat-panel agent-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="chat-head">
        <div>
          <h2 id={titleId}>Asistente CARGA360</h2>
          <p>
            Asistente automático · español de Chile
            {aiLabel ? <span className={`agent-badge${status?.ai === "conectada" ? " ok" : ""}`}>{aiLabel}</span> : null}
          </p>
        </div>
        {ttsSupported ? (
          <button type="button" className="chat-x" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Activar la voz del asistente" : "Silenciar la voz del asistente"} title={muted ? "Voz silenciada" : "Voz activada"}>
            {muted ? "🔇" : "🔊"}
          </button>
        ) : null}
        <button type="button" className="chat-x" onClick={reset} aria-label="Nueva conversación" title="Nueva conversación">
          ↺
        </button>
        <button type="button" className="chat-x" onClick={onClose} aria-label="Cerrar el asistente">
          ✕
        </button>
      </header>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {all.map((msg) => (
          <div key={msg.id} className={`chat-bubble ${msg.role === "user" ? "from-me" : "from-bot"}`}>
            {msg.text}
          </div>
        ))}
        {listening ? (
          <div className="agent-listening" role="status">
            <span className="agent-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>{interim || "Escuchando…"}</span>
          </div>
        ) : null}
        {busy ? <div className="chat-bubble from-bot is-wait">Procesando…</div> : null}
        {askConsent ? (
          <div className="agent-consent" role="alertdialog" aria-label="Permiso para usar el micrófono">
            <p>
              Para hablar, su navegador le pedirá permiso para usar el micrófono. Carga 360 Go <strong>no graba ni guarda audio</strong>: solo guarda el texto de la conversación. Según el navegador, la conversión de voz a texto puede hacerla su proveedor (por ejemplo, Google en Chrome).
            </p>
            <div className="row">
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  window.sessionStorage.setItem(CONSENT_KEY, "1");
                  setAskConsent(false);
                  startListening();
                }}
              >
                Aceptar y hablar
              </button>
              <button type="button" className="btn sec sm" onClick={() => setAskConsent(false)}>
                Prefiero escribir
              </button>
            </div>
          </div>
        ) : null}
        {error ? <div className="chat-error">{error}</div> : null}
      </div>
      {quick.length ? (
        <div className="chat-quick" role="group" aria-label="Acciones frecuentes">
          {quick.map((label) => (
            <button key={label} type="button" className="chat-chip" disabled={busy} onClick={() => send(label, "texto")}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text, "texto");
        }}
      >
        <label className="sr-only" htmlFor="c360-agent-input">
          Escriba su consulta
        </label>
        <textarea
          id="c360-agent-input"
          ref={inputRef}
          rows={1}
          maxLength={maxLength}
          value={text}
          disabled={busy}
          placeholder={voiceSupported ? "Escriba o toque el micrófono…" : "Escriba su consulta…"}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(text, "texto");
            }
          }}
        />
        {voiceSupported ? (
          <button
            type="button"
            className={`agent-mic${listening ? " is-on" : ""}`}
            onClick={listening ? stopListening : startListening}
            disabled={busy}
            aria-pressed={listening}
            aria-label={listening ? "Detener el micrófono" : "Hablar con el asistente"}
          >
            {listening ? "■" : "🎙️"}
          </button>
        ) : null}
        {speaking ? (
          <button type="button" className="btn sec sm" onClick={stopSpeaking} aria-label="Detener la voz">
            Callar
          </button>
        ) : (
          <button type="submit" className="btn sm" disabled={busy || !text.trim()}>
            Enviar
          </button>
        )}
      </form>
      <p className="chat-note">
        {voiceSupported ? "Voz del navegador (es-CL), sin costo. " : "Su navegador no permite dictar por voz: use el texto. "}
        No da precios, no aprueba cuentas ni documentos. <a href={waHref} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </p>
    </section>
  );
}
