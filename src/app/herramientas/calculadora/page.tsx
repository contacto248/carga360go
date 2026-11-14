import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "@/components/Calculator";

export const metadata: Metadata = {
  title: "Calculadora de flete y costo de viaje",
  description: "Costo real del flete entre ciudades de Chile: ruta real, peajes oficiales según ejes, diésel CNE, conductor y desgaste. Referencial y sujeto a revisión.",
  alternates: { canonical: "/herramientas/calculadora" },
};

export default function CalculadoraPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>Calculadora de flete</h1>
        <p>Sin registro. Ruta real entre más de 100 ciudades, peajes según los ejes del camión, diésel publicado por la CNE, conductor con descansos legales y desgaste, cada uno con su fuente.</p>
      </div>
      <Calculator />
      <div className="row" style={{ marginTop: 16 }}>
        <Link className="btn" href="/cargas">
          Buscar cargas
        </Link>
        <Link className="btn sec" href="/camiones/nuevo">
          Publicar mi camión
        </Link>
      </div>
    </div>
  );
}
