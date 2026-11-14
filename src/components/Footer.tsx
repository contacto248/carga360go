import Link from "next/link";
import { HelpLauncher } from "@/components/ChatWidget";
import { VoiceAgentLauncher } from "@/components/VoiceAgent";
import { agentEnabled } from "@/lib/agent/config";
import { webChatEnabled } from "@/lib/chat/config";
import { BRAND } from "@/lib/catalog";
import { waLink } from "@/lib/format";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export function Footer() {
  const payments = paymentsLegalPublished();
  const href = waLink(BRAND.whatsapp, BRAND.infoMessage);
  return (
    <>
      <footer className="foot">
        <div className="wrap foot-grid">
          <div className="foot-brand">
            <img className="foot-logo" src="/brand/logo-wordmark.png" alt="Carga360go" width={177} height={40} />
            <p>Bolsa de carga y camiones para transporte de carga general y masiva en las 16 regiones de Chile, de Arica a Punta Arenas.</p>
            <p>
              <strong>Costo real y automático del flete:</strong> ruta, peajes según ejes, diésel y costos operacionales. Trazabilidad
              de cada operación y seguridad en una sola web automatizada.
            </p>
          </div>
          <div>
            <h4>Plataforma</h4>
            <Link href="/cargas">Cargas disponibles</Link>
            <Link href="/camiones">Camiones y retornos</Link>
            <Link href="/cargas/nueva">Publicar carga</Link>
            <Link href="/camiones/nuevo">Publicar camión</Link>
            <Link href="/registro">Crear cuenta</Link>
            <a href={BRAND.whatsappChannel} target="_blank" rel="noopener noreferrer">
              Canal de WhatsApp
            </a>
          </div>
          <div>
            <h4>Herramientas</h4>
            <Link href="/herramientas/calculadora">Calculadora de flete</Link>
            <Link href="/regiones">Panel de regiones</Link>
            <Link href="/panel#alertas">Alertas por correo</Link>
            <Link href="/panel">Mi panel</Link>
          </div>
          <div>
            <h4>Empresa</h4>
            <span>
              Una plataforma de {BRAND.company} · RUT {BRAND.rut}
            </span>
            <a href={href} target="_blank" rel="noopener noreferrer">
              WhatsApp {BRAND.whatsappDisplay}
            </a>
            <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
            <span>{BRAND.address}</span>
            <Link href="/contacto">Contacto</Link>
            <Link href="/como-verificamos">Cómo verificamos</Link>
            <Link href="/transporte-minero-chile">Transporte minero</Link>
            <Link href="/cama-baja-y-maquinaria">Cama baja</Link>
            <Link href="/cargas-de-retorno-mineras">Cargas de retorno</Link>
            <Link href="/terminos">Términos de uso</Link>
            <Link href="/privacidad">Política de privacidad</Link>
            {payments ? <Link href="/politica-de-pagos">Política de pagos</Link> : null}
          </div>
        </div>
        <div className="wrap foot-note">
          Esta plataforma conecta partes y no garantiza la ejecución del transporte. Los costos que muestra son estimaciones calculadas
          con datos de ruta, peajes, diésel y operación; el valor final lo acuerdan las partes.
        </div>
      </footer>
      {agentEnabled() ? <VoiceAgentLauncher waHref={href} /> : <HelpLauncher chatEnabled={webChatEnabled()} waHref={href} />}
    </>
  );
}
