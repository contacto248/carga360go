import type { Metadata } from "next";
import Link from "next/link";
import { HomeTowerBoard } from "@/components/HomeTowerBoard";
import { WhatsAppChannel } from "@/components/WhatsAppChannel";
import { QuickSearch } from "@/components/QuickSearch";
import { BRAND, equipmentById } from "@/lib/catalog";
import { WhatsAppContactGate } from "@/components/WhatsAppContactGate";
import { formatDateCL } from "@/lib/format";
import { FAQ } from "@/lib/faq";
import { liveStats, recentListings, timeAgo } from "@/lib/stats";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description:
    "Carga360go conecta cargas y camiones en Chile con trazabilidad y automatización. Publica tu carga, encuentra camión, sigue la operación y conserva el comprobante digital.",
};

/** Pasos de operación (torre de control + cómo funciona). */
const FLOW = [
  {
    n: "01",
    title: "Publicar carga",
    text: "Origen, destino, fecha, peso y equipo. El sistema calcula el costo real referencial del flete.",
  },
  {
    n: "02",
    title: "Encontrar camión",
    text: "Carga360 Match compara ruta, fechas y capacidad, y muestra calces con razones claras.",
  },
  {
    n: "03",
    title: "Seguimiento en vivo",
    text: "Eventos registrados con fecha y hora: publicación, ofertas y adjudicación. Sin GPS ni telemetría en vivo.",
  },
  {
    n: "04",
    title: "Comprobante digital",
    text: "El historial queda en la plataforma: trazabilidad de punta a punta, sin papeles sueltos.",
  },
];

/** Cuatro beneficios (copy propio Carga360go, es-CL). */
const BENEFITS = [
  {
    title: "Decide mejor y más rápido",
    text: "Ruta, equipo, fechas y costo referencial a la vista: menos ida y vuelta por WhatsApp y más criterio para adjudicar.",
  },
  {
    title: "Eficiencia operativa",
    text: "Publicar, ofertar y seguir eventos en una sola web. La plataforma hace el trabajo repetitivo; la decisión queda en las partes.",
  },
  {
    title: "Crece con respaldo",
    text: "Cobertura de Arica a Punta Arenas, con foco en minería, cama baja y retornos cuando el viaje pide equipo concreto.",
  },
  {
    title: "Libera recursos y reduce riesgo",
    text: "Contacto protegido hasta adjudicar, cuentas revisadas por un administrador y comprobante digital de cada operación.",
  },
];

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="counter">
      <strong>{value.toLocaleString("es-CL")}</strong>
      <span>{label}</span>
    </div>
  );
}

export default async function HomePage() {
  const whatsappNumber = BRAND.whatsapp;
  const whatsappText = BRAND.infoMessage;
  const stats = liveStats();
  const recent = recentListings(5);
  const visibleCounters: { value: number; label: string }[] = [];
  if (stats.activeLoads > 0) visibleCounters.push({ value: stats.activeLoads, label: "cargas activas" });
  if (stats.activeTrucks > 0) visibleCounters.push({ value: stats.activeTrucks, label: "camiones y retornos" });
  if (stats.matches > 0) visibleCounters.push({ value: stats.matches, label: "calces posibles hoy" });
  if (stats.verifiedCarriers > 0) visibleCounters.push({ value: stats.verifiedCarriers, label: "transportistas verificados" });
  if (stats.regionsActive > 0) visibleCounters.push({ value: stats.regionsActive, label: "regiones con avisos" });

  return (
    <>
      {/* 1. Hero: marca + una idea + torre + un CTA principal */}
      <section className="hero hero2 hero-v2 hero-v3 hero-fold">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="brand-hero" aria-label="Marca">
              Carga360go
            </p>
            <h1>Trazabilidad y automatización para mover carga en Chile</h1>
            <p className="hero-lead">
              Torre de control para publicar, calzar y seguir cargas y camiones — sin fragmentar la operación entre
              planillas y chats.
            </p>
            <p className="hero-cost-line" aria-label="Costo real del flete">
              Costo real automático: ruta · peajes · trazabilidad
            </p>
            <div className="cta">
              <Link className="btn" href="/cargas/nueva">
                Publicar carga
              </Link>
            </div>
            <p className="hero-secondary-links">
              <Link href="/cargas">Soy transportista: encuentra cargas</Link>
              <span aria-hidden="true"> · </span>
              <Link href="/camiones">Soy empresa: encuentra camiones</Link>
              <span aria-hidden="true"> · </span>
              <Link href="/herramientas/calculadora">Calcular un flete referencial</Link>
            </p>
            <p className="hero-legal">
              Carga360go conecta a las partes, con trazabilidad de cada operación. {BRAND.company} · RUT {BRAND.rut}.
            </p>
          </div>
          <HomeTowerBoard steps={FLOW} compact />
        </div>
      </section>

      {/* 2. Cuatro beneficios */}
      <section className="benefits-band" aria-labelledby="beneficios-titulo">
        <div className="wrap">
          <h2 id="beneficios-titulo">Por qué operar en Carga360go</h2>
          <p className="lead">Cuatro resultados concretos para mandantes y transportistas en Chile.</p>
          <ul className="benefits-grid">
            {BENEFITS.map((item) => (
              <li key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. Cómo funciona */}
      <section className="block" aria-labelledby="pasos-titulo">
        <div className="wrap">
          <h2 id="pasos-titulo">Cómo funciona</h2>
          <p className="lead">Cuatro pasos, de la publicación al comprobante digital.</p>
          <ol className="steps-rail">
            {FLOW.map((step) => (
              <li key={step.n}>
                <span className="steps-n">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bolsa reciente */}
      <section className="block home-live-band alt">
        <div className="wrap">
          <QuickSearch />
          <div className="tower-live" style={{ marginTop: 16 }}>
            <div className="lb-head">
              <span>Bolsa reciente</span>
              <Link href="/cargas" className="lb-all">
                Ver todo →
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="lb-empty">
                <strong>Todavía no hay avisos activos.</strong>
                <p>Sé de los primeros en publicar: tu aviso aparece aquí y avisamos a quienes calzan.</p>
                <div className="row">
                  <Link className="btn sm" href="/cargas/nueva">
                    Publicar carga
                  </Link>
                  <Link className="btn sec sm" href="/camiones/nuevo">
                    Publicar camión
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="lb-list">
                {recent.map((item) => {
                  const eq = equipmentById(item.equipment);
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link href={`/${item.kind === "carga" ? "cargas" : "camiones"}/${item.id}`}>
                        <span className={`lb-kind ${item.kind}`}>{item.kind === "carga" ? "Carga" : "Camión"}</span>
                        <span className="lb-route">
                          {item.origin} → {item.destination}
                        </span>
                        <span className="lb-meta">
                          {eq.icon} {eq.label} · {item.amount} · {item.kind === "carga" ? "retiro" : "desde"}{" "}
                          {formatDateCL(item.date)}
                          {item.verified ? " · ✔ verificado" : ""}
                        </span>
                        <span className="lb-time">{timeAgo(item.createdAt)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {visibleCounters.length > 0 ? (
        <section className="counters-band">
          <div className="wrap">
            <div className="counters">
              {visibleCounters.map((item) => (
                <Counter key={item.label} value={item.value} label={item.label} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* A quién sirve */}
      <section className="block" aria-labelledby="audiencias-titulo">
        <div className="wrap">
          <h2 id="audiencias-titulo">A quién sirve</h2>
          <p className="lead">Flujos claros para generadores de carga y transportistas, con la misma trazabilidad.</p>
          <div className="audience-grid">
            <article>
              <h3>Empresas y mandantes</h3>
              <p>
                Publica la carga con origen, destino, fecha, peso y equipo. Recibe ofertas, revisa camiones compatibles y
                adjudica: recién ahí ambas partes ven el contacto.
              </p>
              <Link className="btn sm" href="/cargas/nueva">
                Publicar una carga
              </Link>
            </article>
            <article>
              <h3>Transportistas</h3>
              <p>
                Confirma correo y teléfono, sube documentos y, tras la revisión, publica camión o retorno. Oferta y, si te
                eligen, coordinas en directo con el mandante.
              </p>
              <Link className="btn sm" href="/camiones/nuevo">
                Publicar un camión o retorno
              </Link>
            </article>
          </div>
          <WhatsAppChannel />
        </div>
      </section>

      {/* Puntero a verticales / equipos / tecnología (contenido largo vive en /tecnologia) */}
      <section className="block alt" aria-labelledby="mas-titulo">
        <div className="wrap">
          <h2 id="mas-titulo">Tecnología, verticales y equipos</h2>
          <p className="lead">
            Demostraciones de trazabilidad, minería, cama baja, retornos y fichas de equipo están en Tecnología — para
            no alargar esta portada. Ver también{" "}
            <Link href="/como-verificamos">cómo verificamos</Link>.
          </p>
          <p>
            <Link className="btn sec sm" href="/tecnologia">
              Abrir Tecnología Carga360go →
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ mínimo (detalle completo en /faq) */}
      <section className="block" id="faq" aria-labelledby="faq-titulo">
        <div className="wrap">
          <h2 id="faq-titulo">Preguntas frecuentes</h2>
          <div className="faq" style={{ marginTop: 12 }}>
            {FAQ.slice(0, 4).map((item) => (
              <details key={item.q} className="card">
                <summary>{item.q}</summary>
                <p>
                  {item.q === "¿Qué significa verificado?" ? (
                    <>
                      Que revisamos contacto y, en transportistas, documentos vigentes, con aprobación de un administrador.
                      No es una garantía de solvencia, seguridad ni cumplimiento. Ver{" "}
                      <Link href="/como-verificamos">Cómo verificamos</Link>.
                    </>
                  ) : (
                    item.a
                  )}
                </p>
              </details>
            ))}
          </div>
          <p style={{ marginTop: 12 }}>
            <Link href="/faq">Ver todas las preguntas →</Link>
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="block alt">
        <div className="wrap">
          <div className="cta-band">
            <h2>Publica tu primera carga o tu camión</h2>
            <p>
              Registra tu empresa o tu cuenta de transportista y conoce el costo real de cada viaje, o escríbenos a{" "}
              {BRAND.email} o al WhatsApp publicado en el sitio. operación continua con Agente Carga360go desde el botón
              «Carga360».
            </p>
            <div className="cta">
              <Link className="btn" href="/registro">
                Crear cuenta
              </Link>
              <WhatsAppContactGate number={whatsappNumber} text={whatsappText} className="btn wa">
                WhatsApp {BRAND.whatsappDisplay}
              </WhatsAppContactGate>
              <Link className="btn ghost" href="/contacto">
                Ir a contacto
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
