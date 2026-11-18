import { AgentLeadForm } from "@/components/AgentLeadForm";
import { BRAND } from "@/lib/catalog";
import { waLink } from "@/lib/format";

/** Estrellas de la esfera: generadas con una semilla fija para que el HTML sea estable. */
function sphereStars() {
  let seed = 360;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const sizes = [0.5, 0.5, 0.8, 1.1, 1.6];
  const alphas = [0.35, 0.5, 0.7, 0.9];
  return Array.from({ length: 150 }, (_, i) => {
    const r = Math.sqrt(rnd()) * 88;
    const a = rnd() * Math.PI * 2;
    return {
      key: i,
      cx: +(100 + r * Math.cos(a)).toFixed(1),
      cy: +(100 + r * Math.sin(a)).toFixed(1),
      r: sizes[Math.floor(rnd() * sizes.length)],
      o: alphas[Math.floor(rnd() * alphas.length)],
    };
  });
}

const STARS = sphereStars();

/**
 * Tarjeta del agente comercial de la portada. Usa solo los canales públicos de BRAND (catalog.ts):
 * no inventa una persona. Hoy el agente web opera por reglas, sin IA externa, WhatsApp ni telefonía conectados.
 */
export function AgentCard() {
  const whatsapp = waLink(BRAND.whatsapp, BRAND.infoMessage);
  return (
    <section className="bw-band" id="agente" aria-labelledby="bw-agent-h">
      <div className="wrap bw-agent">
        <div>
          <span className="bw-badge">Agente</span>
          <h2 id="bw-agent-h">
            Habla con el agente.
            <br />
            Cuéntanos qué necesitas.
          </h2>
          <p className="bw-lead">
            El agente de la web toma tu solicitud de transporte. Hoy opera por reglas; la IA externa, WhatsApp y telefonía no están
            conectadas.
          </p>
        </div>
        <article className="bw-agent-card" aria-labelledby="bw-agent-name">
          <svg className="bw-sphere" viewBox="0 0 200 200" role="img" aria-label="Esfera de estrellas, ilustración decorativa" fill="#fff">
            <defs>
              <radialGradient id="bw-sphere-g" cx="38%" cy="32%" r="75%">
                <stop offset="0" stopColor="#2a2a2a" />
                <stop offset="1" stopColor="#050505" />
              </radialGradient>
            </defs>
            <circle cx="100" cy="100" r="92" fill="url(#bw-sphere-g)" stroke="#fff" strokeOpacity=".35" strokeWidth=".8" />
            {STARS.map((s) => (
              <circle key={s.key} cx={s.cx} cy={s.cy} r={s.r} opacity={s.o} />
            ))}
          </svg>
          <div>
            <h3 id="bw-agent-name">Agente BASSAM 360</h3>
            <p className="bw-role">Agente web de {BRAND.name}</p>
            <dl className="bw-contact">
              <div>
                <dt>Nombre</dt>
                <dd>Agente BASSAM 360</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>
                  <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
                </dd>
              </div>
              <div>
                <dt>Teléfono (WhatsApp)</dt>
                <dd>
                  <a href={`tel:+${BRAND.whatsapp}`}>{BRAND.whatsappDisplay}</a>
                </dd>
              </div>
            </dl>
            <p className="bw-note">Correo y teléfono son los canales públicos de {BRAND.name}; no son datos de una persona.</p>
            <div className="bw-row">
              <a className="bw-btn bw-btn-light" href={whatsapp} target="_blank" rel="noopener noreferrer">
                Escribir por WhatsApp
              </a>
              <a className="bw-btn bw-btn-dark" href={`mailto:${BRAND.email}`}>
                Enviar un correo
              </a>
            </div>
          </div>
          <AgentLeadForm />
        </article>
      </div>
    </section>
  );
}
