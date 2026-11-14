import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="empty">
        <h1>No encontramos esa página</h1>
        <p>El aviso puede haber sido eliminado o la dirección está incompleta.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn" href="/cargas">
            Ver cargas
          </Link>
          <Link className="btn sec" href="/">
            Ir al inicio
          </Link>
          <Link className="btn sec" href="/contacto">
            Contacto
          </Link>
        </div>
      </div>
    </div>
  );
}
