import type { Metadata } from "next";
import Link from "next/link";
import { FreeBanner } from "@/components/FreeBanner";
import { WhatsAppChannel } from "@/components/WhatsAppChannel";
import { QuickSearch } from "@/components/QuickSearch";
import { TraceAutomationDemo } from "@/components/TraceAutomationDemo";
import { getCurrentUser } from "@/lib/current-user";
import { EQUIPMENT_CAPACITY } from "@/lib/equipment-capacity";
import { TruckArt } from "@/components/TruckArt";
import { BRAND, EQUIPMENT, equipmentById } from "@/lib/catalog";
import { formatDateCL, waLink } from "@/lib/format";
import { RegionsDashboard } from "@/components/RegionsDashboard";
import { liveStats, recentListings, regionIndicators, timeAgo } from "@/lib/stats";

export const metadata: Metadata = { alternates: { canonical: "/" } };

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

      <section className="hero hero2 hero-v2">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="brand-hero" aria-label="Marca">
              Carga360go
            </p>
            <h1>
              Trazabilidad y automatización para mover carga en Chile
            </h1>
            <p>
              Publica tu carga, encuentra el camión, sigue la operación en vivo y conserva el comprobante digital.
              Una torre de control simple: menos vacío, más claridad entre mandantes y transportistas.
            </p>
            <QuickSearch />
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
          <aside className="tower-board" aria-label="Torre de control Carga360go">
            <div className="tower-head">
              <span className="dot-live" /> Torre de control
              <span className="tower-tag">Así funciona</span>
            </div>
            <ol className="tower-steps">
              {FLOW.map((step) => (
                <li key={step.n}>
                  <span className="tower-n">{step.n}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="tower-live">
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
                            {eq.icon} {eq.label} · {item.amount} · {item.kind === "carga" ? "retiro" : "desde"} {formatDateCL(item.date)}
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
          </aside>
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

      <section className="block">
        <div className="wrap">
          <h2>Cómo funciona para cada lado</h2>
          <p className="lead">Flujos claros para mandantes y transportistas, con la misma trazabilidad de punta a punta.</p>
          <div className="grid c2 paths" style={{ marginTop: 16 }}>
            <div className="card path">
              <span className="path-ic" aria-hidden="true">
                🏢
              </span>
              <h3>Empresas y mandantes</h3>
              <p>
                1) Crea tu cuenta y acepta términos y privacidad. 2) Publica la carga: origen, destino, fecha, peso, equipo y
                medidas. Verás el costo real estimado del envío, desglosado. 3) Recibe ofertas dentro del plazo de la carga, o revisa camiones
                compatibles. 4) Elige una oferta; recién ahí ambas partes ven el contacto y coordinan por WhatsApp.
              </p>
              <Link className="btn sm" href="/cargas/nueva">
                Publicar una carga
              </Link>
            </div>
            <div className="card path">
              <span className="path-ic" aria-hidden="true">
                🚛
              </span>
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
            </div>
          </div>
          <WhatsAppChannel />
        </div>
      </section>

      <section className="block alt auto-band">
        <div className="wrap">
          <h2>Automatización que se ve</h2>
          <p className="lead">
            Costo real del flete, Carga360 Match y eventos de viaje: la plataforma hace el trabajo repetitivo y deja la
            decisión en las partes. Mira la demo o abre la página de tecnología.
          </p>
          <div className="auto-grid">
            <div>
              <strong>Costo real automático</strong>
              <p>Ruta, peajes por ejes, diésel y operación, calculados al publicar o cotizar.</p>
            </div>
            <div>
              <strong>Carga360 Match</strong>
              <p>Calces por equipo, capacidad, medidas, ruta y fechas, con razones a la vista.</p>
            </div>
            <div>
              <strong>Agente Carga360go</strong>
              <p>Asistente de voz y texto en el sitio (Web Speech API, es-CL / es-ES), sin claves de pago.</p>
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
          <div className="grid c3" style={{ marginTop: 16 }}>
            <Link href="/transporte-minero-chile" className="card cat">
              <div>
                <h3>Transporte minero</h3>
                <p>Cargas, retornos y equipos aptos hacia y desde zonas de operación.</p>
              </div>
            </Link>
            <Link href="/cama-baja-y-maquinaria" className="card cat">
              <div>
                <h3>Cama baja y maquinaria</h3>
                <p>Ficha con ejes, ancho, capacidad y medidas, no un listado genérico.</p>
              </div>
            </Link>
            <Link href="/cargas-de-retorno-mineras" className="card cat">
              <div>
                <h3>Cargas de retorno</h3>
                <p>Publica el viaje de vuelta y recibe alertas cuando aparezca un calce.</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="block alt">
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

      <section className="block">
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
          <div className="grid c3" style={{ marginTop: 14 }}>
            <div className="card trust">
              <span className="badge-v">✔ Verificado</span>
              <p>
                Revisión de contacto y, en transportistas, de documentos vigentes, con aprobación de un administrador. No es
                un sello de solvencia ni de seguridad operacional.
              </p>
            </div>
            <div className="card trust">
              <span className="badge-l">🔒 Contacto protegido</span>
              <p>Nadie ve WhatsApp, teléfono ni correo hasta que se adjudica una oferta, y entonces solo las dos partes.</p>
            </div>
            <div className="card trust">
              <span className="badge-f">⛽ Costo real del flete</span>
              <p>
                Ruta, peajes según ejes, diésel y costos operacionales, calculados automáticamente y con trazabilidad.{" "}
                {BRAND.company} · RUT {BRAND.rut}.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="block alt">
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
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
