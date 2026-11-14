import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Cifrado en reposo de los tokens OAuth del transportista (AES-256-GCM).
 * Clave: PAYMENTS_TOKEN_ENCRYPTION_KEY (32 bytes en base64 o 64 hex). Formato guardado:
 * v<versión>.<iv b64url>.<tag b64url>.<datos b64url>. La versión permite rotar la clave
 * (PAYMENTS_TOKEN_ENCRYPTION_KEY_PREVIOUS se usa solo para descifrar).
 */
export const TOKEN_KEY_VERSION = 1;

function parseKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");
  const buf = Buffer.from(value, "base64");
  return buf.length === 32 ? buf : null;
}

function currentKey(): Buffer {
  const key = parseKey(process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY);
  if (!key) throw new Error("PAYMENTS_TOKEN_ENCRYPTION_KEY no está configurada (32 bytes en base64 o hex).");
  return key;
}

export function encryptionConfigured(): boolean {
  return parseKey(process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY) !== null;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", currentKey(), iv);
  cipher.setAAD(Buffer.from(`c360-pagos-v${TOKEN_KEY_VERSION}`));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [`v${TOKEN_KEY_VERSION}`, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptToken(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (!version || !iv || !tag || !data || !/^v\d+$/.test(version)) throw new Error("Token cifrado con formato inválido.");
  const keys = [currentKey(), parseKey(process.env.PAYMENTS_TOKEN_ENCRYPTION_KEY_PREVIOUS)].filter((key): key is Buffer => key !== null);
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(`c360-pagos-${version}`));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      // probar la clave anterior
    }
  }
  throw new Error("No se pudo descifrar el token.");
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
