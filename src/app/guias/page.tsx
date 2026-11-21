import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Guías de uso",
  description:
    "Guías prácticas de Carga360go: publicar carga o camión, calcular el flete, verificarse, cobertura regional y contacto.",
  alternates: { canonical: "/guias" },
};

const GUIDES = [
  {
    href: "/cargas/nueva",
    title: "Publicar una carga",
    text: "Ruta, equipo, fechas y precio referencial. El contacto se protege hasta adjudicar.",
  },
  {
    href: "/camiones/nuevo",
    title: "Publicar un camión o retorno",
    text: "Disponibilidad, capacidad y zona para aparecer en la bolsa y recibir calces.",
  },
  {
    href: "/herramientas/calculadora",
    title: "Calcular el costo del flete",
    text: "Estimación con ruta, peajes por ejes, diésel y operación. No es cotización cerrada.",
  },
  {
    href: "/como-verificamos",
    title: "Cómo verificamos cuentas",
    text: "Qué revisa un administrador, qué significa «verificado» y qué no garantiza.",
  },
  {
    href: "/registro",
    title: "Crear cuenta (mandante o transportista)",
    text: "Registro con RUT, correo y WhatsApp. Los transportistas suben documentos vigentes.",
  },
  {
    href: "/regiones",
    title: "Cobertura por regiones",
    text: "Las 16 regiones de Chile: avisos, actividad y accesos a publicar o buscar.",
  },
  {
    href: "/tecnologia",
    title: "Tecnología y trazabilidad",
    text: "Motor de costos, Match ÓRBITA, eventos de viaje y controles reales de la plataforma.",
  },
  {
    href: "/contacto",
    title: "Contacto y soporte",
    text: "WhatsApp, correo y oficina. Horario hábil para dudas, reclamos o corrección de datos.",
  },
] as const;

export default function GuiasPage() {
  return (
    <div className="wrap legal" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>Guías de Carga360go</h1>
        <p>
          Orientación corta para usar la plataforma: publicar, calcular, verificarse y seguir una operación.{" "}
          {BRAND.company} · RUT {BRAND.rut}.
        </p>
      </div>

      <section>
        <h2>Guías prácticas</h2>
        <ul>
          {GUIDES.map((guide) => (
            <li key={guide.href}>
              <Link href={guide.href}>{guide.title}</Link>
              {" — "}
              {guide.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Empezar ahora</h2>
        <p>
          Si ya sabes qué necesitas:{" "}
          <Link href="/cargas">ver cargas</Link>, <Link href="/camiones">ver camiones</Link> o{" "}
          <Link href="/registro">crear cuenta</Link>.
        </p>
      </section>

      <p className="meta">
        {BRAND.company} · RUT {BRAND.rut} · <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
      </p>
    </div>
  );
}
