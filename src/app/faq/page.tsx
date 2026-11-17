import type { Metadata } from "next";
import Link from "next/link";
import { FAQ } from "@/lib/faq";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description:
    "Preguntas frecuentes de Carga360go: costo del flete, contacto protegido, verificación, Carga360 Match, alertas y seguimiento de la operación.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Preguntas frecuentes</h1>
        <p>
          Respuestas cortas sobre cómo opera Carga360go. También están en la{" "}
          <Link href="/#faq">portada</Link>.
        </p>
      </div>
      <div className="faq" style={{ marginTop: 12 }}>
        {FAQ.map((item) => (
          <details key={item.q} className="card">
            <summary>{item.q}</summary>
            <p>
              {item.q === "¿Qué significa verificado?" ? (
                <>
                  {item.a} Ver <Link href="/como-verificamos">Cómo verificamos</Link>.
                </>
              ) : (
                item.a
              )}
            </p>
          </details>
        ))}
      </div>
      <p className="meta" style={{ marginTop: 18 }}>
        ¿Necesitas otra ruta? <Link href="/guias">Guías</Link> · <Link href="/contacto">Contacto</Link> ·{" "}
        <Link href="/registro">Crear cuenta</Link>
      </p>
    </div>
  );
}
