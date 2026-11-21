import { diditConfigured, kycEnabled } from "../kyc/config";
import { lastDiesel } from "../costos/diesel";
import { getDb } from "../db";
import { emailChannelReady } from "../notify";
import { isLoadListedPublicly } from "../listings";
import { configStatus } from "../pagos/config";
import { hubspotPortalId } from "../hubspot";
import { canSend } from "../whatsapp/config";
import { botGloballyEnabled } from "../whatsapp/store";
import { adminMetrics } from "../metrics";
import { vistaCentro } from "../bassam/centro";
import type { PublicUser } from "../types";

export type EstadoAutomatizacion = "Configurado" | "Sin configurar" | "Probada en test" | "No disponible" | "Apagado";

export type PasoFlujo = { id: string; titulo: string; valor: string; nota: string };

export type PanelOrbita = {
  kpis: { etiqueta: string; valor: string; nota: string }[];
  flujo: PasoFlujo[];
  automatizaciones: { nombre: string; estado: EstadoAutomatizacion; nota: string }[];
  costos: { diesel: string; peajes: string };
};

function marca(n: number | null): string {
  if (n === null || !Number.isInteger(n) || n <= 0) return "--";
  return String(n);
}

function contar(sql: string): number | null {
  try {
    const row = getDb().prepare(sql).get() as { n: number } | undefined;
    return row && Number.isInteger(row.n) ? row.n : null;
  } catch {
    return null;
  }
}

function tabla(nombre: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nombre));
}

/** KPIs, flujo y automatizaciones leídos de la base y de la configuración. Cero no se muestra como cifra. */
export function panelOrbita(user: PublicUser): PanelOrbita {
  if (user.role !== "admin") throw new Error("Solo administración.");
  const centro = vistaCentro();
  const metricas = adminMetrics();
  const abiertas = getDb()
    .prepare(
      `SELECT COALESCE(status, 'abierta') AS status, offers_until AS offersUntil, pickup_date AS pickupDate
       FROM loads WHERE COALESCE(is_demo, 0) = 0`,
    )
    .all() as { status: string; offersUntil: string | null; pickupDate: string }[];
  const activas = abiertas.filter((load) => {
    const status: "abierta" | "adjudicada" | "cerrada" =
      load.status === "adjudicada" || load.status === "cerrada" ? load.status : "abierta";
    return isLoadListedPublicly({ status, offersUntil: load.offersUntil, pickupDate: load.pickupDate });
  }).length;
  const solicitudes = contar(`SELECT COUNT(*) AS n FROM offers WHERE status = 'activa'`);
  const transportistas = contar(`SELECT COUNT(*) AS n FROM users WHERE role = 'transportista'`);
  const clientes = contar(`SELECT COUNT(*) AS n FROM users WHERE role = 'mandante'`);
  const enRuta = tabla("trip_gps_points")
    ? contar(`SELECT COUNT(DISTINCT l.id) AS n FROM loads l JOIN trip_gps_points g ON g.load_id = l.id WHERE l.trip_status IN ('en_camino', 'retirado', 'en_transito') AND COALESCE(l.is_demo, 0) = 0`)
    : null;
  const entregas = contar(`SELECT COUNT(*) AS n FROM loads WHERE trip_status = 'entregado' AND COALESCE(is_demo, 0) = 0`);
  const validacion = contar(`SELECT COUNT(*) AS n FROM users WHERE verification_status = 'pendiente' AND role != 'admin'`);
  const asignadas = contar(`SELECT COUNT(*) AS n FROM loads WHERE trip_status = 'asignado' AND COALESCE(is_demo, 0) = 0`);
  const ruta = contar(`SELECT COUNT(*) AS n FROM loads WHERE trip_status IN ('en_camino', 'retirado', 'en_transito') AND COALESCE(is_demo, 0) = 0`);
  const cerradas = contar(`SELECT COUNT(*) AS n FROM loads WHERE status = 'cerrada' AND COALESCE(is_demo, 0) = 0`);
  let dieselTexto = "Sin datos de diésel.";
  try {
    const diesel = lastDiesel("Metropolitana");
    if (diesel.price) dieselTexto = `Diésel Metropolitana: ${diesel.price} (${diesel.sourceLabel}, ${diesel.fetchedAt?.slice(0, 10) ?? "sin fecha"}).`;
  } catch {
    dieselTexto = "Sin datos de diésel.";
  }
  const peajes = tabla("cost_toll_plazas") ? contar(`SELECT COUNT(*) AS n FROM cost_toll_plazas`) : null;
  const mercadoPago = configStatus();
  const mercadoPagoEstado = !mercadoPago.enabled ? "Apagado" : mercadoPago.missing.length === 0 ? "Configurado" : "Sin configurar";
  const didit = diditConfigured();
  const diditListo = didit.apiKey && didit.workflow && didit.webhookSecret;

  return {
    kpis: [
      { etiqueta: "Cargas activas", valor: marca(activas), nota: `Centro: ${centro.viajes}. Métrica de cargas: ${metricas.loads}.` },
      { etiqueta: "Solicitudes", valor: marca(solicitudes), nota: "Ofertas activas, todavía sin decisión." },
      { etiqueta: "Transportistas", valor: marca(transportistas), nota: "Cuentas con rol transportista." },
      { etiqueta: "Clientes", valor: marca(clientes), nota: `Mandantes. Centro de clientes: ${centro.clientes}.` },
      { etiqueta: "En ruta con GPS", valor: marca(enRuta), nota: "Viajes en ruta que ya tienen un punto guardado. Sin puntos: sin datos." },
      { etiqueta: "Entregas", valor: marca(entregas), nota: "Viajes con estado entregado. No incluye demostraciones." },
    ],
    flujo: [
      { id: "solicitud", titulo: "Solicitud", valor: marca(activas), nota: "Cargas abiertas, con plazo vigente y retiro no vencido." },
      { id: "validacion", titulo: "Validación", valor: marca(validacion), nota: "Cuentas pendientes de revisión. Autorizar o rechazar está en esta misma página." },
      { id: "asignacion", titulo: "Asignación", valor: marca(asignadas), nota: "Cargas adjudicadas en estado asignado." },
      { id: "ruta", titulo: "En ruta", valor: marca(ruta), nota: "En camino, retirado o en tránsito." },
      { id: "entrega", titulo: "Entrega", valor: marca(entregas), nota: "Estado entregado." },
      { id: "qr", titulo: "Entrega con QR", valor: "No disponible", nota: "El retiro con QR no está en producción." },
      { id: "cierre", titulo: "Cierre", valor: marca(cerradas), nota: "Cargas con estado cerrada." },
    ],
    automatizaciones: [
      { nombre: "Correo", estado: emailChannelReady() ? "Configurado" : "Sin configurar", nota: "SMTP presente no equivale a un envío probado." },
      { nombre: "WhatsApp", estado: canSend() && botGloballyEnabled() ? "Configurado" : "Sin configurar", nota: "Credenciales y flujo son configuración. No hay prueba de recepción en este panel." },
      { nombre: "Didit", estado: diditListo && kycEnabled() ? "Configurado" : "Sin configurar", nota: kycEnabled() ? "Identidad encendida." : "El flag de identidad está apagado." },
      { nombre: "HubSpot", estado: /^\d+$/.test(hubspotPortalId()) ? "Configurado" : "Sin configurar", nota: "El portal está definido. Este panel no comprueba una visita." },
      { nombre: "Mercado Pago", estado: mercadoPagoEstado, nota: mercadoPago.missing.length ? "El cobro está marcado, pero faltan credenciales. No se muestran los valores." : "Solo el estado del cobro. El pago entre las partes no pasa por aquí mientras esté apagado." },
      { nombre: "GPS", estado: "Probada en test", nota: "Hay API para un viaje autorizado. No está operativa en terreno." },
      { nombre: "OCR", estado: "No disponible", nota: "No hay lectura automática de documentos en producción." },
    ],
    costos: {
      diesel: dieselTexto,
      peajes: peajes && peajes > 0 ? `${peajes} plazas de peaje guardadas. El desglose está en Costos.` : "Sin datos de peajes en esta vista. El desglose está en Costos.",
    },
  };
}
