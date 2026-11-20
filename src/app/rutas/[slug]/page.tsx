import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CITY_LANDINGS, foldCity } from "@/lib/seo-landings";
import { SEO_ROUTES, routeBySlug } from "@/lib/seo-routes";

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.carga360go.cl";

export const dynamicParams = false;

export function generateStaticParams() {
  return SEO_ROUTES.map((route) => ({ slug: route.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const route = routeBySlug(slug);
  if (!route) notFound();
  const title = `Transporte ${route.origin} – ${route.destination} · Carga y retorno`;
  const description = `Carga disponible y retorno de camiones entre ${route.origin} y ${route.destination}.`;
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/rutas/${route.slug}` },
    openGraph: {
      title: `${title} · ÓRBITA Carga360go`,
      description,
      url: `${BASE}/rutas/${route.slug}`,
      type: "website",
    },
  };
}

export default async function RoutePage({ params }: Props) {
  const { slug } = await params;
  const route = routeBySlug(slug);
  if (!route) notFound();
  const cities = CITY_LANDINGS.filter(
    (city) => foldCity(city.name) === foldCity(route.origin) || foldCity(city.name) === foldCity(route.destination),
  );

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
      { "@type": "ListItem", position: 2, name: "Rutas", item: `${BASE}/rutas` },
      {
        "@type": "ListItem",
        position: 3,
        name: `${route.origin} a ${route.destination}`,
        item: `${BASE}/rutas/${route.slug}`,
      },
    ],
  };

  return (
    <div className="wrap legal" style={{ paddingBottom: 40 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }}
      />
      <nav aria-label="Ruta de navegación">
        <Link href="/">Inicio</Link>
        {" / "}
        <Link href="/rutas">Rutas</Link>
      </nav>
      <div className="page-title">
        <h1>
          Transporte de carga {route.origin} a {route.destination}
        </h1>
      </div>
      <p>{route.intro}</p>
      <h2>Camiones y equipos</h2>
      <p>{route.equipment}</p>
      <h2>Planificación del traslado</h2>
      <p>{route.planning}</p>
      <h2>Preguntas frecuentes</h2>
      {route.faq.map((item) => (
        <section key={item.q}>
          <h3>{item.q}</h3>
          <p>{item.a}</p>
        </section>
      ))}
      <p>
        Para coordinar transporte, ingresa a Carga360go e indica las características de tu carga. La
        disponibilidad está sujeta a confirmación.
      </p>
      {cities.length ? (
        <p>
          Esta página es el tramo. La ciudad tiene su página:{" "}
          {cities.map((city, index) => (
            <span key={city.href}>
              {index ? " · " : null}
              <Link href={city.href}>{city.name}</Link>
            </span>
          ))}
          .
        </p>
      ) : null}
      <p>
        <Link href="/rutas">Ver otras rutas de transporte</Link>
      </p>
    </div>
  );
}
