"use client";

import type { AgentAvatarState } from "@/components/AgentAvatar";
import type { AvatarPublicStatus } from "@/lib/agent/avatar";

type Props = {
  state: AgentAvatarState;
  status: AvatarPublicStatus;
  micDenied?: boolean;
  listeningHint?: string;
  label?: string;
};

/**
 * Zona de avatar humano/video dentro del panel FAB Carga360.
 * Sin proveedor de pago: cara ilustrada + lip-sync falso / estado «hablando».
 * Con NEXT_PUBLIC_AVATAR_STATIC_URL: imagen o video en loop.
 * Con stream live (futuro): video del proveedor; hoy queda detrás de AVATAR_ENABLED.
 */
export function AgentAvatarStage({
  state,
  status,
  micDenied = false,
  listeningHint = "",
  label = "Asistente ÓRBITA",
}: Props) {
  const media = status.mode === "live" && status.streamUrl
    ? status.streamUrl
    : status.staticUrl || "";
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(media) || status.mode === "live";
  const statusLine = micDenied
    ? "Sin permiso de micrófono"
    : state === "listening"
      ? listeningHint || "Escuchando…"
      : state === "speaking"
        ? "Hablando…"
        : "Listo para ayudarle";

  return (
    <div
      className={`agent-avatar-stage is-${state}${micDenied ? " is-mic-denied" : ""}`}
      data-avatar-mode={status.mode}
      data-avatar-provider={status.provider}
      role="status"
      aria-live="polite"
      aria-label={`${label}: ${statusLine}`}
    >
      <div className="agent-avatar-stage-frame">
        {media ? (
          isVideo ? (
            <video
              className="agent-avatar-stage-media"
              src={media}
              autoPlay
              muted={status.mode !== "live"}
              loop={status.mode !== "live"}
              playsInline
              aria-hidden="true"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública configurable por env
            <img className="agent-avatar-stage-media" src={media} alt="" />
          )
        ) : (
          <HumanFaceSvg state={state} />
        )}
        <span className="agent-avatar-stage-glow" aria-hidden="true" />
        {state === "speaking" ? (
          <span className="agent-avatar-stage-lipsync" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {state === "listening" ? <span className="agent-avatar-stage-listen-ring" aria-hidden="true" /> : null}
      </div>
      <p className="agent-avatar-stage-caption">
        <span className={`agent-avatar-stage-dot is-${micDenied ? "denied" : state}`} aria-hidden="true" />
        <span>{statusLine}</span>
      </p>
      {micDenied ? (
        <p className="agent-avatar-stage-denied">
          El navegador no dio permiso para el micrófono. Actívelo en la configuración del sitio o escriba su consulta.
        </p>
      ) : null}
    </div>
  );
}

function HumanFaceSvg({ state }: { state: AgentAvatarState }) {
  return (
    <svg className={`agent-human-face is-${state}`} viewBox="0 0 160 160" width="160" height="160" aria-hidden="true">
      <defs>
        <linearGradient id="c360-face-bg" x1="20" y1="8" x2="140" y2="150" gradientUnits="userSpaceOnUse">
          <stop stopColor="#111111" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
        <linearGradient id="c360-face-skin" x1="50" y1="30" x2="110" y2="130" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f3c9a8" />
          <stop offset="1" stopColor="#e0a980" />
        </linearGradient>
        <clipPath id="c360-face-clip">
          <circle cx="80" cy="80" r="72" />
        </clipPath>
      </defs>
      <circle cx="80" cy="80" r="76" fill="url(#c360-face-bg)" />
      <circle cx="80" cy="80" r="72" fill="none" stroke="#FF5001" strokeWidth="3" opacity="0.9" />
      <g clipPath="url(#c360-face-clip)">
        {/* Hombros / ropa */}
        <ellipse cx="80" cy="148" rx="54" ry="28" fill="#C84300" />
        <ellipse cx="80" cy="148" rx="54" ry="28" fill="#111111" opacity="0.35" />
        {/* Cabeza */}
        <ellipse className="agent-human-head" cx="80" cy="72" rx="38" ry="44" fill="url(#c360-face-skin)" />
        {/* Cabello */}
        <path
          d="M46 70c2-28 18-42 34-42s32 14 34 42c-6-16-18-26-34-26S52 54 46 70Z"
          fill="#1a2744"
        />
        <path d="M44 78c0-8 3-18 8-24 1 14 4 24 4 24H44Z" fill="#1a2744" />
        <path d="M116 78c0-8-3-18-8-24-1 14-4 24-4 24h12Z" fill="#1a2744" />
        {/* Cejas */}
        <path d="M58 62c6-4 14-4 20 0" fill="none" stroke="#2a3550" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M82 62c6-4 14-4 20 0" fill="none" stroke="#2a3550" strokeWidth="2.2" strokeLinecap="round" />
        {/* Ojos */}
        <ellipse cx="68" cy="72" rx="5.5" ry="6" fill="#fff" />
        <ellipse cx="92" cy="72" rx="5.5" ry="6" fill="#fff" />
        <circle cx="68" cy="73" r="2.8" fill="#111111" />
        <circle cx="92" cy="73" r="2.8" fill="#111111" />
        <circle cx="69.2" cy="71.5" r="0.9" fill="#fff" />
        <circle cx="93.2" cy="71.5" r="0.9" fill="#fff" />
        {/* Nariz */}
        <path d="M80 76v12c-3 1.5-5 1.5-6 0" fill="none" stroke="#c48a62" strokeWidth="1.8" strokeLinecap="round" />
        {/* Boca — lip-sync falso al hablar */}
        <g className="agent-human-mouth">
          <path className="agent-human-mouth-closed" d="M68 98c6 7 18 7 24 0" fill="none" stroke="#a85a45" strokeWidth="2.4" strokeLinecap="round" />
          <ellipse className="agent-human-mouth-open" cx="80" cy="100" rx="10" ry="6" fill="#7a2e28" />
          <path className="agent-human-mouth-open" d="M70 98c4 2 16 2 20 0" fill="#e8897a" />
        </g>
        {/* Badge 360 */}
        <g transform="translate(112 118)">
          <circle r="14" fill="#111111" stroke="#FF5001" strokeWidth="2" />
          <text x="0" y="4" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="800" fontFamily="ui-sans-serif,system-ui,sans-serif">
            360
          </text>
        </g>
      </g>
    </svg>
  );
}
