import Link from "next/link";
import { HelpLauncher } from "@/components/ChatWidget";
import { webChatEnabled } from "@/lib/chat/config";
import { BRAND } from "@/lib/catalog";
import { waLink } from "@/lib/format";
import { paymentsComingSoon, paymentsLegalPublished } from "@/lib/pagos/config";

export function Footer() {
  const payments = paymentsLegalPublished();
  const comingSoon = paymentsComingSoon();
  const href = waLink(BRAND.whatsapp, BRAND.infoMessage);
  return (
    <>
      <footer className="foot">
        <div className="wrap foot-grid">
          <div className="foot-brand">
            <img className="foot-logo" src="/brand/logo-wordmark.png" alt="Carga360go" width={177} height={40} />
            <p>Bolsa de carga y camiones para transporte de carga general y masiva en las 16 regiones de Chile, de Arica a Punta Arenas.</p>
            <p>
              <strong>Campaña de inscripción:</strong> 30 días gratis por cuenta desde su inscripción; luego membresía (valores por definir)
              con beneficios y convenios. Te avisaremos antes de cualquier cobro. <Link href="/terminos#membresia">Condiciones</Link>
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
            <span>Operamos solo en línea, en Chile.</span>
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
          {payments && comingSoon
            ? "Esta plataforma conecta partes; el pago de fletes con Mercado Pago estará disponible próximamente (ver Política de pagos). Carga360go no custodia el dinero del flete ni garantiza la ejecución del transporte. Los precios sugeridos son referenciales."
            : payments
            ? "Esta plataforma conecta partes; el pago del flete se hace con Mercado Pago directamente al transportista y Carga360go no custodia ese dinero ni garantiza la ejecución del transporte. Los precios sugeridos son referenciales."
            : "Esta plataforma conecta partes; no gestiona pagos ni garantiza la ejecución del transporte. Los precios sugeridos son referenciales."}
        </div>
      </footer>
      <HelpLauncher chatEnabled={webChatEnabled()} waHref={href} />
    </>
  );
}
