/**
 * Configuración pública del avatar del agente Carga360 (panel FAB).
 *
 * Por defecto: modo mock (cara/video local + lip-sync falso). Los proveedores
 * de pago (HeyGen, D-ID) quedan desactivados hasta AVATAR_ENABLED=true y
 * credenciales en el entorno del servidor — nunca en el repositorio.
 *
 * Variables (solo nombres; sin secretos en git):
 * - NEXT_PUBLIC_AVATAR_ENABLED / AVATAR_ENABLED  → "true" habilita proveedor real
 * - NEXT_PUBLIC_AVATAR_PROVIDER → mock | static | heygen | did  (defecto: mock)
 * - NEXT_PUBLIC_AVATAR_STATIC_URL → imagen o video estático / loop corto (público)
 * - NEXT_PUBLIC_AVATAR_STREAM_URL → URL de stream si el proveedor ya entregó una sesión
 * - AVATAR_HEYGEN_API_KEY / AVATAR_DID_API_KEY → solo servidor; no exponer al cliente
 */

export type AvatarProviderId = "mock" | "static" | "heygen" | "did";

export type AvatarPublicStatus = {
  /** Siempre hay UI de avatar en el panel; "live" solo si el proveedor real está armado. */
  mode: "mock" | "static" | "live";
  provider: AvatarProviderId;
  enabled: boolean;
  connected: boolean;
  /** Texto visible: CONECTADA o NO CONECTADA: motivo. */
  state: string;
  staticUrl: string;
  streamUrl: string;
};

function truthy(raw: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((raw || "").trim());
}

function readProvider(raw: string | undefined): AvatarProviderId {
  const value = (raw || "mock").trim().toLowerCase();
  if (value === "static" || value === "heygen" || value === "did" || value === "mock") return value;
  return "mock";
}

type EnvBag = Record<string, string | undefined>;

function hasServerKey(provider: AvatarProviderId, env: EnvBag): boolean {
  if (provider === "heygen") return Boolean(env.AVATAR_HEYGEN_API_KEY?.trim());
  if (provider === "did") return Boolean(env.AVATAR_DID_API_KEY?.trim());
  return false;
}

/** Estado seguro para el cliente (sin claves ni secretos). */
export function avatarPublicStatus(env: EnvBag = process.env): AvatarPublicStatus {
  const enabled = truthy(env.NEXT_PUBLIC_AVATAR_ENABLED) || truthy(env.AVATAR_ENABLED);
  const provider = readProvider(env.NEXT_PUBLIC_AVATAR_PROVIDER || env.AVATAR_PROVIDER);
  const staticUrl = (env.NEXT_PUBLIC_AVATAR_STATIC_URL || env.AVATAR_STATIC_URL || "").trim();
  const streamUrl = (env.NEXT_PUBLIC_AVATAR_STREAM_URL || env.AVATAR_STREAM_URL || "").trim();

  if (!enabled || provider === "mock") {
    return {
      mode: staticUrl ? "static" : "mock",
      provider: staticUrl ? "static" : "mock",
      enabled: false,
      connected: false,
      state: "NO CONECTADA: avatar local (mock). Proveedor real apagado (AVATAR_ENABLED≠true).",
      staticUrl,
      streamUrl: "",
    };
  }

  if (provider === "static") {
    return {
      mode: staticUrl ? "static" : "mock",
      provider: "static",
      enabled: true,
      connected: Boolean(staticUrl),
      state: staticUrl
        ? "CONECTADA: imagen/video estático (NEXT_PUBLIC_AVATAR_STATIC_URL)"
        : "NO CONECTADA: AVATAR_PROVIDER=static sin NEXT_PUBLIC_AVATAR_STATIC_URL",
      staticUrl,
      streamUrl: "",
    };
  }

  // heygen | did: requieren flag + clave de servidor. Sin clave → mock/static.
  const keyed = hasServerKey(provider, env);
  if (!keyed) {
    return {
      mode: staticUrl ? "static" : "mock",
      provider,
      enabled: true,
      connected: false,
      state: `NO CONECTADA: ${provider} sin clave de servidor (AVATAR_${provider === "heygen" ? "HEYGEN" : "DID"}_API_KEY). UI en mock.`,
      staticUrl,
      streamUrl: "",
    };
  }

  return {
    mode: streamUrl ? "live" : "mock",
    provider,
    enabled: true,
    connected: Boolean(streamUrl),
    state: streamUrl
      ? `CONECTADA: stream ${provider}`
      : `NO CONECTADA: ${provider} con clave pero sin sesión/stream (NEXT_PUBLIC_AVATAR_STREAM_URL). UI en mock hasta integrar la sesión.`,
    staticUrl,
    streamUrl,
  };
}
