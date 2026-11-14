import { randomBytes, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { audit } from "../audit";
import { getDb } from "../db";
import { maxUploadBytes, resolveStored } from "../documents";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { installmentCharge, splitFreight } from "./amounts";
import { addBusinessHours } from "./business-hours";
import { liveModeAllowed, mpCredentials, mpEnv, notificationUrlForPreference, paymentRules, publicBaseUrl } from "./config";
import { decryptToken, encryptToken, sha256Hex } from "./crypto";
import { createPreference, getPayment, MpError, refreshTokens, refundPayment, type MpPayment, type OAuthTokens } from "./mp-client";
import { ensurePaymentsSchema } from "./schema";
import {
  assertTransition,
  canTransition,
  checkoutAllowed,
  installmentStatusFromMp,
  shouldApplyInstallment,
  TransitionError,
  type Actor,
  type FreightStatus,
  type InstallmentKind,
  type InstallmentStatus,
} from "./state";
import type { MpNotification } from "./webhook";

/* ------------------------------------------------------------------ utilidades */

function db() {
  const database = getDb();
  ensurePaymentsSchema(database);
  return database;
}

const nowIso = () => new Date().toISOString();

function transition(fp: FreightRow, to: FreightStatus, actor: Actor, extra: Record<string, unknown> = {}) {
  try {
    assertTransition(fp.status, to, actor);
  } catch (error) {
    if (error instanceof TransitionError) throw new AppError("Esta acción no corresponde al estado actual del flete.", 409, "estado_invalido");
    throw error;
  }
  const sets = ["status = ?", "updated_at = ?", ...Object.keys(extra).map((key) => `${key} = ?`)];
  const changed = db()
    .prepare(`UPDATE freight_payments SET ${sets.join(", ")} WHERE id = ? AND status = ?`)
    .run(to, nowIso(), ...Object.values(extra), fp.id, fp.status);
  if (changed.changes !== 1) throw new AppError("El flete cambió mientras se procesaba. Intenta de nuevo.", 409, "concurrencia");
}

/* ------------------------------------------------------------------ cuentas MP */

type AccountRow = {
  id: string;
  user_id: string;
  provider: string;
  mp_user_id: string | null;
  mp_public_key: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  scope: string | null;
  live_mode: number;
  expires_at: string | null;
  status: "pending" | "active" | "renewal_failed" | "revoked";
  tax_ready: number;
  connected_at: string | null;
  updated_at: string;
  revoked_at: string | null;
};

export type AccountView = {
  connected: boolean;
  status: AccountRow["status"] | "sin_conectar";
  mpUserIdMasked: string | null;
  expiresAt: string | null;
  expiresSoon: boolean;
  taxReady: boolean;
  liveMode: boolean;
  usable: boolean;
};

function accountRow(userId: string): AccountRow | undefined {
  return db().prepare(`SELECT * FROM payment_accounts WHERE user_id = ? AND provider = 'mercadopago'`).get(userId) as AccountRow | undefined;
}

export function accountUsable(row: AccountRow | undefined, now = new Date()): boolean {
  if (!row || row.status !== "active" || !row.access_token_encrypted || !row.tax_ready) return false;
  if (!row.expires_at || new Date(row.expires_at).getTime() <= now.getTime()) return false;
  // Nunca mezclar entornos: en producción solo sirven tokens productivos (ver liveModeAllowed para el modo prueba).
  return liveModeAllowed(Boolean(row.live_mode));
}

function mask(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? "****" : `${"*".repeat(Math.min(value.length - 4, 8))}${value.slice(-4)}`;
}

/** Vista sin tokens (spec §10 GET /api/pagos/cuenta). */
export function accountView(userId: string, now = new Date()): AccountView {
  const row = accountRow(userId);
  if (!row) {
    return { connected: false, status: "sin_conectar", mpUserIdMasked: null, expiresAt: null, expiresSoon: false, taxReady: false, liveMode: false, usable: false };
  }
  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  return {
    connected: row.status === "active",
    status: row.status,
    mpUserIdMasked: mask(row.mp_user_id),
    expiresAt: row.expires_at,
    expiresSoon: row.status === "active" && expiresMs - now.getTime() < 30 * 24 * 3600 * 1000,
    taxReady: Boolean(row.tax_ready),
    liveMode: Boolean(row.live_mode),
    usable: accountUsable(row, now),
  };
}

const STATE_TTL_MS = 10 * 60 * 1000;

/** Crea un `state` opaco de un solo uso, atado al usuario. Solo se guarda su hash. */
export function createOAuthState(user: PublicUser): string {
  if (user.role !== "transportista") throw new AppError("Solo un transportista puede conectar Mercado Pago.", 403);
  const state = randomBytes(32).toString("base64url");
  const created = nowIso();
  const database = db();
  database.prepare(`DELETE FROM payment_oauth_states WHERE expires_at <= ? OR used_at IS NOT NULL`).run(created);
  database
    .prepare(`INSERT INTO payment_oauth_states (id, state_hash, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)`)
    .run(randomUUID(), sha256Hex(state), user.id, new Date(Date.now() + STATE_TTL_MS).toISOString(), created);
  return state;
}

/** Consume el `state`: válido, no vencido, no usado y del mismo usuario de la sesión. */
export function consumeOAuthState(state: string | null, userId: string | null): boolean {
  if (!state || !userId || state.length > 200) return false;
  const changed = db()
    .prepare(`UPDATE payment_oauth_states SET used_at = ? WHERE state_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > ?`)
    .run(nowIso(), sha256Hex(state), userId, nowIso());
  return changed.changes === 1;
}

export function saveOAuthTokens(userId: string, tokens: OAuthTokens) {
  const stamp = nowIso();
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString();
  const values = [
    String(tokens.user_id),
    tokens.public_key ?? null,
    encryptToken(tokens.access_token),
    encryptToken(tokens.refresh_token),
    tokens.scope ?? null,
    tokens.live_mode ? 1 : 0,
    expiresAt,
  ];
  const database = db();
  const existing = accountRow(userId);
  if (existing) {
    database
      .prepare(
        `UPDATE payment_accounts SET mp_user_id = ?, mp_public_key = ?, access_token_encrypted = ?, refresh_token_encrypted = ?, scope = ?,
         live_mode = ?, expires_at = ?, status = 'active', connected_at = ?, updated_at = ?, revoked_at = NULL WHERE id = ?`,
      )
      .run(...values, stamp, stamp, existing.id);
  } else {
    database
      .prepare(
        `INSERT INTO payment_accounts (id, user_id, provider, mp_user_id, mp_public_key, access_token_encrypted, refresh_token_encrypted, scope,
         live_mode, expires_at, status, tax_ready, connected_at, updated_at) VALUES (?, ?, 'mercadopago', ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
      )
      .run(randomUUID(), userId, ...values, stamp, stamp);
  }
  if (!(tokens.scope ?? "").includes("offline_access")) {
    audit(null, "pago.alerta", { type: "usuario", id: userId }, "El scope OAuth no incluye offline_access: no se podrá renovar el token.");
  }
  // Preferencias creadas con un token/app anterior no se pueden reutilizar (mezclar app real y usuarios de prueba
  // termina en el error genérico de Checkout Pro «Oh, no, algo anduvo mal» / 2034 Invalid users involved).
  database
    .prepare(
      `UPDATE freight_payment_installments SET preference_id = NULL, init_point = NULL, preference_created_at = NULL, updated_at = ?
       WHERE status = 'preferencia_creada'
         AND freight_payment_id IN (SELECT id FROM freight_payments WHERE trucker_user_id = ?)`,
    )
    .run(stamp, userId);
}

export function disconnectAccount(user: PublicUser) {
  const row = accountRow(user.id);
  if (!row) throw new AppError("No tienes Mercado Pago conectado.", 404);
  const stamp = nowIso();
  db()
    .prepare(`UPDATE payment_accounts SET status = 'revoked', access_token_encrypted = NULL, refresh_token_encrypted = NULL, revoked_at = ?, updated_at = ? WHERE id = ?`)
    .run(stamp, stamp, row.id);
  audit(user, "pago.cuenta_desconectada", { type: "usuario", id: user.id });
}

export function setTaxReady(user: PublicUser, value: boolean) {
  if (user.role !== "transportista") throw new AppError("Solo para transportistas.", 403);
  const stamp = nowIso();
  const database = db();
  const row = accountRow(user.id);
  if (row) database.prepare(`UPDATE payment_accounts SET tax_ready = ?, updated_at = ? WHERE id = ?`).run(value ? 1 : 0, stamp, row.id);
  else
    database
      .prepare(`INSERT INTO payment_accounts (id, user_id, provider, status, tax_ready, updated_at) VALUES (?, ?, 'mercadopago', 'pending', ?, ?)`)
      .run(randomUUID(), user.id, value ? 1 : 0, stamp);
  audit(user, "pago.declaracion_factura", { type: "usuario", id: user.id }, { taxReady: value });
}

export function revokeByMpUser(mpUserId: string): number {
  const stamp = nowIso();
  return db()
    .prepare(
      `UPDATE payment_accounts SET status = 'revoked', access_token_encrypted = NULL, refresh_token_encrypted = NULL, revoked_at = ?, updated_at = ?
       WHERE mp_user_id = ? AND status <> 'revoked'`,
    )
    .run(stamp, stamp, mpUserId).changes;
}

function sellerToken(row: AccountRow): string {
  if (!row.access_token_encrypted) throw new AppError("La cuenta Mercado Pago del transportista no está activa.", 409, "cuenta_inactiva");
  return decryptToken(row.access_token_encrypted);
}

/* ------------------------------------------------------------------ fletes */

type FreightRow = {
  id: string;
  load_id: string;
  offer_id: string | null;
  shipper_user_id: string;
  trucker_user_id: string;
  payment_account_id: string | null;
  currency: string;
  freight_net_amount: number;
  freight_vat_amount: number;
  freight_gross_amount: number;
  anticipo_percent: number;
  anticipo_amount: number;
  saldo_amount: number;
  fee_payer: "shipper" | "trucker";
  fee_rate_estimate: number;
  vat_rate: number;
  marketplace_fee_amount: number;
  status: FreightStatus;
  live_mode: number;
  pod_submitted_at: string | null;
  dispute_window_ends_at: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
};

type InstallmentRow = {
  id: string;
  freight_payment_id: string;
  kind: InstallmentKind;
  base_amount: number;
  estimated_fee_amount: number;
  charged_amount: number;
  preference_id: string | null;
  init_point: string | null;
  preference_created_at: string | null;
  mp_payment_id: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  external_reference: string;
  status: InstallmentStatus;
  approved_at: string | null;
  refunded_at: string | null;
  refunded_amount: number;
  fee_actual_amount: number | null;
  updated_at: string;
};

function freightRow(id: string): FreightRow | undefined {
  return db().prepare(`SELECT * FROM freight_payments WHERE id = ?`).get(id) as FreightRow | undefined;
}

function installments(fpId: string): InstallmentRow[] {
  return db().prepare(`SELECT * FROM freight_payment_installments WHERE freight_payment_id = ? ORDER BY kind = 'saldo'`).all(fpId) as InstallmentRow[];
}

function installment(fpId: string, kind: InstallmentKind): InstallmentRow {
  const row = db().prepare(`SELECT * FROM freight_payment_installments WHERE freight_payment_id = ? AND kind = ?`).get(fpId, kind) as InstallmentRow | undefined;
  if (!row) throw new AppError("Cuota no encontrada.", 404);
  return row;
}

/**
 * Crea (si no existe) el pago de una carga adjudicada, a partir de la oferta aceptada.
 * No modifica el flujo de adjudicación existente: se invoca cuando una de las partes abre
 * sus pagos con el flag encendido. PROPUESTA: price_clp de la oferta = flete bruto pactado, IVA 0 hasta que el contador defina.
 */
export function ensureFreightPaymentForLoad(loadId: string): FreightRow | null {
  const database = db();
  const existing = database
    .prepare(`SELECT * FROM freight_payments WHERE load_id = ? AND status NOT IN ('cancelada', 'reembolsada') ORDER BY created_at DESC LIMIT 1`)
    .get(loadId) as FreightRow | undefined;
  if (existing) return existing;
  // Si el pago de esta adjudicación ya se canceló (mandante o administrador), no se vuelve a crear solo.
  const cancelled = database
    .prepare(`SELECT 1 FROM freight_payments fp JOIN loads l ON l.id = fp.load_id WHERE fp.load_id = ? AND fp.status = 'cancelada' AND fp.offer_id = l.awarded_offer_id LIMIT 1`)
    .get(loadId);
  if (cancelled) return null;
  const load = database.prepare(`SELECT id, owner_id, status, awarded_offer_id, is_demo FROM loads WHERE id = ?`).get(loadId) as
    | { id: string; owner_id: string; status: string | null; awarded_offer_id: string | null; is_demo: number }
    | undefined;
  if (!load || load.status !== "adjudicada" || !load.awarded_offer_id || load.is_demo) return null;
  const offer = database.prepare(`SELECT id, carrier_id, price_clp, status FROM offers WHERE id = ?`).get(load.awarded_offer_id) as
    | { id: string; carrier_id: string; price_clp: number; status: string }
    | undefined;
  if (!offer || offer.status !== "aceptada" || !Number.isInteger(offer.price_clp) || offer.price_clp <= 0) return null;
  const rules = paymentRules();
  const gross = offer.price_clp;
  const split = splitFreight(gross, rules.anticipoPercent);
  const charge = (base: number) => installmentCharge(base, { feePayer: rules.feePayer, feeRate: rules.feeRateEstimate, vatRate: rules.vatRate });
  const id = randomUUID();
  const stamp = nowIso();
  const account = accountRow(offer.carrier_id);
  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO freight_payments (id, load_id, offer_id, shipper_user_id, trucker_user_id, payment_account_id, currency, freight_net_amount,
         freight_vat_amount, freight_gross_amount, anticipo_percent, anticipo_amount, saldo_amount, fee_payer, fee_rate_estimate, vat_rate,
         marketplace_fee_amount, status, live_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'CLP', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'adjudicada', ?, ?, ?)`,
      )
      .run(
        id,
        load.id,
        offer.id,
        load.owner_id,
        offer.carrier_id,
        account?.id ?? null,
        gross,
        gross,
        rules.anticipoPercent,
        split.anticipo,
        split.saldo,
        rules.feePayer,
        rules.feeRateEstimate,
        rules.vatRate,
        rules.marketplaceFeeAmount,
        mpEnv() === "production" ? 1 : 0,
        stamp,
        stamp,
      );
    for (const kind of ["anticipo", "saldo"] as const) {
      const c = charge(kind === "anticipo" ? split.anticipo : split.saldo);
      database
        .prepare(
          `INSERT INTO freight_payment_installments (id, freight_payment_id, kind, base_amount, estimated_fee_amount, charged_amount, external_reference, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
        )
        .run(randomUUID(), id, kind, c.base, c.estimatedFee, c.charged, `${id}:${kind}`, stamp);
    }
  })();
  audit(null, "pago.flete_creado", { type: "carga", id: load.id }, { freightPaymentId: id, gross });
  return freightRow(id) ?? null;
}

/** Crea los pagos faltantes de las cargas adjudicadas donde el usuario es parte. */
function syncAwardedLoads(user: PublicUser) {
  const database = db();
  const loads =
    user.role === "mandante"
      ? (database.prepare(`SELECT id FROM loads WHERE owner_id = ? AND status = 'adjudicada'`).all(user.id) as { id: string }[])
      : user.role === "transportista"
        ? (database
            .prepare(`SELECT l.id FROM loads l JOIN offers o ON o.id = l.awarded_offer_id WHERE o.carrier_id = ? AND l.status = 'adjudicada'`)
            .all(user.id) as { id: string }[])
        : [];
  for (const load of loads) ensureFreightPaymentForLoad(load.id);
}

export type InstallmentView = {
  kind: InstallmentKind;
  baseAmount: number;
  estimatedFeeAmount: number;
  chargedAmount: number;
  status: InstallmentStatus;
  mpPaymentId: string | null;
  approvedAt: string | null;
  refundedAmount: number;
};

export type FreightView = {
  id: string;
  loadId: string;
  route: string;
  shipperName: string;
  truckerName: string;
  status: FreightStatus;
  currency: string;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  anticipoPercent: number;
  feePayer: "shipper" | "trucker";
  feeRateEstimate: number;
  marketplaceFeeAmount: number;
  podSubmittedAt: string | null;
  disputeWindowEndsAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  installments: InstallmentView[];
  openDispute: boolean;
  truckerAccountUsable: boolean;
};

function view(fp: FreightRow): FreightView {
  const database = db();
  const load = database.prepare(`SELECT origin, destination FROM loads WHERE id = ?`).get(fp.load_id) as { origin: string; destination: string } | undefined;
  const name = (id: string) => (database.prepare(`SELECT razon_social FROM users WHERE id = ?`).get(id) as { razon_social: string } | undefined)?.razon_social ?? "—";
  const open = database.prepare(`SELECT 1 FROM disputes WHERE freight_payment_id = ? AND status IN ('abierta', 'en_mediacion') LIMIT 1`).get(fp.id);
  return {
    id: fp.id,
    loadId: fp.load_id,
    route: load ? `${load.origin} → ${load.destination}` : "Carga eliminada",
    shipperName: name(fp.shipper_user_id),
    truckerName: name(fp.trucker_user_id),
    status: fp.status,
    currency: fp.currency,
    netAmount: fp.freight_net_amount,
    vatAmount: fp.freight_vat_amount,
    grossAmount: fp.freight_gross_amount,
    anticipoPercent: fp.anticipo_percent,
    feePayer: fp.fee_payer,
    feeRateEstimate: fp.fee_rate_estimate,
    marketplaceFeeAmount: fp.marketplace_fee_amount,
    podSubmittedAt: fp.pod_submitted_at,
    disputeWindowEndsAt: fp.dispute_window_ends_at,
    releasedAt: fp.released_at,
    createdAt: fp.created_at,
    installments: installments(fp.id).map((row) => ({
      kind: row.kind,
      baseAmount: row.base_amount,
      estimatedFeeAmount: row.estimated_fee_amount,
      chargedAmount: row.charged_amount,
      status: row.status,
      mpPaymentId: row.mp_payment_id,
      approvedAt: row.approved_at,
      refundedAmount: row.refunded_amount,
    })),
    openDispute: Boolean(open),
    truckerAccountUsable: accountUsable(accountRow(fp.trucker_user_id)),
  };
}

function assertParty(user: PublicUser, fp: FreightRow) {
  if (user.role === "admin") return;
  if (fp.shipper_user_id !== user.id && fp.trucker_user_id !== user.id) throw new AppError("No tienes acceso a este flete.", 403);
}

export function listForUser(user: PublicUser): FreightView[] {
  syncAwardedLoads(user);
  const rows = db()
    .prepare(`SELECT * FROM freight_payments WHERE shipper_user_id = ? OR trucker_user_id = ? ORDER BY created_at DESC LIMIT 200`)
    .all(user.id, user.id) as FreightRow[];
  return rows.map(view);
}

export function detailForUser(user: PublicUser, id: string): FreightView & { evidence: { id: string; kind: string; createdAt: string }[] } {
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  assertParty(user, fp);
  const evidence = db()
    .prepare(`SELECT id, kind, created_at FROM pod_evidence WHERE freight_payment_id = ? ORDER BY created_at`)
    .all(fp.id) as { id: string; kind: string; created_at: string }[];
  return { ...view(fp), evidence: evidence.map((row) => ({ id: row.id, kind: row.kind, createdAt: row.created_at })) };
}

export function estimateFor(user: PublicUser, id: string, kind: InstallmentKind) {
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  assertParty(user, fp);
  const row = installment(fp.id, kind);
  return {
    kind,
    percent: kind === "anticipo" ? fp.anticipo_percent : 100 - fp.anticipo_percent,
    netAmount: fp.freight_net_amount,
    vatAmount: fp.freight_vat_amount,
    baseAmount: row.base_amount,
    estimatedFeeAmount: row.estimated_fee_amount,
    chargedAmount: row.charged_amount,
    feePayer: fp.fee_payer,
    feeRateEstimate: fp.fee_rate_estimate,
    note: "El costo final del medio de pago lo determina Mercado Pago según el medio y el plazo elegidos. No es una tarifa de Carga360go.",
  };
}

const PREFERENCE_REUSE_MS = 24 * 60 * 60 * 1000;

/** Crea o reutiliza la preferencia de Checkout Pro de una cuota (spec §5.2). Solo el mandante del flete. */
export async function checkout(user: PublicUser, id: string, kind: InstallmentKind): Promise<{ url: string; reused: boolean }> {
  if (kind !== "anticipo" && kind !== "saldo") throw new AppError("Cuota no válida.");
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  if (fp.shipper_user_id !== user.id) throw new AppError("Solo el mandante de esta carga puede pagar.", 403);
  const row = installment(fp.id, kind);
  if (!checkoutAllowed(fp.status, kind, row.status)) throw new AppError("Esta cuota no se puede pagar en el estado actual.", 409, "estado_invalido");
  const account = accountRow(fp.trucker_user_id);
  if (!accountUsable(account)) throw new AppError("El transportista aún no tiene Mercado Pago activo para recibir el pago.", 409, "cuenta_transportista");
  const env = mpEnv();
  if (row.status === "preferencia_creada" && row.init_point && row.preference_created_at) {
    const created = new Date(row.preference_created_at).getTime();
    const relinked = account?.connected_at ? new Date(account.connected_at).getTime() : 0;
    // Si el transportista volvió a autorizar la app después de crear la preferencia, hay que emitir una nueva:
    // la anterior puede pertenecer a otra aplicación (p. ej. la app real vs. la de prueba).
    if (Date.now() - created < PREFERENCE_REUSE_MS && created >= relinked) return { url: row.init_point, reused: true };
  }
  const base = publicBaseUrl();
  const back = (status: string) => `${base}/pagos/resultado?status=${status}&fp=${fp.id}&inst=${kind}`;
  const load = db().prepare(`SELECT origin, destination FROM loads WHERE id = ?`).get(fp.load_id) as { origin: string; destination: string } | undefined;
  const percent = kind === "anticipo" ? fp.anticipo_percent : 100 - fp.anticipo_percent;
  const body: Record<string, unknown> = {
    items: [
      {
        id: row.external_reference,
        title: `Flete Carga360go — ${kind} (${percent} %)`,
        description: `${load ? `${load.origin} — ${load.destination}` : "Carga"} · cuota ${kind}`.slice(0, 250),
        quantity: 1,
        currency_id: "CLP",
        unit_price: row.charged_amount,
      },
    ],
    marketplace_fee: fp.marketplace_fee_amount,
    external_reference: row.external_reference,
    back_urls: { success: back("success"), pending: back("pending"), failure: back("failure") },
    auto_return: "approved",
    binary_mode: false,
    statement_descriptor: "CARGA360GO",
    metadata: { freight_payment_id: fp.id, installment: kind, load_id: fp.load_id },
  };
  // En modo prueba, si hay un e-mail de comprador de prueba configurado, va en la preferencia
  // (los ejemplos oficiales de Checkout Pro lo incluyen). Nunca usar el correo de la cuenta staging.
  const testPayerEmail = process.env.MP_TEST_PAYER_EMAIL?.trim();
  if (env === "test" && testPayerEmail) body.payer = { email: testPayerEmail };
  const notificationUrl = notificationUrlForPreference(mpCredentials().notificationUrl);
  if (notificationUrl) body.notification_url = notificationUrl;
  const pref = await createPreference(sellerToken(account!), body, `${row.id}:${Date.now()}`);
  // Con credenciales de prueba APP_USR (cuentas de prueba) el checkout es init_point; sandbox_init_point responde
  // "Hubo un error accediendo a esta página". sandbox_init_point queda solo como respaldo en modo prueba.
  const url = pref.init_point ?? (env === "production" ? undefined : pref.sandbox_init_point);
  if (!url) throw new AppError("Mercado Pago no devolvió el enlace de pago.", 502);
  db()
    .prepare(`UPDATE freight_payment_installments SET preference_id = ?, init_point = ?, preference_created_at = ?, status = 'preferencia_creada', updated_at = ? WHERE id = ?`)
    .run(pref.id, url, nowIso(), nowIso(), row.id);
  audit(user, "pago.checkout_creado", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, kind, charged: row.charged_amount });
  return { url, reused: false };
}

export function markInTransit(user: PublicUser, id: string) {
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  if (fp.trucker_user_id !== user.id) throw new AppError("Solo el transportista del flete.", 403);
  transition(fp, "en_transito", "transportista");
  audit(user, "pago.en_transito", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id });
}

export type PodFile = { kind: "foto_documento" | "firma" | "otro"; name: string; type: string; bytes: Buffer };
const POD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function sniff(bytes: Buffer): string | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

/** POD: al menos una foto del documento de recepción y la firma (archivo o declarada en la foto). */
export function submitPod(user: PublicUser, id: string, files: PodFile[], opts: { signatureInPhoto?: boolean; now?: Date } = {}) {
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  if (fp.trucker_user_id !== user.id) throw new AppError("Solo el transportista del flete puede subir el POD.", 403);
  if (!canTransition(fp.status, "entregada_POD", "transportista")) throw new AppError("El POD no corresponde al estado actual.", 409, "estado_invalido");
  if (files.length === 0 || files.length > 6) throw new AppError("Sube entre 1 y 6 archivos.");
  if (!files.some((file) => file.kind === "foto_documento")) throw new AppError("Falta la foto del documento de recepción firmado.");
  if (!files.some((file) => file.kind === "firma") && !opts.signatureInPhoto) throw new AppError("Falta la firma de quien recibió.");
  const limit = maxUploadBytes();
  for (const file of files) {
    if (file.bytes.length === 0 || file.bytes.length > limit) throw new AppError("Archivo vacío o demasiado grande.");
    const real = sniff(file.bytes);
    if (!real || !POD_TYPES.has(real)) throw new AppError("Solo se aceptan JPG, PNG, WEBP o PDF.");
    file.type = real;
  }
  const now = opts.now ?? new Date();
  const rules = paymentRules();
  const windowEnds = addBusinessHours(now, rules.disputeWindowBusinessHours, rules.holidays).toISOString();
  const dir = path.join("pagos-pod", fp.id);
  fs.mkdirSync(resolveStored(dir), { recursive: true });
  const database = db();
  const stamp = now.toISOString();
  for (const file of files) {
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[file.type] ?? "bin";
    const key = path.join(dir, `${randomUUID()}.${ext}`);
    fs.writeFileSync(resolveStored(key), file.bytes, { mode: 0o600 });
    database
      .prepare(
        `INSERT INTO pod_evidence (id, freight_payment_id, uploaded_by_user_id, kind, storage_key, content_type, size_bytes, checksum_sha256, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), fp.id, user.id, file.kind, key, file.type, file.bytes.length, sha256Hex(file.bytes), opts.signatureInPhoto ? "firma en la foto" : null, stamp);
  }
  transition(fp, "entregada_POD", "transportista", { pod_submitted_at: stamp, dispute_window_ends_at: windowEnds });
  audit(user, "pago.pod_subido", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, files: files.length, windowEnds });
  return { disputeWindowEndsAt: windowEnds };
}

export const DISPUTE_REASONS = ["no_entregada", "danos", "faltante", "retraso", "cobro_incorrecto", "otro"] as const;

export function openDispute(user: PublicUser, id: string, reason: string, comment: string | null, now = new Date()) {
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  const actor = fp.shipper_user_id === user.id ? "mandante" : fp.trucker_user_id === user.id ? "transportista" : null;
  if (!actor) throw new AppError("Solo el mandante o el transportista del flete pueden abrir un reclamo.", 403);
  if (!(DISPUTE_REASONS as readonly string[]).includes(reason)) throw new AppError("Motivo de reclamo no válido.");
  if (fp.status !== "entregada_POD" && fp.status !== "en_transito") throw new AppError("No se puede abrir un reclamo en este estado.", 409, "estado_invalido");
  if (fp.status === "entregada_POD" && (!fp.dispute_window_ends_at || now.getTime() >= new Date(fp.dispute_window_ends_at).getTime())) {
    throw new AppError("La ventana para reclamar ya terminó.", 409, "ventana_cerrada");
  }
  const clean = comment?.trim().slice(0, 1000) || null;
  const database = db();
  database.transaction(() => {
    transition(fp, "en_disputa", actor);
    database
      .prepare(`INSERT INTO disputes (id, freight_payment_id, opened_by_user_id, reason, comment, status, opened_at) VALUES (?, ?, ?, ?, ?, 'abierta', ?)`)
      .run(randomUUID(), fp.id, user.id, reason, clean, now.toISOString());
  })();
  audit(user, "pago.disputa_abierta", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, reason, por: actor });
}

/**
 * El mandante cancela el pago del flete en la plataforma antes de pagar el anticipo.
 * No se permite si el anticipo está aprobado o pendiente en Mercado Pago (ahí solo un administrador, con reembolso).
 * La cancelación no reabre la carga ni cambia la adjudicación: eso queda para una regla de negocio aparte.
 */
export function cancelByShipper(user: PublicUser, id: string, note: string | null) {
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  if (fp.shipper_user_id !== user.id) throw new AppError("Solo el mandante de esta carga puede cancelar el pago.", 403);
  if (fp.status !== "adjudicada") throw new AppError("Solo se puede cancelar antes de pagar el anticipo.", 409, "estado_invalido");
  const anticipo = installment(fp.id, "anticipo");
  if (!["pendiente", "preferencia_creada", "rejected"].includes(anticipo.status)) {
    throw new AppError("El anticipo ya está pagado o en proceso en Mercado Pago. Escríbenos a contacto@carga360go.cl para revisarlo.", 409, "anticipo_en_curso");
  }
  const clean = note?.trim().slice(0, 1000) || null;
  const database = db();
  const stamp = nowIso();
  database.transaction(() => {
    transition(fp, "cancelada", "mandante");
    // Se anula el enlace de pago guardado para que no se vuelva a abrir desde la plataforma.
    database
      .prepare(`UPDATE freight_payment_installments SET preference_id = NULL, init_point = NULL, updated_at = ? WHERE freight_payment_id = ? AND status IN ('pendiente', 'preferencia_creada', 'rejected')`)
      .run(stamp, fp.id);
  })();
  audit(user, "pago.cancelado_mandante", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, note: clean });
}

/* ------------------------------------------------------------------ administración */

export async function adminRefund(admin: PublicUser, id: string, kind: InstallmentKind, amount: number | null) {
  if (admin.role !== "admin") throw new AppError("Solo administradores.", 403);
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  const row = installment(fp.id, kind);
  if (row.status !== "approved" || !row.mp_payment_id) throw new AppError("Esa cuota no tiene un pago aprobado para reembolsar.", 409);
  const pending = row.charged_amount - row.refunded_amount;
  if (amount != null && (!Number.isInteger(amount) || amount <= 0 || amount > pending)) throw new AppError("Monto de reembolso inválido.");
  const account = db().prepare(`SELECT * FROM payment_accounts WHERE user_id = ? AND provider = 'mercadopago'`).get(fp.trucker_user_id) as AccountRow | undefined;
  const key = `${row.id}:refund:${row.refunded_amount}:${amount ?? "total"}`;
  try {
    if (!account) throw new MpError("Sin cuenta del transportista.", 409, "cuenta_inactiva");
    await refundPayment(sellerToken(account), row.mp_payment_id, amount, key);
  } catch (error) {
    audit(admin, "pago.reembolso_fallido", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, kind, code: error instanceof MpError ? error.code : "error" });
    if (canTransition(fp.status, "reembolso_fallido", "admin")) transition(fp, "reembolso_fallido", "admin");
    throw new AppError("Mercado Pago no pudo hacer el reembolso (posible falta de saldo del transportista). Carga360go no cubre esa parte.", 409, "reembolso_fallido");
  }
  const refunded = row.refunded_amount + (amount ?? pending);
  db()
    .prepare(`UPDATE freight_payment_installments SET refunded_amount = ?, refunded_at = ?, status = ?, updated_at = ? WHERE id = ?`)
    .run(refunded, nowIso(), refunded >= row.charged_amount ? "refunded" : row.status, nowIso(), row.id);
  audit(admin, "pago.reembolso", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, kind, amount: amount ?? pending });
  // El estado final del flete lo confirma el webhook + GET; si está en disputa se adelanta según el resultado.
  const fresh = freightRow(fp.id)!;
  if (fresh.status === "en_disputa" || fresh.status === "reembolso_fallido") {
    const totalCharged = installments(fp.id).reduce((sum, item) => sum + (item.status === "approved" || item.status === "refunded" ? item.charged_amount : 0), 0);
    const totalRefunded = installments(fp.id).reduce((sum, item) => sum + item.refunded_amount, 0);
    transition(fresh, totalRefunded >= totalCharged ? "reembolsada" : "reembolso_parcial", "admin");
  }
}

export type Resolution = "liberar" | "reembolso_total" | "reembolso_parcial";

export async function adminResolve(admin: PublicUser, id: string, decision: Resolution, note: string, refund?: { kind: InstallmentKind; amount: number | null }) {
  if (admin.role !== "admin") throw new AppError("Solo administradores.", 403);
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  const clean = note.trim().slice(0, 1000);
  if (!clean) throw new AppError("Escribe la nota de resolución.");
  if (fp.status !== "en_disputa" && fp.status !== "reembolso_fallido") throw new AppError("Este flete no tiene una disputa por resolver.", 409);
  const status = decision === "liberar" ? "resuelta_liberar" : decision === "reembolso_total" ? "resuelta_reembolso" : "resuelta_parcial";
  if (decision === "liberar") {
    const saldo = installment(fp.id, "saldo");
    if (saldo.status !== "approved") throw new AppError("El saldo aún no está pagado y aprobado.", 409);
    transition(fp, "saldo_liberado", "admin", { released_at: nowIso() });
  } else {
    if (!refund) throw new AppError("Indica la cuota y el monto a reembolsar.");
    await adminRefund(admin, id, refund.kind, decision === "reembolso_total" ? null : refund.amount);
  }
  db()
    .prepare(`UPDATE disputes SET status = ?, resolution_note = ?, refund_amount = ?, resolved_at = ? WHERE freight_payment_id = ? AND status IN ('abierta', 'en_mediacion')`)
    .run(status, clean, refund?.amount ?? null, nowIso(), fp.id);
  audit(admin, "pago.disputa_resuelta", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, decision });
}

export function adminList(filter: { status?: string } = {}) {
  const rows = (
    filter.status
      ? db().prepare(`SELECT * FROM freight_payments WHERE status = ? ORDER BY created_at DESC LIMIT 500`).all(filter.status)
      : db().prepare(`SELECT * FROM freight_payments ORDER BY created_at DESC LIMIT 500`).all()
  ) as FreightRow[];
  return rows.map(view);
}

export function adminCounts(now = new Date()) {
  const database = db();
  const count = (sql: string, ...args: unknown[]) => (database.prepare(sql).get(...args) as { n: number }).n;
  const soon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  return {
    saldoPendiente: count(`SELECT COUNT(*) AS n FROM freight_payments WHERE status IN ('anticipo_pagado', 'en_transito', 'entregada_POD')`),
    ventanasPorVencer: count(`SELECT COUNT(*) AS n FROM freight_payments WHERE status = 'entregada_POD' AND dispute_window_ends_at <= ?`, soon),
    disputasAbiertas: count(`SELECT COUNT(*) AS n FROM disputes WHERE status IN ('abierta', 'en_mediacion')`),
    reembolsosFallidos: count(`SELECT COUNT(*) AS n FROM freight_payments WHERE status = 'reembolso_fallido'`),
    firmasInvalidas24h: count(`SELECT COUNT(*) AS n FROM payment_events WHERE signature_valid = 0 AND created_at >= ?`, new Date(now.getTime() - 24 * 3600 * 1000).toISOString()),
  };
}

export function adminEvents(fpId: string | null, limit = 100) {
  const rows = (
    fpId
      ? db().prepare(`SELECT * FROM payment_events WHERE freight_payment_id = ? ORDER BY created_at DESC LIMIT ?`).all(fpId, limit)
      : db().prepare(`SELECT * FROM payment_events ORDER BY created_at DESC LIMIT ?`).all(limit)
  ) as { id: string; topic: string; action: string | null; provider_resource_id: string | null; signature_valid: number; result: string; error: string | null; created_at: string }[];
  return rows;
}

/* ------------------------------------------------------------------ webhooks */

/** Guarda la notificación (append-only) y deduplica. Devuelve el id del evento a procesar, o null si es duplicado/no válido. */
export function recordEvent(note: MpNotification, signatureValid: boolean, payloadSanitized: string): { eventId: string | null; duplicate: boolean } {
  const database = db();
  const id = randomUUID();
  if (signatureValid && note.eventId) {
    const dup = database
      .prepare(`SELECT id FROM payment_events WHERE provider = 'mercadopago' AND topic = ? AND provider_event_id = ? AND provider_resource_id IS ? AND signature_valid = 1`)
      .get(note.topic, note.eventId, note.resourceId);
    if (dup) return { eventId: null, duplicate: true };
  }
  database
    .prepare(
      `INSERT INTO payment_events (id, provider, topic, action, provider_event_id, provider_resource_id, payload_sanitized, signature_valid, result, created_at)
       VALUES (?, 'mercadopago', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, note.topic, note.action, note.eventId, note.resourceId, payloadSanitized, signatureValid ? 1 : 0, signatureValid ? "pending" : "rejected", nowIso());
  return { eventId: signatureValid ? id : null, duplicate: false };
}

function finishEvent(eventId: string, result: "applied" | "ignored" | "error", extra: { fpId?: string | null; instId?: string | null; error?: string } = {}) {
  db()
    .prepare(`UPDATE payment_events SET result = ?, processed_at = ?, freight_payment_id = COALESCE(?, freight_payment_id), installment_id = COALESCE(?, installment_id), error = ? WHERE id = ?`)
    .run(result, nowIso(), extra.fpId ?? null, extra.instId ?? null, extra.error?.slice(0, 300) ?? null, eventId);
}

/** Aplica el estado de un pago leído de la API (fuente de verdad). Idempotente y tolerante a eventos fuera de orden. */
export function applyPayment(payment: MpPayment, account: AccountRow): { fpId: string; instId: string; result: "applied" | "ignored" } {
  const ref = payment.external_reference ?? "";
  const row = db().prepare(`SELECT * FROM freight_payment_installments WHERE external_reference = ?`).get(ref) as InstallmentRow | undefined;
  if (!row) throw new Error("external_reference desconocida");
  const fp = freightRow(row.freight_payment_id)!;
  if (fp.trucker_user_id !== account.user_id || String(payment.collector_id ?? account.mp_user_id) !== account.mp_user_id) throw new Error("el cobrador no coincide con el transportista");
  if (payment.currency_id && payment.currency_id !== "CLP") throw new Error("moneda inesperada");
  if (payment.live_mode != null && !liveModeAllowed(Boolean(payment.live_mode))) throw new Error("entorno mezclado (live_mode)");
  const incoming = installmentStatusFromMp(payment.status);
  if (!incoming) return { fpId: fp.id, instId: row.id, result: "ignored" };
  if (incoming === "approved" && payment.transaction_amount != null && Math.round(payment.transaction_amount) !== row.charged_amount) {
    throw new Error("monto aprobado distinto al calculado en servidor");
  }
  const paymentId = String(payment.id);
  // Otro intento distinto ya aprobado: no se pisa (lo revisa un admin).
  if (row.mp_payment_id && row.mp_payment_id !== paymentId && row.status === "approved") {
    audit(null, "pago.alerta", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, motivo: "segundo pago para una cuota ya aprobada", paymentId });
    return { fpId: fp.id, instId: row.id, result: "ignored" };
  }
  const sameAttempt = !row.mp_payment_id || row.mp_payment_id === paymentId;
  const apply = sameAttempt ? shouldApplyInstallment(row.status, incoming) : incoming !== "rejected";
  if (!apply) return { fpId: fp.id, instId: row.id, result: "ignored" };
  const fee = (payment.fee_details ?? []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const stamp = nowIso();
  const database = db();
  database.transaction(() => {
    database
      .prepare(
        `UPDATE freight_payment_installments SET mp_payment_id = ?, mp_status = ?, mp_status_detail = ?, status = ?,
         approved_at = COALESCE(approved_at, ?), fee_actual_amount = COALESCE(?, fee_actual_amount),
         refunded_amount = CASE WHEN ? = 'refunded' THEN charged_amount ELSE refunded_amount END,
         refunded_at = CASE WHEN ? = 'refunded' THEN ? ELSE refunded_at END, updated_at = ? WHERE id = ?`,
      )
      .run(paymentId, payment.status, payment.status_detail ?? null, incoming, incoming === "approved" ? payment.date_approved ?? stamp : null, fee || null, incoming, incoming, stamp, stamp, row.id);
    const current = freightRow(fp.id)!;
    if (incoming === "approved" && row.kind === "anticipo" && current.status === "adjudicada") transition(current, "anticipo_pagado", "webhook");
    if (incoming === "approved" && current.status === "cancelada") {
      audit(null, "pago.alerta", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, motivo: "pago aprobado en un flete cancelado: revisar reembolso", paymentId });
    }
    if (incoming === "refunded" && (current.status === "en_disputa" || current.status === "reembolso_fallido")) {
      const all = installments(fp.id);
      const paid = all.filter((item) => item.status === "approved").length;
      transition(current, paid === 0 ? "reembolsada" : "reembolso_parcial", "webhook");
    }
    if (incoming === "charged_back") {
      database
        .prepare(`INSERT INTO disputes (id, freight_payment_id, opened_by_user_id, reason, comment, status, opened_at) VALUES (?, ?, NULL, 'contracargo', ?, 'abierta', ?)`)
        .run(randomUUID(), fp.id, `Contracargo del pago ${paymentId}`, stamp);
      if (canTransition(current.status, "en_disputa", "webhook")) transition(current, "en_disputa", "webhook");
    }
  })();
  if (incoming === "charged_back") audit(null, "pago.contracargo", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, paymentId });
  return { fpId: fp.id, instId: row.id, result: "applied" };
}

const DEAUTH = /deauthoriz|unlink|revoke|delete|desvincul/i;

/** Procesa un evento ya verificado. Consulta la API de MP (no confía en el cuerpo). Nunca lanza. */
export async function processEvent(eventId: string, note: MpNotification) {
  try {
    if (note.topic === "mp-connect") {
      if (note.mpUserId && DEAUTH.test(note.action ?? "")) {
        const n = revokeByMpUser(note.mpUserId);
        audit(null, "pago.cuenta_revocada_mp", { type: "usuario" }, { cuentas: n });
        return finishEvent(eventId, "applied");
      }
      return finishEvent(eventId, "ignored");
    }
    if (note.topic === "topic_chargebacks_wh" || note.topic === "topic_claims_integration_wh") {
      audit(null, "pago.alerta", { type: "pago" }, { topic: note.topic, resource: note.resourceId, action: note.action });
      // El cambio de estado llega por el tópico payment (status charged_back/refunded) tras el GET del pago.
      return finishEvent(eventId, "ignored");
    }
    if (note.topic !== "payment") return finishEvent(eventId, "ignored");
    if (!note.resourceId || !note.mpUserId) return finishEvent(eventId, "error", { error: "sin data.id o user_id" });
    const account = db().prepare(`SELECT * FROM payment_accounts WHERE mp_user_id = ? AND provider = 'mercadopago'`).get(note.mpUserId) as AccountRow | undefined;
    if (!account || !account.access_token_encrypted) return finishEvent(eventId, "error", { error: "cuenta del vendedor no encontrada o revocada" });
    const payment = await getPayment(sellerToken(account), note.resourceId);
    const out = applyPayment(payment, account);
    finishEvent(eventId, out.result, { fpId: out.fpId, instId: out.instId });
  } catch (error) {
    const message = error instanceof MpError ? `${error.code}` : error instanceof Error ? error.message : "error";
    finishEvent(eventId, "error", { error: message });
  }
}

/* ------------------------------------------------------------------ jobs */

/** Pasa a saldo_liberado: POD hecho, ventana vencida, sin disputa abierta y saldo aprobado. */
export function closeWindows(now = new Date()): number {
  const rows = db()
    .prepare(
      `SELECT fp.* FROM freight_payments fp JOIN freight_payment_installments s ON s.freight_payment_id = fp.id AND s.kind = 'saldo'
       WHERE fp.status = 'entregada_POD' AND fp.dispute_window_ends_at <= ? AND s.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d.freight_payment_id = fp.id AND d.status IN ('abierta', 'en_mediacion'))`,
    )
    .all(now.toISOString()) as FreightRow[];
  let n = 0;
  for (const fp of rows) {
    try {
      transition(fp, "saldo_liberado", "job", { released_at: now.toISOString() });
      audit(null, "pago.saldo_liberado", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id });
      n += 1;
    } catch {
      // cambió en paralelo; se reintenta en la próxima pasada
    }
  }
  return n;
}

/** Renueva tokens que vencen en 30 días o menos. Cada renovación trae un refresh_token nuevo. */
export async function renewTokens(now = new Date()): Promise<{ renewed: number; failed: number }> {
  const limit = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
  const rows = db()
    .prepare(`SELECT * FROM payment_accounts WHERE status = 'active' AND refresh_token_encrypted IS NOT NULL AND expires_at <= ?`)
    .all(limit) as AccountRow[];
  let renewed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const tokens = await refreshTokens(decryptToken(row.refresh_token_encrypted!));
      saveOAuthTokens(row.user_id, tokens);
      renewed += 1;
    } catch {
      db().prepare(`UPDATE payment_accounts SET status = 'renewal_failed', updated_at = ? WHERE id = ?`).run(nowIso(), row.id);
      audit(null, "pago.renovacion_fallida", { type: "usuario", id: row.user_id });
      failed += 1;
    }
  }
  return { renewed, failed };
}

export function adminCancel(admin: PublicUser, id: string, note: string) {
  if (admin.role !== "admin") throw new AppError("Solo administradores.", 403);
  const fp = freightRow(id);
  if (!fp) throw new AppError("Flete no encontrado.", 404);
  const clean = note.trim().slice(0, 1000);
  if (!clean) throw new AppError("Escribe el motivo de la cancelación.");
  transition(fp, "cancelada", "admin");
  audit(admin, "pago.cancelado", { type: "carga", id: fp.load_id }, { freightPaymentId: fp.id, note: clean });
}
