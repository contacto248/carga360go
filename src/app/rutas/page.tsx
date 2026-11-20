import type { Metadata } from "next";
import Link from "next/link";
import { SEO_ROUTES } from "@/lib/seo-routes";

export const metadata: Metadata = {
  title: "Rutas de transporte Chile · Retornos",
  description: "Rutas de carga y retorno entre las principales ciudades de Chile.",
  alternates: { canonical: "https://www.carga360go.cl/rutas" },
};

export default function RoutesIndex() {
  return (
    <div className="wrap legal" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>Rutas de transporte de carga en Chile</h1>
        <p>
          Información para planificar traslados. La disponibilidad de vehículos y cargas requiere
          confirmación.
        </p>
      </div>
      <ul>
        {SEO_ROUTES.map((route) => (
          <li key={route.slug}>
            <Link href={`/rutas/${route.slug}`}>
              {route.origin} a {route.destination}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
