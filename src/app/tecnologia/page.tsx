import type { Metadata } from "next";
import Link from "next/link";
import { AutomationBoardDemo, TraceAutomationDemo } from "@/components/TraceAutomationDemo";
import { TruckArt } from "@/components/TruckArt";
import { BRAND, EQUIPMENT } from "@/lib/catalog";
import { EQUIPMENT_CAPACITY } from "@/lib/equipment-capacity";

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
                  <strong>AI.CARGA360</strong>
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

      {/* Verticales y equipos (movidos desde la portada para acortar el fold). */}
      <section className="block alt" id="verticales" aria-labelledby="verticales-titulo">
        <div className="wrap">
          <h2 id="verticales-titulo">Minería, cama baja y retornos</h2>
          <p className="lead">
            Carga360go está abierta a carga general en todo Chile y se diferencia cuando el viaje pide un equipo concreto
            o un retorno útil. El detalle vive aquí — no en la portada — para mantener un funnel corto.
          </p>
          <div className="focus-links">
            <Link href="/transporte-minero-chile">
              <h3>Transporte minero</h3>
              <p>Cargas, retornos y equipos aptos hacia y desde zonas de operación.</p>
            </Link>
            <Link href="/cama-baja-y-maquinaria">
              <h3>Cama baja y maquinaria</h3>
              <p>Ficha con ejes, ancho, capacidad y medidas, no un listado genérico.</p>
            </Link>
            <Link href="/cargas-de-retorno-mineras">
              <h3>Cargas de retorno</h3>
              <p>Publica el viaje de vuelta y recibe alertas cuando aparezca un calce.</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="block" id="equipos" aria-labelledby="equipos-titulo">
        <div className="wrap">
          <h2 id="equipos-titulo">Equipos con ficha técnica</h2>
          <p className="lead">
            Cada equipo pide los datos que importan: la cama baja pide ejes y ancho; el refrigerado, temperatura; la tolva
            y el estanque, metros cúbicos.
          </p>
          <div className="grid c4 eq-grid" style={{ marginTop: 16 }}>
            {EQUIPMENT.filter((item) => item.id !== "otro").map((item) => (
              <Link key={item.id} href={`/cargas?equipo=${item.id}`} className="card eq-tile">
                <TruckArt id={item.id} />
                <h3>{item.label}</h3>
                <span className="eqcap">{EQUIPMENT_CAPACITY[item.id]}</span>
                <p>{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="block alt">
        <div className="wrap">
          <div className="cta-band">
            <h2>Ver la plataforma en acción</h2>
            <p>Publica una carga o un camión, o habla con AI.CARGA360 desde cualquier página pública.</p>
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
