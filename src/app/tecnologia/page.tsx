import type { Metadata } from "next";
import Link from "next/link";
import { AutomationBoardDemo, TraceAutomationDemo } from "@/components/TraceAutomationDemo";
import { BRAND } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Tecnología y automatización",
  description:
    "Cómo Carga360go automatiza el costo del flete, el calce técnico y la trazabilidad de cada operación. Controles de seguridad reales de la plataforma.",
  alternates: { canonical: "/tecnologia" },
};

const SECURITY = [
  {
    title: "HTTPS y cookies seguras",
    text: "El sitio público corre por HTTPS. En producción, COOKIE_SECURE marca las cookies de sesión solo para conexiones seguras.",
  },
  {
    title: "Política de seguridad de contenidos (CSP)",
    text: "Next.js declara Content-Security-Policy: scripts y recursos acotados al propio origen y a analítica autorizada.",
  },
  {
    title: "Roles y acceso",
    text: "Cuentas de mandante, transportista y administrador. El panel y las acciones sensibles respetan el rol de la sesión.",
  },
  {
    title: "Verificación de documentos",
    text: "Un administrador revisa contacto y, en transportistas, documentos vigentes. Ver /como-verificamos. No es sello ISO ni SOC 2.",
  },
  {
    title: "Protección de datos de contacto",
    text: "WhatsApp, correo y teléfono no se muestran en el listado hasta adjudicar una oferta; entonces solo entre las dos partes.",
  },
  {
    title: "Aceptación de privacidad y términos",
    text: "Las cuentas con sesión deben aceptar las versiones vigentes antes de seguir usando la plataforma.",
  },
];

export default function TecnologiaPage() {
  return (
    <>
      <section className="hero hero2 hero-v2 tech-hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="brand-hero">Carga360go</p>
            <h1>Tecnología para trazabilidad y automatización</h1>
            <p>
              Una torre de control propia: publicar, calzar, seguir y comprobar. {BRAND.company} · RUT {BRAND.rut}.
            </p>
            <div className="cta">
              <Link className="btn" href="/cargas/nueva">
                Publicar una carga
              </Link>
              <Link className="btn ghost" href="/como-verificamos">
                Cómo verificamos
              </Link>
            </div>
          </div>
          <aside className="tower-board" aria-label="Resumen tecnológico">
            <div className="tower-head">
              <span className="dot-live" /> Capas de la plataforma
            </div>
            <ol className="tower-steps">
              <li>
                <span className="tower-n">01</span>
                <div>
                  <strong>Motor de costos</strong>
                  <p>Ruta, peajes por ejes, diésel y operación — referencial y desglosado.</p>
                </div>
              </li>
              <li>
                <span className="tower-n">02</span>
                <div>
                  <strong>Carga360 Match</strong>
                  <p>Calce técnico por equipo, capacidad, medidas, ruta y fechas.</p>
                </div>
              </li>
              <li>
                <span className="tower-n">03</span>
                <div>
                  <strong>Eventos de viaje</strong>
                  <p>Publicación, ofertas, adjudicación y estado, con fecha y hora.</p>
                </div>
              </li>
              <li>
                <span className="tower-n">04</span>
                <div>
                  <strong>Agente Carga360go</strong>
                  <p>Voz y texto en el navegador (Web Speech API), sin claves de pago.</p>
                </div>
              </li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <h2>Demo de trazabilidad</h2>
          <p className="lead">
            Recorre un flujo de ejemplo. Todo lo que ves abajo está marcado como <strong>Demostración</strong>.
          </p>
          <TraceAutomationDemo />
        </div>
      </section>

      <section className="block alt">
        <div className="wrap">
          <h2>Demo de automatización</h2>
          <p className="lead">El mismo eje operativo de la home, en cuatro pasos ilustrativos.</p>
          <AutomationBoardDemo />
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <h2>Seguridad: controles reales</h2>
          <p className="lead">
            Solo listamos mecanismos que existen en el código de Carga360go. No mostramos sellos ISO, SOC 2 ni logos de
            terceros. Algunas certificaciones externas pueden estar <em>en proceso</em> sin comprometer un resultado.
          </p>
          <div className="sec-grid">
            {SECURITY.map((item) => (
              <article key={item.title} className="sec-card">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <p className="notice" style={{ marginTop: 16 }}>
            <strong>En proceso (opcional):</strong> evaluaciones o certificaciones externas adicionales. Mientras no
            estén cerradas, no se exhiben logos ni se afirman como vigentes.
          </p>
        </div>
      </section>

      <section className="block alt">
        <div className="wrap">
          <div className="cta-band">
            <h2>Ver la plataforma en acción</h2>
            <p>Publica una carga o un camión, o habla con el Agente Carga360go desde cualquier página pública.</p>
            <div className="cta">
              <Link className="btn" href="/registro">
                Crear cuenta
              </Link>
              <Link className="btn ghost" href="/">
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
