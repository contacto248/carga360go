import Link from "next/link";
import { BRAND } from "@/lib/catalog";
import type { SeoLandingContent } from "@/lib/seo-landings";

export function LandingLegalNote() {
  return (
    <p className="meta landing-legal">
      Carga360go no es transportista, no cobra comisión por el flete y no garantiza el viaje. Cada cuenta tiene 30 días
      gratis desde su inscripción. {BRAND.company} · RUT {BRAND.rut}.{" "}
      <Link href="/terminos">Términos de uso</Link> · <Link href="/privacidad">Política de privacidad</Link> ·{" "}
      <Link href="/como-verificamos">Cómo verificamos</Link>.
    </p>
  );
}

export function SeoLanding({ landing }: { landing: SeoLandingContent }) {
  return (
    <div className="wrap legal" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>{landing.h1}</h1>
      </div>
      {landing.body.map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}
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
