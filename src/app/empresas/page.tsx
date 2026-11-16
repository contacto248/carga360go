import type { Metadata } from "next";
import Link from "next/link";
import { listarEmpresasPublicas } from "@/lib/empresas-directorio";
import styles from "./empresas.module.css";

export const metadata: Metadata = {
  title: "Empresas",
  description: "Empresas en proceso de contacto y acreditación. La certificación se muestra solo cuando se completa.",
  alternates: { canonical: "/empresas" },
};

export const dynamic = "force-dynamic";

const NOTA = "Empresas en proceso de contacto y acreditación. La certificación se muestra solo cuando se completa.";
const BADGE = "EN PROCESO DE ACREDITACIÓN BASSAM 360";

export default function EmpresasPage() {
  const empresas = listarEmpresasPublicas();
  return (
    <div className="wrap">
      <section className={styles.page}>
        <img
          className={styles.marca}
          src="/brand/logo-wordmark.png"
          srcSet="/brand/logo-wordmark.png 1x, /brand/logo-wordmark@2x.png 2x"
          alt="Carga360go"
          width={220}
          height={50}
        />
        <p className={styles.kicker}>Directorio</p>
        <h1>Empresas</h1>
        <p className={styles.nota}>{NOTA}</p>
        {empresas.length === 0 ? (
          <p>Sin datos</p>
        ) : (
          <div className={styles.grid}>
            {empresas.map((empresa) => (
              <article className={styles.card} key={empresa.rut}>
                <p className={styles.badge}>{empresa.estado === "en_acreditacion" ? BADGE : "Sin datos"}</p>
                <h2>{empresa.nombre}</h2>
                <p className={styles.rol}>Mandante de carga</p>
                <p className={styles.dato}><span>RUT: </span>{empresa.rut}</p>
                <p className={styles.dato}><span>Dirección: </span>{empresa.direccion}</p>
                <p className={styles.dato}><span>Rubro: </span>{empresa.rubro}</p>
                <Link className={styles.postular} href="/registro-transportista">
                  Postular a sus cargas
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
