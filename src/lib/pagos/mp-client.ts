import { randomUUID } from "crypto";
import { MP_API_BASE, MP_AUTHORIZE_URL, mpCredentials, mpEnv } from "./config";

/**
 * Cliente mínimo de la API de Mercado Pago. Todas las llamadas reciben `fetchImpl` para poder
 * probarlas con respuestas simuladas; sin credenciales no se hace ninguna llamada.
 * Nunca se loguean tokens ni cuerpos con tokens.
 */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

let fetchOverride: FetchLike | null = null;

/** Solo para pruebas: reemplaza fetch por un simulador. */
export function setMpFetch(impl: FetchLike | null) {
  fetchOverride = impl;
}

function mpFetch(): FetchLike {
  return fetchOverride ?? ((url, init) => fetch(url, init));
}

export class MpError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "MpError";
  }
}

async function call<T>(path: string, init: { method: string; token: string; body?: unknown; form?: Record<string, string>; idempotencyKey?: string }): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | undefined;
  if (init.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  } else if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.idempotencyKey) headers["x-idempotency-key"] = init.idempotencyKey;
  let response;
  try {
    response = await mpFetch()(`${MP_API_BASE}${path}`, { method: init.method, headers, body });
  } catch {
    throw new MpError("No se pudo conectar con Mercado Pago.", 502, "mp_red");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof data.error === "string" ? data.error : `http_${response.status}`;
    throw new MpError("Mercado Pago rechazó la solicitud.", response.status, code);
  }
  return data as T;
}

export function authorizeUrl(state: string): string {
  const creds = mpCredentials();
  if (!creds.oauthReady) throw new MpError("Faltan credenciales de Mercado Pago.", 503, "sin_credenciales");
  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: "code",
    platform_id: "mp",
    redirect_uri: creds.redirectUri,
    state,
  });
  return `${MP_AUTHORIZE_URL}?${params.toString()}`;
}

export type OAuthTokens = {
  access_token: string;
  refresh_token: string;
  public_key?: string;
  user_id: number | string;
  scope?: string;
  live_mode?: boolean;
  expires_in: number;
};

function assertTokens(data: OAuthTokens): OAuthTokens {
  if (!data || typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || data.user_id == null || !Number(data.expires_in)) {
    throw new MpError("Respuesta OAuth incompleta.", 502, "oauth_respuesta");
  }
  return data;
}

export async function exchangeCode(code: string, state: string): Promise<OAuthTokens> {
  const creds = mpCredentials();
  if (!creds.oauthReady) throw new MpError("Faltan credenciales de Mercado Pago.", 503, "sin_credenciales");
  const data = await call<OAuthTokens>("/oauth/token", {
    method: "POST",
    token: "",
    form: {
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: creds.redirectUri,
      state,
      // test_token=true entrega tokens TEST- (credenciales de "Prueba" de una app real). Checkout Pro
      // de marketplace con usuarios de prueba necesita el token APP_USR- del vendedor (credenciales de
      // "Producción" de una app cuyo dueño también es usuario de prueba). Si no, el checkout abre pero
      // responde «No pudimos procesar tu pago» sin crear un Payment. MP_OAUTH_TEST_TOKEN=true lo fuerza.
      test_token: process.env.MP_OAUTH_TEST_TOKEN === "true" ? "true" : "false",
    },
  });
  return assertTokens(data);
}

export async function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  const creds = mpCredentials();
  if (!creds.oauthReady) throw new MpError("Faltan credenciales de Mercado Pago.", 503, "sin_credenciales");
  const data = await call<OAuthTokens>("/oauth/token", {
    method: "POST",
    token: "",
    body: { client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken },
  });
  return assertTokens(data);
}

export type PreferenceResponse = { id: string; init_point?: string; sandbox_init_point?: string };

export async function createPreference(sellerToken: string, body: Record<string, unknown>, idempotencyKey: string): Promise<PreferenceResponse> {
  const data = await call<PreferenceResponse>("/checkout/preferences", { method: "POST", token: sellerToken, body, idempotencyKey });
  if (!data || typeof data.id !== "string") throw new MpError("Respuesta de preferencia incompleta.", 502, "preferencia_respuesta");
  return data;
}

export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  live_mode?: boolean;
  collector_id?: number | string;
  fee_details?: { amount?: number; type?: string }[];
  date_approved?: string | null;
  transaction_amount_refunded?: number;
};

export async function getPayment(sellerToken: string, paymentId: string): Promise<MpPayment> {
  if (!/^\d{1,20}$/.test(paymentId)) throw new MpError("Id de pago inválido.", 400, "pago_id");
  return call<MpPayment>(`/v1/payments/${paymentId}`, { method: "GET", token: sellerToken });
}

export async function refundPayment(sellerToken: string, paymentId: string, amount: number | null, idempotencyKey: string = randomUUID()) {
  if (!/^\d{1,20}$/.test(paymentId)) throw new MpError("Id de pago inválido.", 400, "pago_id");
  return call<{ id: number | string; status?: string; amount?: number }>(`/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    token: sellerToken,
    body: amount == null ? {} : { amount },
    idempotencyKey,
  });
}
