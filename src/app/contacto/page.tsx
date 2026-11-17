import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/catalog";
import { waLink } from "@/lib/format";

export const metadata: Metadata = {
  title: "Contacto",
  description: `Contacta a ${BRAND.company} (Carga360go) por WhatsApp ${BRAND.whatsappDisplay} o al correo ${BRAND.email}. Operamos solo en línea, en Chile.`,
  alternates: { canonical: "/contacto" },
};

export default function ContactoPage() {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.company,
    alternateName: BRAND.name,
    url: "https://www.carga360go.cl",
    email: BRAND.email,
    telephone: BRAND.whatsappDisplay,
    taxID: BRAND.rut,
    address: {
      "@type": "PostalAddress",
      addressCountry: "CL",
    },
  };
  return (
    <div className="wrap legal" style={{ paddingBottom: 30 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <div className="page-title">
        <h1>Contacto</h1>
        <p>Te respondemos en horario hábil. Para dudas rápidas, escríbenos por WhatsApp.</p>
      </div>
      <div className="grid c3">
        <div className="card">
          <h3>💬 WhatsApp</h3>
          <p>{BRAND.whatsappDisplay}</p>
          <a className="btn wa sm" href={waLink(BRAND.whatsapp, BRAND.infoMessage)} target="_blank" rel="noopener noreferrer">
            Escribir por WhatsApp
          </a>
        </div>
        <div className="card">
          <h3>✉️ Correo</h3>
          <p>
            <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
          </p>
          <p className="meta">Consultas, reclamos, corrección de datos o solicitudes sobre tus datos personales.</p>
        </div>
        <div className="card">
          <h3>🏢 Empresa</h3>
          <address>
            <strong>{BRAND.company}</strong>
            <br />
            RUT {BRAND.rut}
            <br />
            Operamos solo en línea, en Chile.
          </address>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Preguntas comunes</h3>
        <ul>
          <li>
            ¿No te llegó el correo de confirmación? Revisa spam o pide otro en <Link href="/verificar-correo">Confirmar correo</Link>.
          </li>
          <li>
            ¿Olvidaste tu contraseña? Usa <Link href="/recuperar">Olvidé mi contraseña</Link>.
          </li>
          <li>
            ¿Datos mal escritos (correo, RUT, WhatsApp)? Corrígelos en <Link href="/cuenta-en-revision#mis-datos">Mis datos</Link>.
          </li>
          <li>Cada cuenta tiene 30 días gratis desde su inscripción; luego se cobrará una membresía (valores por definir) con beneficios y convenios. Te avisaremos antes de cualquier cobro. No cobramos comisión por el flete.</li>
        </ul>
      </div>
    </div>
  );
}
