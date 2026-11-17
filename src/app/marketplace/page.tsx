import type { Metadata } from "next";
import Link from "next/link";
import { Transparencia } from "@/components/rediseno/Piezas";
import { equipmentById } from "@/lib/catalog";
import { formatDateCL } from "@/lib/format";
import { recentListings } from "@/lib/stats";

export const metadata: Metadata = {
  title: { absolute: "Marketplace de cargas y camiones en Chile · Carga360go" },
  description:
    "Busca cargas y camiones por región, ruta, fecha y equipo. Calce también en retornos, alertas por correo y contacto protegido hasta adjudicar.",
  alternates: { canonical: "/marketplace" },
};

const FAQ = [
  {
    q: "¿Quién puede publicar y ofertar?",
    a: "Solo las cuentas acreditadas por un administrador de Carga360go.",
  },
  {
    q: "¿Quién define el valor del flete?",
    a: "Las partes. El transportista oferta su valor y el mandante elige. Carga360go muestra un costo de referencia desglosado como apoyo.",
  },
  {
    q: "¿Puedo publicar un retorno?",
    a: "Sí. Publica tu viaje de vuelta y entra al calce como cualquier camión disponible.",
  },
];

export default function MarketplacePage() {
  const avisos = recentListings(8);

  return (
    <>
      <section className="hero hero-fold" aria-labelledby="market-titulo">
        <div className="wrap">
          <h1 id="market-titulo">Cargas y camiones que calzan, en un solo marketplace.</h1>
          <p className="hero-lead">
            Busca por región, ciudad, equipo y fecha. Carga360go te muestra el calce y las razones, y te avisa por
            correo cuando aparece uno nuevo.
          </p>
          <div className="cta">
            <Link className="btn" href="/cargas">
              Ver cargas vigentes
            </Link>
            <Link className="btn" href="/camiones">
              Ver camiones disponibles
            </Link>
          </div>
          <p className="hero-secondary-links">
            <Link href="/cargas/nueva">Publicar carga</Link>
            <span aria-hidden="true"> · </span>
            <Link href="/camiones/nuevo">Publicar camión o retorno</Link>
          </p>
          <Transparencia />
        </div>
      </section>

      <section className="block" aria-labelledby="calce-titulo">
        <div className="wrap">
          <h2 id="calce-titulo">No es un listado genérico: es calce</h2>
          <p>
            Carga360go cruza equipo, capacidad, ruta y fechas, también en el viaje de vuelta, y te muestra por qué una
            carga y un camión calzan. Es una recomendación para decidir mejor, no un compromiso de contratación.
          </p>
        </div>
      </section>

      <section className="block alt" aria-labelledby="alertas-titulo">
        <div className="wrap">
          <h2 id="alertas-titulo">Si hoy no hay calce, te avisamos</h2>
          <p>
            Guarda una alerta con tu ruta, tus fechas y tu equipo. Cuando aparezca una carga o un camión que calza, te
            llega un correo. Puedes pausar tus alertas cuando quieras.
          </p>
          <p>
            <Link href="/panel#alertas">Ir a tus alertas por correo</Link>
          </p>
        </div>
      </section>

      <section className="block" aria-labelledby="ofertas-titulo">
        <div className="wrap">
          <h2 id="ofertas-titulo">Ofertas claras, contacto protegido</h2>
          <p>
            Los transportistas acreditados ofertan sobre la carga. El mandante compara y adjudica, o no adjudica si
            ninguna le sirve. Recién al adjudicar se abre el contacto entre las dos partes, y solo para ese flete.
          </p>
        </div>
      </section>

      <section className="block alt" aria-labelledby="avisos-titulo">
        <div className="wrap">
          <h2 id="avisos-titulo">Solo avisos reales y vigentes</h2>
          <p>En Carga360go no inflamos el listado. Lo que ves son publicaciones reales y vigentes, y se actualizan con cada aviso nuevo.</p>
          {avisos.length === 0 ? (
            <div className="aviso-vacio">
              <p>Aún no hay avisos que calcen con tu búsqueda. Guarda una alerta y te avisamos por correo.</p>
            </div>
          ) : (
            <ul className="lb-list">
              {avisos.map((item) => {
                const equipo = equipmentById(item.equipment);
                return (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link href={`/${item.kind === "carga" ? "cargas" : "camiones"}/${item.id}`}>
                      <span className="route">
                        {item.kind === "carga" ? "Carga" : "Camión"} · {item.origin} → {item.destination}
                      </span>
                      <span className="meta">
                        {equipo.label} · {item.amount} · {formatDateCL(item.date)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="block" id="faq" aria-labelledby="market-faq">
        <div className="wrap">
          <h2 id="market-faq">Preguntas frecuentes</h2>
          <div className="faq">
            {FAQ.map((item) => (
              <details key={item.q} className="card">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="block alt">
        <div className="wrap">
          <div className="cta-band">
            <h2>Publica en minutos y deja que el calce trabaje por ti.</h2>
            <div className="cta">
              <Link className="btn" href="/cargas/nueva">
                Publicar carga
              </Link>
              <Link className="btn sec" href="/camiones/nuevo">
                Publicar camión o retorno
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
