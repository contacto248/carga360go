"use client";

/**
 * Avatar del Agente Carga360go derivado del isotipo de marca (navy + naranjo).
 * Estados animados: reposo | escuchando | hablando.
 */
export type AgentAvatarState = "idle" | "listening" | "speaking";

type Props = {
  state?: AgentAvatarState;
  size?: number;
  className?: string;
  label?: string;
};

export function AgentAvatar({ state = "idle", size = 56, className, label = "Agente Carga360go" }: Props) {
  return (
    <span
      className={`agent-avatar is-${state}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${state === "listening" ? "escuchando" : state === "speaking" ? "hablando" : "en reposo"}`}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="c360-av-bg" x1="12" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0B1633" />
            <stop offset="1" stopColor="#002451" />
          </linearGradient>
          <linearGradient id="c360-av-ring" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF5001" />
            <stop offset="1" stopColor="#C84300" />
          </linearGradient>
        </defs>
        <circle className="agent-avatar-disk" cx="32" cy="32" r="30" fill="url(#c360-av-bg)" />
        <circle className="agent-avatar-ring" cx="32" cy="32" r="28.5" fill="none" stroke="url(#c360-av-ring)" strokeWidth="2.4" />
        {/* Isotipo 360 estilizado */}
        <g className="agent-avatar-mark" fill="none" stroke="#FF5001" strokeWidth="2.6" strokeLinecap="round">
          <circle cx="32" cy="32" r="11" />
          <path d="M32 18.5v5.2M32 40.3v5.2M18.5 32h5.2M40.3 32h5.2" stroke="#ffd7bd" strokeWidth="2" />
        </g>
        <text x="32" y="36.5" textAnchor="middle" className="agent-avatar-360" fill="#fff">
          360
        </text>
        <g className="agent-avatar-pulse" fill="#FF5001">
          <circle cx="32" cy="32" r="30" />
        </g>
      </svg>
      <span className="agent-avatar-eq" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
