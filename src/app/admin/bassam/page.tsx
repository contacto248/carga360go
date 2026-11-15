import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { DocumentReview } from "@/components/DocumentReview";
import styles from "@/components/bassam-panel.module.css";
import { panelAcreditacion, runExpiryAlerts } from "@/lib/bassam/acreditacion";
import { getCurrentUser } from "@/lib/current-user";
import { todayChile } from "@/lib/format";

export const metadata: Metadata = { title: "BASSAM 360", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BassamPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <section className={styles.shell}>
          <p className={styles.brand}>CARGA360GO</p>
          <h1>BASSAM 360</h1>
          <p className={styles.lede}>Esta sección es solo para administradores de Carga360go.</p>
          <Link className={styles.approve} href="/ingreso?next=/admin/bassam">
            Ingresar
          </Link>
        </section>
      </div>
    );
  }
  runExpiryAlerts(todayChile());
  const panel = panelAcreditacion();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <section className={styles.shell}>
        <p className={styles.brand}>CARGA360GO</p>
        <h1>BASSAM 360</h1>
        <p className={styles.lede}>Dos listas con los documentos guardados. La línea de tiempo sale solo de admin_bassam_360.</p>
        <AdminNav current="/admin/bassam" />
        <DocumentReview panel={panel} />
      </section>
    </div>
  );
}
