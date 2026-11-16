import Link from "next/link";
import { VoiceAgentLauncher } from "@/components/VoiceAgent";
import { WhatsAppContactGate } from "@/components/WhatsAppContactGate";
import { BRAND } from "@/lib/catalog";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export function Footer() {
  const payments = paymentsLegalPublished();
  const waNumber = BRAND.whatsapp;
  const waText = BRAND.infoMessage;
  return (
    <>
      <footer className="foot">
        <div className="wrap foot-grid">
          <div className="foot-brand">
            <img className="foot-logo" src="/brand/logo-wordmark.png" alt="Carga360go" width={177} height={40} />
            <p>Bolsa de carga y camiones para transporte de carga general y masiva en las 16 regiones de Chile, de Arica a Punta Arenas.</p>
            <p>
              <strong>Automatización y trazabilidad:</strong> costo real del flete, seguimiento de cada operación y comprobante digital en
              una sola web.
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
            <Link href="/cotizador">Cotizador</Link>
            <Link href="/tecnologia">Tecnología</Link>
            <Link href="/regiones">Panel de regiones</Link>
            <Link href="/panel#alertas">Alertas por correo</Link>
            <Link href="/panel">Mi panel</Link>
          </div>
          <div>
            <h4>Empresa</h4>
            <span>
              Una plataforma de {BRAND.company} · RUT {BRAND.rut}
            </span>
            <WhatsAppContactGate number={waNumber} text={waText} className="foot-wa">
              WhatsApp {BRAND.whatsappDisplay}
            </WhatsAppContactGate>
            <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
            <span>{BRAND.address}</span>
            <Link href="/contacto">Contacto</Link>
            <Link href="/guias">Guías</Link>
            <Link href="/como-verificamos">Cómo verificamos</Link>
            <Link href="/transporte-minero-chile">Transporte minero</Link>
            <Link href="/cama-baja-y-maquinaria">Cama baja</Link>
            <Link href="/cargas-de-retorno">Cargas de retorno</Link>
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
      <VoiceAgentLauncher waNumber={waNumber} waText={waText} />
    </>
  );
}
