import { createHmac, timingSafeEqual } from "crypto";

/**
 * Capa de proveedores de voz, desacoplada del motor del agente.
 *
 *  - Navegador (Web Speech API, es-CL): reconocimiento y síntesis en el dispositivo del usuario. Real y sin costo
 *    para Carga 360 Go. Se ejecuta en el cliente (components/VoiceAgent.tsx); el servidor solo recibe texto.
 *    Ojo: en Chrome el reconocimiento lo procesa el servicio de voz de Google; se informa al pedir consentimiento.
 *  - Telefonía Twilio: webhook /api/agente/telefono con <Gather input="speech">. Implementado y probado con firmas
 *    simuladas en pruebas automáticas; NO CONECTADO hasta tener cuenta, número y autorización de costos.
 *  - Reconocimiento y síntesis externos (Google Cloud, Azure, ElevenLabs u otro): solo interfaz. NO CONECTADOS.
 */
export type ProviderKind = "stt" | "tts" | "telefonia";

export type ProviderStatus = {
  id: string;
  kind: ProviderKind[];
  label: string;
  connected: boolean;
  /** Texto visible: "CONECTADA" o "NO CONECTADA: <motivo>". */
  state: string;
  cost: string;
};

export class ProviderNotConnectedError extends Error {
  constructor(id: string) {
    super(`Proveedor de voz ${id} NO CONECTADO.`);
    this.name = "ProviderNotConnectedError";
  }
}

export interface SpeechToTextProvider {
  readonly id: string;
  status(): ProviderStatus;
  transcribe(audio: ArrayBuffer, language: string): Promise<string>;
}

export interface TextToSpeechProvider {
  readonly id: string;
  status(): ProviderStatus;
  synthesize(text: string, language: string): Promise<ArrayBuffer>;
}

export interface TelephonyProvider {
  readonly id: string;
  status(): ProviderStatus;
  /** Verifica que la solicitud venga del proveedor (firma). */
  verifyRequest(url: string, params: Record<string, string>, signature: string | null): boolean;
  /** Respuesta para el proveedor (TwiML u otro formato) con el texto a decir y la siguiente escucha. */
  render(text: string, opts: { actionUrl: string; hangup?: boolean }): { body: string; contentType: string };
}

/** Proveedor externo genérico sin credenciales: existe la interfaz, no hay conexión. */
class UnconnectedSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  constructor(
    readonly id: string,
    private readonly label: string,
    private readonly kinds: ProviderKind[],
  ) {}
  status(): ProviderStatus {
    return { id: this.id, kind: this.kinds, label: this.label, connected: false, state: "NO CONECTADA: sin proveedor ni credenciales", cost: "De pago por uso (requiere autorización)" };
  }
  async transcribe(): Promise<string> {
    throw new ProviderNotConnectedError(this.id);
  }
  async synthesize(): Promise<ArrayBuffer> {
    throw new ProviderNotConnectedError(this.id);
  }
}

function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Firma de Twilio: HMAC-SHA1 (base64) de la URL más los parámetros POST ordenados (clave+valor). */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export class TwilioTelephony implements TelephonyProvider {
  readonly id = "twilio";
  private env() {
    return {
      sid: process.env.TWILIO_ACCOUNT_SID || "",
      token: process.env.TWILIO_AUTH_TOKEN || "",
      enabled: process.env.AGENT_PHONE_ENABLED === "true",
    };
  }
  connected(): boolean {
    const env = this.env();
    return Boolean(env.sid && env.token && env.enabled);
  }
  status(): ProviderStatus {
    const env = this.env();
    const missing = [!env.sid && "TWILIO_ACCOUNT_SID", !env.token && "TWILIO_AUTH_TOKEN", !env.enabled && "AGENT_PHONE_ENABLED=true"].filter(Boolean);
    return {
      id: this.id,
      kind: ["telefonia", "stt", "tts"],
      label: "Twilio Voice (llamadas: reconocimiento <Gather> y voz <Say>)",
      connected: missing.length === 0,
      state: missing.length === 0 ? "CONECTADA" : `NO CONECTADA: falta ${missing.join(", ")}`,
      cost: "De pago: número mensual + minutos de llamada + reconocimiento de voz (requiere autorización)",
    };
  }
  verifyRequest(url: string, params: Record<string, string>, signature: string | null): boolean {
    const token = this.env().token;
    if (!token || !signature) return false;
    const expected = Buffer.from(twilioSignature(token, url, params));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
  render(text: string, opts: { actionUrl: string; hangup?: boolean }) {
    // Voz es-MX en <Say> (disponible en Twilio); reconocimiento es-CL en <Gather>. Sin probar con una cuenta real.
    const say = `<Say language="es-MX">${xmlEscape(text)}</Say>`;
    const body = opts.hangup
      ? `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Hangup/></Response>`
      : `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" language="es-CL" speechTimeout="auto" action="${xmlEscape(opts.actionUrl)}" method="POST">${say}</Gather><Say language="es-MX">No le escuché. Puede volver a llamar o escribirnos por WhatsApp.</Say></Response>`;
    return { body, contentType: "text/xml; charset=utf-8" };
  }
}

export const twilio = new TwilioTelephony();
export const externalStt = new UnconnectedSpeechProvider("stt-externo", "Reconocimiento de voz externo (Google Cloud / Azure / otro)", ["stt"]);
export const externalTts = new UnconnectedSpeechProvider("tts-externo", "Síntesis de voz externa (Google Cloud / Azure / ElevenLabs / otro)", ["tts"]);

export const BROWSER_VOICE: ProviderStatus = {
  id: "navegador",
  kind: ["stt", "tts"],
  label: "Navegador: Web Speech API (es-CL)",
  connected: true,
  state: "CONECTADA en el navegador del usuario (si el navegador la soporta)",
  cost: "Sin costo para Carga 360 Go",
};

export function voiceProvidersStatus(): ProviderStatus[] {
  return [BROWSER_VOICE, twilio.status(), externalStt.status(), externalTts.status()];
}
