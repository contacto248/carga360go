import Link from "next/link";

type IconName = "mine" | "road" | "forest" | "food" | "retail" | "factory" | "energy" | "trace" | "badge" | "pin" | "shield" | "loop" | "bot";

const INDUSTRIES: { icon: IconName; title: string; text: string }[] = [
  { icon: "mine", title: "Minería", text: "Graneles, mineral y carga pesada." },
  { icon: "road", title: "Construcción y obras viales", text: "Materiales y maquinaria." },
  { icon: "forest", title: "Forestal", text: "Madera, celulosa y carga de bosque." },
  { icon: "food", title: "Agroindustria y alimentos", text: "Frescos, procesados y carga refrigerada." },
  { icon: "retail", title: "Retail y distribución", text: "Reposición, centros de distribución y última milla de carga." },
  { icon: "factory", title: "Industria y manufactura", text: "Insumos, componentes y producto terminado." },
  { icon: "energy", title: "Energía", text: "Equipos e insumos para faenas y proyectos." },
];

const PILLARS: { icon: IconName; title: string; text: string; badge?: string }[] = [
  {
    icon: "pin",
    title: "Trazabilidad en tiempo real",
    text: "Sigue cada etapa de la carga, de origen a destino.",
  },
  {
    icon: "shield",
    title: "Transportistas validados",
    text: "Trabajas con perfiles validados en la plataforma.",
  },
  {
    icon: "loop",
    title: "Menos viajes vacíos",
    text: "El retorno con carga reduce kilómetros en vacío y emisiones.",
    badge: "Sostenible",
  },
  {
    icon: "bot",
    title: "IA que asiste la coordinación",
    text: "Un asistente que te ayuda a publicar, postular y coordinar.",
  },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "mine":
      return (
        <svg {...common}>
          <path d="M4 26h24M7 26l5-14h8l5 14M12 12V8h8v4M16 8V5" />
        </svg>
      );
    case "road":
      return (
        <svg {...common}>
          <path d="M6 26V14l10-8 10 8v12M6 20h20M16 12v14" />
        </svg>
      );
    case "forest":
      return (
        <svg {...common}>
          <path d="M16 27V14M8 16l8-10 8 10M10 22l6-8 6 8" />
        </svg>
      );
    case "food":
      return (
        <svg {...common}>
          <path d="M9 6v8a3 3 0 0 0 6 0V6M12 14v12M20 6v20M20 6c3 2 4 5 4 8h-4" />
        </svg>
      );
    case "retail":
      return (
        <svg {...common}>
          <path d="M6 12h20l-2 14H8L6 12zM10 12V8a6 6 0 0 1 12 0v4" />
        </svg>
      );
    case "factory":
      return (
        <svg {...common}>
          <path d="M4 26V14l7 4V14l7 4V10h6v16H4zM22 14h4M10 22h3M16 22h3" />
        </svg>
      );
    case "energy":
      return (
        <svg {...common}>
          <path d="M18 4L8 18h7l-1 10 10-14h-7l1-10z" />
        </svg>
      );
    case "trace":
      return (
        <svg {...common}>
          <circle cx="7" cy="8" r="2.2" />
          <circle cx="25" cy="24" r="2.2" />
          <path d="M9 9c6 1 8 6 8 8s2 6 6 7" />
        </svg>
      );
    case "badge":
      return (
        <svg {...common}>
          <circle cx="16" cy="13" r="6" />
          <path d="M10 25l2.2-6M22 25l-2.2-6M12.5 13.2l2.2 2.2 4.6-4.8" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M16 27s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
          <circle cx="16" cy="15" r="2.2" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M16 5l8 3v6.5c0 5.2-3.2 8.4-8 10.5-4.8-2.1-8-5.3-8-10.5V8l8-3z" />
          <path d="M12.2 15.2l2.3 2.3 5-5.2" />
        </svg>
      );
    case "loop":
      return (
        <svg {...common}>
          <path d="M9 13a7 7 0 0 1 11-3l2 2" />
          <path d="M22 8v5h-5" />
          <path d="M23 19a7 7 0 0 1-11 3l-2-2" />
          <path d="M10 24v-5h5" />
        </svg>
      );
    case "bot":
      return (
        <svg {...common}>
          <rect x="8" y="11" width="16" height="11" rx="3" />
          <path d="M16 11V7M12.5 16h.01M19.5 16h.01M11 22.5h2M19 22.5h2" />
        </svg>
      );
    default: {
      const unexpected: never = name;
      return unexpected;
    }
  }
}

export function HeroPanel() {
  return (
    <figure className="saas-stage">
      <div className="saas-panel">
        <div className="saas-bar">
          <strong>Torre de control</strong>
          <span>Ejemplo</span>
        </div>
        <div className="saas-map">
          <svg viewBox="0 0 360 210" role="img" aria-label="Ruta de ejemplo entre Antofagasta y Santiago">
            <path className="saas-gridline" d="M0 42h360M0 84h360M0 126h360M0 168h360M45 0v210M105 0v210M165 0v210M225 0v210M285 0v210M345 0v210" />
            <path className="saas-route" d="M52 58C120 78 150 132 210 142s78 8 108 28" />
            <circle className="saas-dot" cx="52" cy="58" r="6" />
            <circle className="saas-dot" cx="318" cy="170" r="6" />
            <text x="66" y="52">
              Antofagasta
            </text>
            <text x="228" y="198">
              Santiago
            </text>
          </svg>
        </div>
        <div className="saas-floats">
          <div className="saas-chip">
            <span className="saas-chip-ic" aria-hidden="true">
              <Icon name="badge" />
            </span>
            <span>
              <strong>Documentos validados</strong>
              <small>Revisión de cuenta · —</small>
            </span>
          </div>
          <div className="saas-chip">
            <span className="saas-chip-ic" aria-hidden="true">
              <Icon name="trace" />
            </span>
            <span>
              <strong>En tránsito · Antofagasta → Santiago</strong>
              <small>Estado declarado · ejemplo</small>
            </span>
          </div>
        </div>
        <dl className="saas-kpis">
          <div>
            <dt>Cargas en curso</dt>
            <dd>—</dd>
          </div>
          <div>
            <dt>Retornos</dt>
            <dd>—</dd>
          </div>
          <div>
            <dt>Regiones con avisos</dt>
            <dd>—</dd>
          </div>
        </dl>
      </div>
      <figcaption>Vista de ejemplo. No es un viaje real ni una ubicación GPS.</figcaption>
    </figure>
  );
}

export function IndustrySection() {
  return (
    <section className="block alt">
      <div className="wrap">
        <p className="saas-kicker">Operamos en</p>
        <h2>Operamos en diferentes industrias</h2>
        <div className="industry-grid">
          {INDUSTRIES.map((item) => (
            <article key={item.title} className="card industry-card">
              <span className="industry-ic">
                <Icon name={item.icon} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PillarSection() {
  return (
    <section className="pillar-band" aria-labelledby="pilares-titulo">
      <div className="pillar-glow" aria-hidden="true" />
      <div className="wrap">
        <p className="pillar-kicker">Cómo opera</p>
        <h2 id="pilares-titulo">Más control, de origen a destino.</h2>
        <p className="pillar-lead">Una plataforma para mandantes y transportistas, con menos intermediarios.</p>
        <div className="pillar-grid">
          {PILLARS.map((item) => (
            <article key={item.title} className="pillar-card">
              <span className="pillar-ic">
                <Icon name={item.icon} />
              </span>
              <h3>
                {item.title}
                {item.badge ? <span className="sost-badge">{item.badge}</span> : null}
              </h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <div className="pillar-actions">
          <Link className="btn" href="/registro">
            Conócela
          </Link>
          <a className="pillar-url" href="https://www.carga360go.cl">
            www.carga360go.cl
          </a>
        </div>
      </div>
    </section>
  );
}
