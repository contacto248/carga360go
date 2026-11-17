import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getCurrentUser } from "@/lib/current-user";
import { docsVencimientoEnabled, evaluateAvisosVencimiento } from "@/lib/documentos-vencimiento";

export const dynamic = "force-dynamic";

/** Con el flag apagado la ruta no existe. No envía correo ni WhatsApp. */
export async function POST() {
  if (!docsVencimientoEnabled()) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    return NextResponse.json(evaluateAvisosVencimiento(new Date(), user), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
