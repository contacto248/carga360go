import { BRAND } from "@/lib/catalog";

/** Bloque compacto para seguir el canal oficial de WhatsApp. Solo un enlace externo; no toca formularios ni datos. */
export function WhatsAppChannel() {
  return (
    <aside className="wa-channel" aria-label="Canal de WhatsApp de Carga360go">
      <div>
        <strong>Sigue nuestro canal de WhatsApp</strong>
        <span>Novedades de Carga360go, en un canal oficial y gratuito.</span>
      </div>
      <a className="btn sm" href={BRAND.whatsappChannel} target="_blank" rel="noopener noreferrer">
        Seguir el canal
      </a>
    </aside>
  );
}
