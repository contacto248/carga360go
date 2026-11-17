import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "@/components/Calculator";

export const metadata: Metadata = {
  title: "Calculadora de flete y costo de viaje",
  description: "Costo de referencia desglosado del viaje entre ciudades de Chile: kilómetros y ruta, peajes, diésel y viático. Valor estimativo de referencia; el valor final lo acuerdan las partes.",
  alternates: { canonical: "/herramientas/calculadora" },
};

export default function CalculadoraPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>Calculadora de flete</h1>
        <p>Sin registro. Origen y destino, kilómetros de la ruta, peajes de las plazas que cruza, diésel y viático. Es un costo de referencia desglosado.</p>
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
