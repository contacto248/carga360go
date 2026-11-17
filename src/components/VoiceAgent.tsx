"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AgentAvatar, type AgentAvatarState } from "@/components/AgentAvatar";
import { AgentAvatarStage } from "@/components/AgentAvatarStage";
import { WhatsAppContactGate } from "@/components/WhatsAppContactGate";
import { avatarPublicStatus, type AvatarPublicStatus } from "@/lib/agent/avatar";

/**
 * FAB único Carga360 (texto y voz). Marca visible en textos: Carga360go.
 * Absorbe WhatsApp y las acciones del antiguo Asistente/chat web.
 * Voz: Web Speech API del navegador (speechSynthesis + SpeechRecognition) en es-CL / es-ES.
 * No se graba ni se guarda audio: solo se envía el texto reconocido. Sin claves ni servicios de pago.
 */
type Msg = { id: string; role: "user" | "assistant"; text: string; at: string };
type Init = {
  enabled: boolean;
  greeting?: string;
  greetingSpeak?: string;
  quick?: string[];
  messages?: Msg[];
  maxLength?: number;
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
  return by(/^es[-_]CL/i) ?? by(/^es[-_]ES/i) ?? by(/^es[-_](419|US|MX|AR|CO|PE)/i) ?? by(/^es/i) ?? null;
}

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "El navegador no dio permiso para usar el micrófono. Puede activarlo en la configuración del sitio o seguir escribiendo.",
  "service-not-allowed": "El navegador no permite el reconocimiento de voz aquí. Puede seguir escribiendo.",
  "no-speech": "No escuché nada. Toque el micrófono e inténtelo de nuevo.",
  "audio-capture": "No se encontró un micrófono.",
  network: "El reconocimiento de voz necesita conexión. Inténtelo de nuevo o escriba su consulta.",
};

export function VoiceAgentLauncher({ waNumber, waText }: { waNumber: string; waText: string }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [bassam, setBassam] = useState(false);
  useEffect(() => {
    const path = window.location.pathname;
    const onBassam = path === "/admin/bassam" || path.startsWith("/admin/bassam/");
    setBassam(onBassam);
    setHidden(path.startsWith("/admin") && !onBassam);
  }, []);
  if (hidden) return null;
  return (
    <div className={`help-dock${open ? " is-open" : ""}`}>
      {bassam ? (
        <button type="button" className="help-fab help-exec" onClick={() => { if ("speechSynthesis" in window) window.speechSynthesis.resume(); setOpen(true); }} aria-expanded={open} aria-controls="c360-agent-panel">
          Asistente IA ejecutivo
        </button>
      ) : null}
            {open ? <AgentPanel waNumber={waNumber} waText={waText} onClose={() => setOpen(false)} executive={bassam} /> : null}
      {!open ? (
        <button
          type="button"
          className="help-fab agent-fab"
          onClick={() => { if ("speechSynthesis" in window) window.speechSynthesis.resume(); setOpen(true); }}
          aria-expanded={false}
          aria-controls="c360-agent-panel"
          aria-label="Abrir Carga360"
        >
          <AgentAvatar state="idle" size={28} className="agent-fab-avatar" label="Carga360go" />
          <span>Carga360</span>
        </button>
      ) : (
        <button type="button" className="help-fab is-close" onClick={() => setOpen(false)} aria-expanded={true} aria-controls="c360-agent-panel" aria-label="Cerrar Carga360">
          ✕
        </button>
      )}
    </div>
  );
}

function AgentPanel({ waNumber, waText, onClose, executive = false }: { waNumber: string; waText: string; onClose: () => void; executive?: boolean }) {
  const titleId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [greeting, setGreeting] = useState<Msg | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quick, setQuick] = useState<string[]>([]);
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
  const [greetingSpeak, setGreetingSpeak] = useState("");
  const [micDenied, setMicDenied] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<AvatarPublicStatus>(() => avatarPublicStatus());
  const greetedRef = useRef(false);

  const avatarState: AgentAvatarState = listening ? "listening" : speaking ? "speaking" : "idle";

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
        if (cancelled || !data) return;
        setEnabled(Boolean(data.enabled));
        // Avatar: solo config pública local (NEXT_PUBLIC_*); el API ya no expone status técnico.
        setAvatarStatus(avatarPublicStatus());
        if (!data.enabled) return;
        setGreeting({ id: "greeting", role: "assistant", text: data.greeting || "", at: "" });
        setMessages(data.messages || []);
        setQuick(data.quick || []);
        if (data.maxLength) setMaxLength(data.maxLength);
        setGreetingSpeak(data.greetingSpeak || "");
      } catch {
        if (!cancelled) {
          setEnabled(false);
          setError("No hay conexión con Carga360go. Puede continuar por WhatsApp.");
        }
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

  const speak = useCallback((line: string) => {
    if (!line || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (muted || window.localStorage.getItem(MUTE_KEY) === "1") return;
    const synth = window.speechSynthesis;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      synth.removeEventListener("voiceschanged", run);
      if (window.localStorage.getItem(MUTE_KEY) === "1") return;
      const utter = new SpeechSynthesisUtterance(line);
      utter.lang = "es-CL";
      const voice = pickVoice();
      if (voice) {
        utter.voice = voice;
        if (/^es[-_]ES/i.test(voice.lang) && !/^es[-_]CL/i.test(voice.lang)) utter.lang = "es-ES";
      }
      utter.rate = 1;
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      // Chrome descarta el enunciado si cancel() y speak() ocurren en el mismo instante.
      synth.cancel();
      window.setTimeout(() => {
        if (window.localStorage.getItem(MUTE_KEY) === "1") return;
        synth.resume();
        synth.speak(utter);
      }, 40);
    };
    if (synth.getVoices().length) run();
    else {
      synth.addEventListener("voiceschanged", run);
      synth.getVoices();
      window.setTimeout(run, 400);
    }
  }, [muted]);

  useEffect(() => {
    if (!ttsSupported || greetedRef.current || !greetingSpeak || messages.length > 0) return;
    if (window.localStorage.getItem(MUTE_KEY) === "1") return;
    greetedRef.current = true;
    speak(greetingSpeak);
  }, [ttsSupported, greetingSpeak, messages.length, speak]);

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
    if (!message || busy || enabled === false) return;
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
        body: JSON.stringify(executive ? { message, via, executive: true } : { message, via }),
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
    setMicDenied(false);
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
      if (event.error === "aborted") return;
      const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
      setMicDenied(denied);
      setError(MIC_ERRORS[event.error] || "No pude usar el micrófono. Puede escribir su consulta.");
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

  return (
    <section id="c360-agent-panel" className="chat-panel agent-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="chat-head">
        <AgentAvatar state={avatarState} size={44} className="agent-head-avatar" label="Carga360go" />
        <div className="chat-head-copy">
          {executive ? <h2 id={titleId}>Asistente IA ejecutivo</h2> : <h2 id={titleId}>Carga360</h2>}
          <p>Asistente · español de Chile · Carga360go</p>
        </div>
        <div className="chat-head-actions">
          {ttsSupported ? (
            <button type="button" className="chat-x" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Activar la voz de Carga360go" : "Silenciar la voz de Carga360go"} title={muted ? "Voz silenciada" : "Voz activada"}>
              {muted ? "🔇" : "🔊"}
            </button>
          ) : null}
          <button type="button" className="chat-x" onClick={reset} aria-label="Nueva conversación" title="Nueva conversación" disabled={enabled === false}>
            ↺
          </button>
          <button type="button" className="chat-x" onClick={onClose} aria-label="Cerrar Carga360">
            ✕
          </button>
        </div>
      </header>
      <AgentAvatarStage
        state={avatarState}
        status={avatarStatus}
        micDenied={micDenied}
        listeningHint={interim || "Escuchando… hable ahora"}
        label="Carga360go"
      />
      <div className="chat-log" ref={logRef} aria-live="polite">
        {enabled === false ? (
          <div className="chat-bubble from-bot">
            Carga360go está en pausa en este momento. Puede{" "}
            <WhatsAppContactGate number={waNumber} text={waText} className="wa-text">
              continuar por WhatsApp
            </WhatsAppContactGate>{" "}
            o escribir a contacto@carga360go.cl.
          </div>
        ) : null}
        {all.map((msg) => (
          <div key={msg.id} className={`chat-bubble ${msg.role === "user" ? "from-me" : "from-bot"}`}>
            {msg.text}
          </div>
        ))}
        {listening ? (
          <div className="agent-listening is-active" role="status">
            <span className="agent-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>{interim || "Micrófono activo — escuchando…"}</span>
          </div>
        ) : null}
        {micDenied && !listening ? (
          <div className="agent-mic-denied" role="alert">
            Sin permiso de micrófono. Puede activarlo en la configuración del sitio o seguir escribiendo.
          </div>
        ) : null}
        {busy ? <div className="chat-bubble from-bot is-wait">Procesando…</div> : null}
        {askConsent ? (
          <div className="agent-consent" role="alertdialog" aria-label="Permiso para usar el micrófono">
            <p>
              Para hablar, su navegador le pedirá permiso para usar el micrófono. Carga360go <strong>no graba ni guarda audio</strong>: solo guarda el texto de la conversación. Según el navegador, la conversión de voz a texto puede hacerla su proveedor (por ejemplo, Google en Chrome).
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
      {quick.length && enabled !== false ? (
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
          disabled={busy || enabled === false}
          placeholder={voiceSupported ? "Escriba o hable…" : "Escriba aquí…"}
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
            className={`agent-mic${listening ? " is-on" : ""}${micDenied ? " is-denied" : ""}`}
            onClick={listening ? stopListening : startListening}
            disabled={busy || enabled === false}
            aria-pressed={listening}
            aria-label={
              listening
                ? "Detener el micrófono"
                : micDenied
                  ? "Reintentar permiso de micrófono"
                  : "Hablar con Carga360go"
            }
            title={micDenied ? "Sin permiso de micrófono" : listening ? "Micrófono activo" : "Hablar"}
          >
            {listening ? "■" : "🎙️"}
          </button>
        ) : null}
        {speaking ? (
          <button type="button" className="btn sec sm" onClick={stopSpeaking} aria-label="Detener la voz">
            Callar
          </button>
        ) : (
          <button type="submit" className="btn sm" disabled={busy || enabled === false || !text.trim()}>
            Enviar
          </button>
        )}
      </form>
      <div className="agent-wa-row">
        <WhatsAppContactGate number={waNumber} text={waText} className="btn wa sm agent-wa-cta">
          Continuar por WhatsApp
        </WhatsAppContactGate>
      </div>
      <p className="chat-note">
        {voiceSupported ? "Voz del navegador (es-CL / es-ES), sin costo. " : "Su navegador no permite dictar por voz: use el texto. "}
        El costo que entrega es referencial y calculado por el sistema; no aprueba cuentas ni documentos. Marca Carga360go.
      </p>
    </section>
  );
}
