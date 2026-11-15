import type { Metadata } from "next";
import Link from "next/link";
import { DocumentReview } from "@/components/DocumentReview";
import styles from "@/components/bassam-panel.module.css";
import { panelAcreditacion } from "@/lib/bassam/acreditacion";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "BASSAM 360", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BassamPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <section className={styles.shell}>
          <p className={styles.brand}>CARGA360GO · BASSAM 360</p>
          <h1>Acreditación - Visión General</h1>
          <p className={styles.lede}>Auditoría de documentos. Región Metropolitana, Chile.</p>
          <Link className={styles.approve} href="/ingreso?next=/admin/bassam">
            Ingresar
          </Link>
        </section>
      </div>
    );
  }
  const panel = panelAcreditacion();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <section className={styles.shell}>
        <p className={styles.brand}>CARGA360GO · BASSAM 360</p>
        <h1>Acreditación - Visión General</h1>
        <p className={styles.lede}>Una sola pantalla. Los conteos salen de los documentos guardados.</p>
        <DocumentReview panel={panel} />
      </section>
    </div>
  );
}
