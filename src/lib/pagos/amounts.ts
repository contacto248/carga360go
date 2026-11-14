import type { FeePayer } from "./config";

/**
 * Cálculo de montos (spec §5.3). Todo en pesos enteros, en el servidor.
 * PROPUESTA: el anticipo es un porcentaje del flete bruto (neto + IVA); el saldo absorbe el redondeo.
 */
export function splitFreight(grossAmount: number, anticipoPercent: number): { anticipo: number; saldo: number } {
  if (!Number.isInteger(grossAmount) || grossAmount <= 0) throw new Error("El flete debe ser un entero positivo en pesos.");
  if (!Number.isInteger(anticipoPercent) || anticipoPercent < 0 || anticipoPercent > 100) throw new Error("Porcentaje de anticipo inválido.");
  const anticipo = Math.round((grossAmount * anticipoPercent) / 100);
  return { anticipo, saldo: grossAmount - anticipo };
}

/**
 * Total a cobrar por una cuota.
 * - shipper: se recarga para que el transportista reciba la cuota pactada:
 *   total = round(cuota / (1 − tasa × (1 + IVA)))
 * - trucker: se cobra la cuota; la comisión de MP sale del transportista.
 * Es un estimado: la comisión real la define Mercado Pago según medio y plazo.
 */
export function installmentCharge(
  base: number,
  opts: { feePayer: FeePayer; feeRate: number; vatRate: number },
): { base: number; estimatedFee: number; charged: number } {
  if (!Number.isInteger(base) || base < 0) throw new Error("Cuota inválida.");
  const effective = opts.feeRate * (1 + opts.vatRate);
  if (opts.feePayer === "trucker" || base === 0 || effective <= 0) {
    const estimatedFee = Math.round(base * effective);
    return { base, estimatedFee, charged: base };
  }
  if (effective >= 1) throw new Error("Tasa estimada inválida.");
  const charged = Math.round(base / (1 - effective));
  return { base, estimatedFee: charged - base, charged };
}

/** Neto que recibe el transportista, con la comisión real (o estimada) de MP y el marketplace_fee. */
export function truckerNet(charged: number, mpFee: number, marketplaceFee: number): number {
  return charged - mpFee - marketplaceFee;
}
