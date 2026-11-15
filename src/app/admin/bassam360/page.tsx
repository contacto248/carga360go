import type { Metadata } from "next";
import Link from "next/link";
import { CentroAgente } from "@/components/CentroAgente";
import { DocumentReview } from "@/components/DocumentReview";
import styles from "@/components/bassam-panel.module.css";
import { conteosControl, panelAcreditacion } from "@/lib/bassam/acreditacion";
import { marcaConteo, vistaCentro } from "@/lib/bassam/centro";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "BASSAM 360", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Bassam360Page() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <section className={styles.shell}>
          <h1>BASSAM 360</h1>
          <p className={styles.lede}>Solo la sesión de administrador entra aquí.</p>
          <Link className={styles.approve} href="/ingreso?next=/admin/bassam360">
            Ingresar
          </Link>
        </section>
      </div>
    );
  }
  const vista = vistaCentro();
  const base = conteosControl();
  const conteos = {
    cargas: marcaConteo(base.cargas),
    camiones: marcaConteo(base.camiones),
    documentos: marcaConteo(base.documentos),
    agente: marcaConteo(base.agente),
  };
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <section className={styles.shell}>
        <p className={styles.brand}>CARGA360GO · BASSAM 360</p>
        <h1>Centro de control</h1>
        <p className={styles.lede}>El asistente no aprueba solo. Una persona usa los botones.</p>
        <div className={styles.counts} aria-label="Conteos">
          <p><span>Viajes</span><strong>{vista.viajes}</strong></p>
          <p><span>Camiones</span><strong>{vista.camiones}</strong></p>
          <p><span>Clientes</span><strong>{vista.clientes}</strong></p>
          <p><span>Docs BASSAM</span><strong>{vista.docs}</strong></p>
        </div>
        <p className={styles.meta}>GPS: --. Agentes: --. WhatsApp: --.</p>
        <CentroAgente estado="--" />
        <DocumentReview panel={panelAcreditacion()} conteos={conteos} correccion />
      </section>
    </div>
  );
}
