import Link from "next/link";
import { BRAND } from "@/lib/catalog";
import { CITY_LANDINGS, foldCity, type SeoLandingContent } from "@/lib/seo-landings";
import { SEO_ROUTES } from "@/lib/seo-routes";

export function LandingLegalNote() {
  return (
    <p className="meta landing-legal">
      Carga360go no es transportista y no garantiza el viaje. El costo del flete se calcula con ruta, peajes según ejes, diésel y
      costos operacionales. {BRAND.company} · RUT {BRAND.rut}.{" "}
      <Link href="/terminos">Términos de uso</Link> · <Link href="/privacidad">Política de privacidad</Link> ·{" "}
      <Link href="/como-verificamos">Cómo verificamos</Link>.
    </p>
  );
}

export function SeoLanding({ landing }: { landing: SeoLandingContent }) {
  const city = CITY_LANDINGS.find((item) => item.href === landing.slug);
  const tramos = city
    ? SEO_ROUTES.filter((route) => foldCity(route.origin) === foldCity(city.name) || foldCity(route.destination) === foldCity(city.name))
    : [];
  return (
    <div className="wrap legal" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>{landing.h1}</h1>
      </div>
      {landing.body.map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}
      {tramos.length ? (
        <section>
          <h2>Tramos</h2>
          <ul>
            {tramos.map((route) => (
              <li key={route.slug}>
                <Link href={`/rutas/${route.slug}`}>
                  {route.origin} a {route.destination}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="cta landing-cta">
        {landing.ctas.map((cta) => (
          <Link key={cta.href} className="btn sec" href={cta.href}>
            {cta.label}
          </Link>
        ))}
      </div>
      <LandingLegalNote />
    </div>
  );
}
