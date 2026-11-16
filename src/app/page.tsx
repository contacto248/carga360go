import type { Metadata } from "next";
import Link from "next/link";
import { FreeBanner } from "@/components/FreeBanner";
import { HomeTowerBoard } from "@/components/HomeTowerBoard";
import { OpenAgentCta } from "@/components/OpenAgentCta";
import { WhatsAppChannel } from "@/components/WhatsAppChannel";
import { QuickSearch } from "@/components/QuickSearch";
import { TraceAutomationDemo } from "@/components/TraceAutomationDemo";
import { AgentAvatar } from "@/components/AgentAvatar";
import { getCurrentUser } from "@/lib/current-user";
import { EQUIPMENT_CAPACITY } from "@/lib/equipment-capacity";
import { TruckArt } from "@/components/TruckArt";
import { BRAND, EQUIPMENT, equipmentById } from "@/lib/catalog";
import { formatDateCL, waLink } from "@/lib/format";
import { RegionsDashboard } from "@/components/RegionsDashboard";
import { liveStats, recentListings, regionIndicators, timeAgo } from "@/lib/stats";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description:
    "Carga360go conecta cargas y camiones en Chile con trazabilidad y automatización. Publica tu carga, encuentra camión, sigue la operación y conserva el comprobante digital.",
};

/** Pasos de operación (recuperados de home-v2 / torre de control). */
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

/** Cuatro beneficios (copy propio Carga360go, es-CL; pedido Gerencia T-065). */
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

/** Módulos / funciones de la plataforma. */
const MODULES = [
  {
    title: "Cotizador",
    text: "Estima el costo real referencial del flete con ruta, peajes según ejes, diésel y operación. No es cotización cerrada.",
    href: "/herramientas/calculadora",
  },
  {
    title: "Publicación de cargas",
    text: "Origen, destino, fecha, peso, equipo y medidas. Tu aviso entra a la bolsa y recibe ofertas en el plazo definido.",
    href: "/cargas/nueva",
  },
  {
    title: "Trazabilidad",
    text: "Cada carga registra eventos con fecha y hora: publicación, ofertas, adjudicación y estado del viaje.",
    href: "/tecnologia",
  },
  {
    title: "Registro de transportistas",
    text: "Cuenta, correo, teléfono y documentos vigentes. Un administrador revisa antes de publicar camión o retorno.",
    href: "/registro",
  },
  {
    title: "Asistente Carga360",
    text: "Agente Carga360go de voz y texto en el sitio (Web Speech API, es-CL / es-ES), sin claves de pago.",
    href: "/tecnologia",
  },
  {
    title: "Carga360 Match",
    text: "Calces por equipo, capacidad, medidas, ruta y fechas, con razones a la vista. No garantiza contratación.",
    href: "/cargas",
  },
];

/** Herramientas de IA / automatización (sección destacada, cada una aparte). */
const AUTO_TOOLS = [
  {
    title: "Costo real automático",
    text: "Ruta, peajes por ejes, diésel y operación, calculados al publicar o cotizar.",
  },
  {
    title: "Carga360 Match",
    text: "Calces por equipo, capacidad, medidas, ruta y fechas, con razones a la vista.",
  },
  {
    title: "Agente Carga360go",
    text: "Asistente de voz y texto en el sitio (Web Speech API, es-CL / es-ES), sin claves de pago.",
  },
  {
    title: "Alertas por correo",
    text: "Avisos cuando una carga o un camión calza con lo tuyo o con una búsqueda guardada. WhatsApp: próximamente, opt-in.",
  },
];

/** Industrias (recuperado de portada-saas / HomeShowcase). */
const INDUSTRIES = [
  { title: "Minería", text: "Graneles, mineral y carga pesada." },
  { title: "Construcción y obras", text: "Materiales y maquinaria." },
  { title: "Forestal", text: "Madera, celulosa y carga de bosque." },
  { title: "Agroindustria y alimentos", text: "Frescos, procesados y refrigerada." },
  { title: "Retail y distribución", text: "Reposición, CD y carga de distribución." },
  { title: "Industria y manufactura", text: "Insumos, componentes y producto terminado." },
  { title: "Energía", text: "Equipos e insumos para faenas y proyectos." },
];

/** Ecosistema / canales reales (sin inventar ERP ajenos). */
const ECOSYSTEM = [
  { title: "WhatsApp", text: "Canal oficial y contacto entre partes tras adjudicar." },
  { title: "Correo", text: "Alertas de calce y comunicación de la cuenta." },
  { title: "Calculadora de flete", text: "Estimación referencial antes de publicar." },
  { title: "Panel", text: "Avisos, ofertas y alertas en un solo lugar." },
  { title: "Guías", text: "Cómo verificar, publicar y usar la plataforma." },
];

const FAQ = [
  {
    q: "¿Cómo se calcula el costo del flete?",
    a: "Automáticamente, con la ruta, los peajes según los ejes del camión, el precio del diésel y los costos operacionales. El cliente ve el costo real de su envío, desglosado; el transportista ve el costo aproximado de su viaje.",
  },
  {
    q: "¿Quién ve el contacto?",
    a: "Nadie, hasta que se adjudica una oferta. El listado muestra ruta, equipo y fecha, sin nombre ni teléfono. Cuando el mandante elige, el WhatsApp y el correo se comparten solo entre él y el transportista elegido.",
  },
  {
    q: "¿Qué significa verificado?",
    a: "Que revisamos contacto y, en transportistas, documentos vigentes, con aprobación de un administrador. No es una garantía de solvencia, seguridad ni cumplimiento. Ver /como-verificamos.",
  },
  {
    q: "¿Qué cargas se mueven?",
    a: "Carga general, paletizada, refrigerada, a granel, líquida, contenedores, vehículos y carga sobredimensionada, de comercio, construcción, agro, retail, industria, distribución y minería. El foco de diferenciación está en minería, cama baja y retornos.",
  },
  {
    q: "¿Qué es Carga360 Match?",
    a: "Una recomendación automática que compara equipo, capacidad, medidas, ruta y fechas, y muestra un porcentaje de calce con las razones y lo que falta confirmar. No garantiza contratación ni aptitud del viaje.",
  },
  {
    q: "¿Cómo funcionan las alertas?",
    a: "Si una carga o un camión calza con lo tuyo, o con una búsqueda que guardaste, te avisamos por correo. Puedes pausarlas cuando quieras. Las alertas por WhatsApp no están activas; si se habilitan, serán opt-in.",
  },
  {
    q: "¿El costo calculado es una cotización cerrada?",
    a: "No. Es una estimación referencial con cada componente a la vista. El valor final lo acuerdan las partes.",
  },
  {
    q: "¿Cómo se sigue cada operación?",
    a: "Cada carga registra sus eventos con fecha y hora: publicación, ofertas, adjudicación y estado del viaje. El contacto solo se comparte entre las dos partes, y todo ocurre en una sola web automatizada.",
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
  const user = await getCurrentUser();
  const whatsapp = waLink(BRAND.whatsapp, BRAND.infoMessage);
  const stats = liveStats();
  const recent = recentListings(5);
  const indicators = regionIndicators();
  const visibleCounters: { value: number; label: string }[] = [];
  if (stats.activeLoads > 0) visibleCounters.push({ value: stats.activeLoads, label: "cargas activas" });
  if (stats.activeTrucks > 0) visibleCounters.push({ value: stats.activeTrucks, label: "camiones y retornos" });
  if (stats.matches > 0) visibleCounters.push({ value: stats.matches, label: "calces posibles hoy" });
  if (stats.verifiedCarriers > 0) visibleCounters.push({ value: stats.verifiedCarriers, label: "transportistas verificados" });
  if (stats.regionsActive > 0) visibleCounters.push({ value: stats.regionsActive, label: "regiones con avisos" });
  const activeRegions = indicators.filter((region) => region.activity > 0).length;
  // En modo arranque no exhibimos el mapa ni la tabla de 16 regiones en cero.
  const showRegionPanel = activeRegions >= 3;

  return (
    <>
      <div className="wrap" style={{ paddingTop: 12 }}>
        <FreeBanner user={user} />
      </div>

      {/* 1. Hero: marca + titular + problema + CTA */}
      <section className="hero hero2 hero-v2 hero-v3">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="brand-hero" aria-label="Marca">
              Carga360go
            </p>
            <h1>Trazabilidad y automatización para mover carga en Chile</h1>
            <p>
              Publicar una carga o un camión hoy se fragmenta entre llamadas, planillas y chats. Carga360go concentra la
              operación: publica, encuentra calce, sigue eventos y guarda el comprobante digital.
            </p>
            <div className="cta">
              <Link className="btn" href="/cargas">
                Soy transportista: encuentra cargas
              </Link>
              <Link className="btn ghost" href="/camiones">
                Soy empresa: encuentra camiones
              </Link>
              <Link className="btn ghost" href="/herramientas/calculadora">
                Calcular un flete referencial
              </Link>
            </div>
            <p className="hero-legal">
              Carga360go conecta a las partes, con trazabilidad de cada operación. {BRAND.company} · RUT {BRAND.rut}.
            </p>
          </div>
          <HomeTowerBoard steps={FLOW} />
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

      {/* Búsqueda rápida + bolsa reciente (recuperado home-v2) */}
      <section className="block home-live-band">
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

      {/* 3. Funciones / módulos */}
      <section className="block alt" aria-labelledby="modulos-titulo">
        <div className="wrap">
          <h2 id="modulos-titulo">Funciones de la plataforma</h2>
          <p className="lead">Módulos con nombre claro y un propósito concreto. Sin montos públicos en esta página.</p>
          <ul className="modules-grid">
            {MODULES.map((item) => (
              <li key={item.title}>
                <Link href={item.href}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Video corporativo (recuperado T-061 / PR #11) */}
      <section className="home-video-band" aria-labelledby="home-video-title">
        <div className="home-video-atmosphere" aria-hidden="true" />
        <div className="wrap home-video-inner">
          <h2 id="home-video-title" className="home-video-title">
            Conoce <span>Carga360go</span>
          </h2>
          <p className="home-video-lead">
            La torre de control que conecta cargas y camiones en Chile — mira cómo se mueve la operación.
          </p>
          <div className="home-video-stage">
            <div className="home-video-frame">
              <video
                className="home-video"
                controls
                preload="metadata"
                playsInline
                poster="/video/carga360go-corporativo-poster.jpg"
                aria-label="Video corporativo de Carga360go"
              >
                <source src="/video/carga360go-corporativo.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* 4. IA / automatización + agente protagonista */}
      <section className="block auto-band" aria-labelledby="auto-titulo">
        <div className="wrap">
          <h2 id="auto-titulo">Automatización e inteligencia que se ve</h2>
          <p className="lead">
            Cada herramienta hace una cosa: calcular, calzar, asistir o avisar. Mira la demo o abre Tecnología.
          </p>
          <ul className="auto-tools">
            {AUTO_TOOLS.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
          <div className="agent-spotlight" aria-labelledby="agente-spotlight-titulo">
            <div className="agent-spotlight-copy">
              <p className="saas-kicker">Carga360</p>
              <h3 id="agente-spotlight-titulo">Tu copiloto en la torre de control</h3>
              <p>
                Pregunta por cargas, camiones, costo referencial o cómo verificar una cuenta. Carga360go responde en
                español de Chile, por texto o voz, desde el botón flotante único «Carga360» — sin FAB de WhatsApp ni
                Asistente aparte.
              </p>
              <OpenAgentCta className="btn" label="Abrir Carga360" />
            </div>
            <div className="agent-spotlight-visual" aria-hidden="true">
              <AgentAvatar state="idle" size={88} />
              <span className="agent-spotlight-pulse" />
            </div>
          </div>
          <div className="home-tech-preview">
            <TraceAutomationDemo compact />
            <p style={{ marginTop: 12 }}>
              <Link className="btn sec sm" href="/tecnologia">
                Tecnología Carga360go →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* A quién sirve */}
      <section className="block alt" aria-labelledby="audiencias-titulo">
        <div className="wrap">
          <h2 id="audiencias-titulo">A quién sirve</h2>
          <p className="lead">Flujos claros para generadores de carga y transportistas, con la misma trazabilidad.</p>
          <div className="audience-grid">
            <article>
              <h3>Empresas y mandantes</h3>
              <p>
                1) Crea tu cuenta y acepta términos y privacidad. 2) Publica la carga: origen, destino, fecha, peso, equipo y
                medidas. Verás el costo real estimado del envío, desglosado. 3) Recibe ofertas dentro del plazo de la carga, o
                revisa camiones compatibles. 4) Elige una oferta; recién ahí ambas partes ven el contacto y coordinan por
                WhatsApp.
              </p>
              <Link className="btn sm" href="/cargas/nueva">
                Publicar una carga
              </Link>
            </article>
            <article>
              <h3>Transportistas</h3>
              <p>
                1) Crea tu cuenta, confirma correo y teléfono y sube tus documentos. 2) Cuando un administrador aprueba,
                publica tu camión o tu retorno. 3) Recibe alertas por correo cuando una carga calza; WhatsApp, solo si más
                adelante lo autorizas y la función está activa. 4) Oferta; si te eligen, coordinas en directo con el
                mandante.
              </p>
              <Link className="btn sm" href="/camiones/nuevo">
                Publicar un camión o retorno
              </Link>
            </article>
          </div>
          <WhatsAppChannel />
        </div>
      </section>

      {/* Cómo funciona en pasos */}
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

      {/* Industrias (recuperado portada-saas) */}
      <section className="block alt" aria-labelledby="industrias-titulo">
        <div className="wrap">
          <p className="saas-kicker">Operamos en</p>
          <h2 id="industrias-titulo">Industrias que mueven carga en Chile</h2>
          <ul className="industry-list">
            {INDUSTRIES.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Minería / foco (recuperado home-v2) */}
      <section className="block">
        <div className="wrap">
          <h2>Minería, cama baja y retornos</h2>
          <p className="lead">
            Carga360go está abierta a carga general y masiva en todo Chile, y se diferencia cuando el viaje pide un equipo
            concreto o un retorno útil. Servimos a empresas mineras, contratistas y proveedores que necesitan transporte
            apto para faena; a quien mueve maquinaria con cama baja o rampla; y a transportistas que quieren llenar el viaje
            de vuelta. No competimos solo por cantidad de avisos: competimos por compatibilidad técnica y documentación en
            orden.
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

      {/* 5. Integraciones / ecosistema */}
      <section className="block alt" aria-labelledby="eco-titulo">
        <div className="wrap">
          <h2 id="eco-titulo">Ecosistema y canales</h2>
          <p className="lead">
            Capa operativa sobre lo que ya usas día a día: WhatsApp, correo y herramientas propias de Carga360go. Sin inventar
            integraciones que no están activas.
          </p>
          <ul className="eco-grid">
            {ECOSYSTEM.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Cobertura */}
      <section className="block">
        <div className="wrap">
          <div className="rdash-head">
            <div>
              <h2>Cobertura</h2>
              <p className="lead">
                Operamos en las 16 regiones, de Arica a Punta Arenas. Para arrancar con actividad útil, priorizamos tres
                corredores piloto: Calama–Antofagasta, Calama–Copiapó y Antofagasta–Copiapó. Esa prioridad se confirma o se
                ajusta según demanda real, no se presenta como cobertura ya lograda.
              </p>
            </div>
            <Link className="btn sec sm" href="/regiones">
              Abrir panel de regiones →
            </Link>
          </div>
          {showRegionPanel ? (
            <RegionsDashboard regions={indicators} compact />
          ) : (
            <p className="notice" style={{ marginTop: 12 }}>
              Mientras casi todas las regiones van en cero, no mostramos un mapa ni una tabla vacía. Si hay avisos reales,
              aparecen arriba, en la bolsa en vivo, con su fecha. El panel completo permanece en{" "}
              <Link href="/regiones">/regiones</Link>.
            </p>
          )}
        </div>
      </section>

      {/* Verificado */}
      <section className="block alt">
        <div className="wrap">
          <h2>Qué significa verificado</h2>
          <p className="lead">
            Una cuenta verificada es una cuenta a la que un administrador ya le revisó el correo, y en el caso de los
            transportistas también el teléfono y los documentos pedidos (cédula, licencia profesional, padrón, revisión
            técnica, SOAP y permiso de circulación), que deben estar vigentes. Documentos al día significa que no hay
            vencidos; el semáforo avisa 30 días antes. Verificado no significa que Carga360go avale solvencia, seguridad
            operacional, idoneidad en faena ni el cumplimiento del transporte. Cada parte debe hacer su propia diligencia
            antes de contratar. El detalle está en <Link href="/como-verificamos">Cómo verificamos</Link>.
          </p>
          <ul className="trust-list">
            <li>
              <span className="badge-v">✔ Verificado</span>
              <p>
                Revisión de contacto y, en transportistas, de documentos vigentes, con aprobación de un administrador. No es
                un sello de solvencia ni de seguridad operacional.
              </p>
            </li>
            <li>
              <span className="badge-l">🔒 Contacto protegido</span>
              <p>Nadie ve WhatsApp, teléfono ni correo hasta que se adjudica una oferta, y entonces solo las dos partes.</p>
            </li>
            <li>
              <span className="badge-f">⛽ Costo real del flete</span>
              <p>
                Ruta, peajes según ejes, diésel y costos operacionales, calculados automáticamente y con trazabilidad.{" "}
                {BRAND.company} · RUT {BRAND.rut}.
              </p>
            </li>
          </ul>
        </div>
      </section>

      {/* Equipos */}
      <section className="block">
        <div className="wrap">
          <h2>Equipos con ficha técnica</h2>
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

      {/* Quiénes somos */}
      <section className="block alt" aria-labelledby="nosotros-titulo">
        <div className="wrap about-band">
          <h2 id="nosotros-titulo">Quiénes somos</h2>
          <p className="lead">
            <strong>Carga360go</strong> es la plataforma de {BRAND.company} (RUT {BRAND.rut}) para conectar generadores de
            carga y transportistas en Chile. Nacimos para ordenar la bolsa de carga con trazabilidad, costo real del flete y
            verificación de cuentas — sin intermediarnos en el acuerdo ni en el pago entre las partes.
          </p>
          <p>
            Oficina: {BRAND.address}. Correo:{" "}
            <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>. WhatsApp:{" "}
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              {BRAND.whatsappDisplay}
            </a>
            .
          </p>
          <p>
            Más detalle en <Link href="/contacto">Contacto</Link> y en las{" "}
            <Link href="/guias">guías de Carga360go</Link>.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <h2>Próximamente</h2>
          <p className="lead">Estamos trabajando en estas funciones. Todavía no están activas:</p>
          <ul className="soon">
            <li>Alertas y códigos de verificación por WhatsApp</li>
          </ul>
        </div>
      </section>

      <section className="block alt">
        <div className="wrap">
          <h2>Preguntas frecuentes</h2>
          <div className="faq" style={{ marginTop: 12 }}>
            {FAQ.map((item) => (
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
        </div>
      </section>

      {/* CTA final / contacto */}
      <section className="block">
        <div className="wrap">
          <div className="cta-band">
            <h2>Publica tu primera carga o tu camión</h2>
            <p>
              Registra tu empresa o tu cuenta de transportista y conoce el costo real de cada viaje, o escríbenos a{" "}
              {BRAND.email} o al WhatsApp publicado en el sitio.
            </p>
            <div className="cta">
              <Link className="btn" href="/registro">
                Crear cuenta
              </Link>
              <a className="btn wa" href={whatsapp} target="_blank" rel="noopener noreferrer">
                WhatsApp {BRAND.whatsappDisplay}
              </a>
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
