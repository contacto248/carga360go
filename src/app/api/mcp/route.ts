import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { paymentsEnabled } from "@/lib/pagos/config";
import { canSend, waConfig } from "@/lib/whatsapp/config";
import { webChatEnabled } from "@/lib/chat/config";
import { userFromToken } from "@/lib/auth";
import type { PublicUser } from "@/lib/types";
import { isTripParty } from "@/lib/viaje";

export const dynamic = "force-dynamic";

type Rpc = { jsonrpc?: string; id?: number | string | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

function tokenOk(header: string | null): boolean {
  const expected = (process.env.MCP_TOKEN || "").trim();
  const match = /^Bearer\s+([A-Za-z0-9_\-.~+/=]{20,200})\s*$/i.exec(header || "");
  if (!expected || !match) return false;
  const given = Buffer.from(match[1]);
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

function tool(name: string, description: string) {
  return { name, description, inputSchema: { type: "object", properties: name === "detalle_carga" ? { id: { type: "string" } } : {}, required: name === "detalle_carga" ? ["id"] : [], additionalProperties: false } };
}

function resumen() {
  const db = getDb();
  const counts = db.prepare(`SELECT COALESCE(status, 'abierta') AS status, COUNT(*) AS n FROM loads GROUP BY 1`).all() as { status: string; n: number }[];
  const trips = db.prepare(`SELECT COALESCE(trip_status, 'sin_viaje') AS status, COUNT(*) AS n FROM loads WHERE status = 'adjudicada' GROUP BY 1`).all();
  const wa = waConfig();
  return {
    sitio: "https://www.carga360go.cl",
    cargas: counts,
    viajes: trips,
    chatWeb: webChatEnabled(),
    whatsapp: { puedeEnviar: canSend(), botEncendido: wa.envEnabled, credenciales: canSend() },
    mercadoPago: { cobroEncendido: paymentsEnabled(), credenciales: Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET) },
  };
}

function listar() {
  return getDb()
    .prepare(
      `SELECT id, origin, destination, equipment, pickup_date AS pickupDate, COALESCE(status,'abierta') AS status,
              trip_status AS tripStatus, inmediata, 
              (SELECT COUNT(*) FROM offers o WHERE o.load_id = loads.id AND o.status IN ('activa','aceptada')) AS offerCount
       FROM loads ORDER BY created_at DESC LIMIT 30`,
    )
    .all();
}

/**
 * Sesión de quien pregunta (encabezado X-C360-Session con su token de sesión, el mismo de la app móvil).
 * El MCP_TOKEN solo identifica al cliente MCP, no a la persona: para el detalle de una carga se exige además
 * que la persona sea la dueña, el transportista adjudicado o un administrador.
 */
function requesterFrom(request: Request): PublicUser | null {
  const raw = (request.headers.get("x-c360-session") || "").trim();
  if (!/^[A-Za-z0-9_\-.~+/=]{20,200}$/.test(raw)) return null;
  return userFromToken(raw);
}

const NOT_FOUND = { error: "Carga no encontrada o sin autorización para verla." };

function detalle(id: string, requester: PublicUser | null) {
  // Misma respuesta si no existe o si no es parte: no permite adivinar ids.
  if (!id || !requester || !isTripParty(id, requester)) return NOT_FOUND;
  const load = getDb()
    .prepare(
      `SELECT id, origin, destination, equipment, pickup_date AS pickupDate, weight_t AS weightT,
              COALESCE(status,'abierta') AS status, trip_status AS tripStatus, inmediata, offers_until AS offersUntil
       FROM loads WHERE id = ?`,
    )
    .get(id);
  if (!load) return NOT_FOUND;
  const events = getDb().prepare(`SELECT status, created_at AS createdAt FROM trip_events WHERE load_id = ? ORDER BY created_at`).all(id);
  const rating = getDb().prepare(`SELECT COUNT(*) AS n, ROUND(AVG(stars), 1) AS average FROM ratings WHERE load_id = ?`).get(id);
  return { load, events, rating };
}

function callTool(name: string, args: Record<string, unknown>, requester: PublicUser | null) {
  if (name === "resumen") return resumen();
  if (name === "listar_cargas") return { cargas: listar() };
  if (name === "detalle_carga") return detalle(String(args.id || ""), requester);
  return null;
}

export async function POST(request: Request) {
  if (!tokenOk(request.headers.get("authorization"))) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "No autorizado" } }, { status: 401 });
  }
  let body: Rpc;
  try {
    body = (await request.json()) as Rpc;
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400 });
  }
  const id = body.id ?? null;
  if (!body.method) {
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Solicitud inválida" } }, { status: 400 });
  }
  if (body.id == null && body.method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 202 });
  }
  if (body.method === "initialize") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "carga360go", version: "1.0.0" },
      },
    });
  }
  if (body.method === "ping") return NextResponse.json({ jsonrpc: "2.0", id, result: {} });
  if (body.method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          tool("resumen", "Estado operativo de Carga360go: cargas, viajes, chat, WhatsApp y Mercado Pago. Sin datos personales."),
          tool("listar_cargas", "Últimas 30 cargas con ruta, estado, viaje y cantidad de ofertas. Sin contactos."),
          tool(
            "detalle_carga",
            "Detalle operativo de una carga por id, con historial de viaje y promedio de calificación. Sin contactos. Exige el encabezado X-C360-Session de la dueña, el transportista adjudicado o un administrador.",
          ),
        ],
      },
    });
  }
  if (body.method === "tools/call") {
    const name = body.params?.name || "";
    const data = callTool(name, body.params?.arguments || {}, requesterFrom(request));
    if (!data) {
      return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Herramienta desconocida" } });
    }
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: JSON.stringify(data) }], isError: false },
    });
  }
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Método no encontrado" } });
}
