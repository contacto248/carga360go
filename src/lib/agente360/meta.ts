import { BRAND } from "../catalog";
import { canSend } from "../whatsapp/config";

export type CanalWhatsapp = { listo: boolean; enlace: string | null };

/** Usa la integración Meta/WhatsApp ya existente. Sin token, el chat sigue y no hay enlace inventado. */
export function canalWhatsapp(): CanalWhatsapp {
  let listo = false;
  try {
    listo = canSend();
  } catch (error) {
    console.error("[carga360go] agente 360go whatsapp", error instanceof Error ? error.message : "error");
    listo = false;
  }
  if (!listo) return { listo: false, enlace: null };
  const numero = BRAND.whatsapp.replace(/\D/g, "");
  return { listo: true, enlace: numero ? `https://wa.me/${numero}` : null };
}
