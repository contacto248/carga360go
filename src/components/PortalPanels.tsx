import Link from "next/link";

type Panel = {
  id: string;
  title: string;
  text: string;
  href: string;
  cta: string;
  second?: { href: string; label: string };
  art: React.ReactNode;
};

/**
 * Destinos (comprobados en el repo):
 * - Público: /cargas (listado público de cargas; /camiones es el de camiones).
 * - Clientes inscritos: /panel (sin sesión muestra «Registrar» e «Ingresar»; con sesión, publicaciones, matches y alertas).
 * - Transportistas: /camiones/nuevo publica camión o retorno (sin sesión pide registro o ingreso; transportista sin verificar ve el panel de acreditación);
 *   gestión y ofertas en /panel.
 * - Mandantes: /cargas/nueva publica la carga (misma lógica); el seguimiento está en /panel.
 */
const PANELS: Panel[] = [
  {
    id: "publico",
    title: "Público",
    text: "Busca cargas, retornos y camiones disponibles en todo Chile. Los avisos muestran ruta, equipo y fecha.",
    href: "/cargas",
    cta: "el panel Público",
    art: (
      <>
        <path d="M20 90C60 90 70 40 110 40S160 70 180 30" strokeDasharray="2 5" opacity=".7" />
        <circle cx="20" cy="90" r="3" fill="#fff" />
        <circle cx="180" cy="30" r="3" fill="#fff" />
        <circle cx="110" cy="40" r="2" fill="#fff" />
        <circle cx="100" cy="60" r="38" opacity=".18" />
        <circle cx="100" cy="60" r="18" opacity=".18" />
      </>
    ),
  },
  {
    id: "clientes",
    title: "Clientes inscritos",
    text: "Tu panel de cuenta con tus búsquedas guardadas. Te avisamos por correo cuando una carga o un camión calza con lo tuyo.",
    href: "/panel",
    cta: "el panel Clientes inscritos",
    art: (
      <>
        <rect x="30" y="20" width="60" height="38" rx="5" opacity=".8" />
        <rect x="108" y="20" width="60" height="38" rx="5" opacity=".45" />
        <rect x="30" y="68" width="60" height="38" rx="5" opacity=".45" />
        <rect x="108" y="68" width="60" height="38" rx="5" opacity=".8" />
      </>
    ),
  },
  {
    id: "transportistas",
    title: "Transportistas",
    text: "Gestiona tus camiones y publica tu retorno para encontrar cargas de retorno por ruta, fecha y equipo.",
    href: "/camiones/nuevo",
    cta: "el panel Transportistas",
    second: { href: "/panel", label: "Gestionar mis camiones y ofertas" },
    art: (
      <>
        <rect x="18" y="38" width="94" height="40" rx="2" />
        <path d="M118 78V48h30l18 16v14Z" />
        <path d="M12 78H176" />
        <circle cx="42" cy="86" r="9" />
        <circle cx="82" cy="86" r="9" />
        <circle cx="146" cy="86" r="9" />
        <path d="M40 104H170" strokeDasharray="2 5" opacity=".6" />
        <path d="M160 98l10 6-10 6" opacity=".6" />
      </>
    ),
  },
  {
    id: "mandantes",
    title: "Mandantes",
    text: "Publica tu carga con origen, destino, fecha, peso y equipo; sigue tus avisos y elige una oferta.",
    href: "/cargas/nueva",
    cta: "el panel Mandantes",
    second: { href: "/panel", label: "Seguir mis cargas" },
    art: (
      <>
        <path d="M100 18L160 44V84L100 110L40 84V44Z" opacity=".85" />
        <path d="M40 44L100 70L160 44M100 70V110" opacity=".5" />
        <path d="M70 31L130 57" opacity=".35" />
      </>
    ),
  },
];

/** Cuadrícula de los cuatro paneles de la portada. Sin cifras: solo descripciones y enlaces a rutas existentes. */
export function PortalPanels() {
  return (
    <section className="bw-panels" id="paneles" aria-labelledby="bw-panels-h">
      <div className="wrap">
        <p className="bw-eyebrow">Cuatro paneles</p>
        <h2 id="bw-panels-h">
          Una plataforma.
          <br />
          Cuatro formas de usarla.
        </h2>
        <ul className="bw-grid">
          {PANELS.map((p) => (
            <li key={p.id} className="bw-tile">
              <svg className="bw-art" viewBox="0 0 200 120" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                {p.art}
              </svg>
              <div className="bw-tile-foot">
                <h3>{p.title}</h3>
                <Link className="bw-more" href={p.href}>
                  Explora <span aria-hidden="true">→</span>
                  <span className="bw-sr"> {p.cta}</span>
                </Link>
                <p>{p.text}</p>
                {p.second ? (
                  <Link className="bw-more bw-more-2" href={p.second.href}>
                    {p.second.label} <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
