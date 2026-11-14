import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "@/components/Calculator";

export const metadata: Metadata = {
  title: "Calculadora de flete y costo de viaje",
  description: "Distancia estimada entre ciudades de Chile, rango de precio referencial por tipo de camión y costo de combustible, desgaste y peajes. Sin registro.",
  alternates: { canonical: "/herramientas/calculadora" },
};

export default function CalculadoraPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>Calculadora de flete</h1>
        <p>Sin registro. Distancia estimada entre más de 100 ciudades, de Arica a Puerto Williams, rango referencial por equipo y tus costos reales.</p>
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
