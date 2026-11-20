import { createHash, createHmac, hkdfSync, randomInt, timingSafeEqual } from "crypto";
import { AppError } from "../errors";

export const QR_STEP_SECONDS = 30;
export const QR_MAX_ATTEMPTS = 5;
export const QR_LOCK_MS = 15 * 60 * 1000;
export const QR_OFFLINE_GRACE_MS = 10 * 60 * 1000;

export type TokenKind = "r" | "v";

export type TokenPayload = {
  v: 1;
  k: TokenKind;
  j: string;
  w: number;
  n: string;
};

export type TokenFailure = "firma_invalida" | "vencido" | "mal_formado";

const PREFIX: Record<TokenKind, string> = { r: "c360:r1", v: "c360:v1" };

export function timeWindow(nowMs: number): number {
  return Math.floor(nowMs / 1000 / QR_STEP_SECONDS);
}

export function secondsLeft(nowMs: number): number {
  const elapsed = Math.floor(nowMs / 1000) % QR_STEP_SECONDS;
  return elapsed === 0 ? QR_STEP_SECONDS : QR_STEP_SECONDS - elapsed;
}

/** Clave maestra solo desde el entorno. Sin valor por defecto. */
export function masterKey(): { kid: string; key: Buffer } {
  const raw = process.env.QR_MASTER_KEY || "";
  if (raw.length < 32) {
    throw new AppError("Falta QR_MASTER_KEY en el servidor (mínimo 32 caracteres).", 503, "qr_sin_clave");
  }
  const kid = (process.env.QR_MASTER_KEY_ID || "k1").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "k1";
  return { kid, key: Buffer.from(raw, "utf8") };
}

export function tripKey(master: Buffer, loadId: string, kind: TokenKind, termsHash: string, epoch: number): Buffer {
  const info = Buffer.from(`${loadId}|${kind}|${termsHash}|${epoch}`, "utf8");
  return Buffer.from(hkdfSync("sha256", master, Buffer.from("c360-qr-v1"), info, 32));
}

function b64url(value: Buffer): string {
  return value.toString("base64url");
}

export function signToken(key: Buffer, payload: TokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const mac = createHmac("sha256", key).update(body).digest().subarray(0, 16);
  return `${PREFIX[payload.k]}.${body}.${b64url(mac)}`;
}

export function issuePickupToken(key: Buffer, publicRef: string, nowMs: number): { token: string; payload: TokenPayload } {
  const payload: TokenPayload = {
    v: 1,
    k: "r",
    j: publicRef,
    w: timeWindow(nowMs),
    n: randomNonce(),
  };
  return { token: signToken(key, payload), payload };
}

export function issueVerifyToken(key: Buffer, publicRef: string): string {
  const payload: TokenPayload = { v: 1, k: "v", j: publicRef, w: 0, n: "comprobante" };
  return signToken(key, payload);
}

function randomNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

function decodePayload(body: string): TokenPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TokenPayload>;
    if (parsed.v !== 1 || (parsed.k !== "r" && parsed.k !== "v")) return null;
    if (typeof parsed.j !== "string" || typeof parsed.n !== "string" || typeof parsed.w !== "number") return null;
    if (!Number.isInteger(parsed.w) || parsed.j.length < 4 || parsed.j.length > 32) return null;
    const keys = Object.keys(parsed).sort().join(",");
    if (keys !== "j,k,n,v,w") return null;
    return { v: 1, k: parsed.k, j: parsed.j, w: parsed.w, n: parsed.n };
  } catch {
    return null;
  }
}

export function readToken(token: string, expected: TokenKind): { payload: TokenPayload; body: string } | { failure: TokenFailure } {
  const prefix = PREFIX[expected];
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== prefix) return { failure: "mal_formado" };
  const payload = decodePayload(parts[1]);
  if (!payload || payload.k !== expected) return { failure: "mal_formado" };
  return { payload, body: parts[1] };
}

export function verifySignature(key: Buffer, token: string, expected: TokenKind): { payload: TokenPayload } | { failure: TokenFailure } {
  const read = readToken(token, expected);
  if ("failure" in read) return read;
  const parts = token.split(".");
  const actual = Buffer.from(parts[2], "base64url");
  const expectedMac = createHmac("sha256", key).update(read.body).digest().subarray(0, 16);
  if (actual.length !== expectedMac.length || !timingSafeEqual(actual, expectedMac)) return { failure: "firma_invalida" };
  return { payload: read.payload };
}

/** Acepta la ventana actual y la anterior (desfase de reloj de hasta 30 s). */
export function windowFresh(tokenWindow: number, nowMs: number): boolean {
  const current = timeWindow(nowMs);
  return tokenWindow === current || tokenWindow === current - 1;
}

export function backupCode(key: Buffer, nowMs: number): string {
  return hotp(key, timeWindow(nowMs));
}

export function backupCodeMatches(key: Buffer, code: string, nowMs: number): boolean {
  const clean = code.replace(/\D/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const current = timeWindow(nowMs);
  return safeEqualCode(clean, hotp(key, current)) || safeEqualCode(clean, hotp(key, current - 1));
}

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha256", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

function safeEqualCode(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function hashOtp(dealId: string, code: string): string {
  const pepper = process.env.QR_MASTER_KEY;
  const material = `${dealId}:${code}`;
  if (pepper && pepper.length >= 32) return createHmac("sha256", pepper).update(material).digest("hex");
  return createHash("sha256").update(`trato-otp:${material}`).digest("hex");
}

export function newOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
