import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { BassamPanel } from "@/components/BassamPanel";
import { DocumentReview } from "@/components/DocumentReview";
import styles from "@/components/bassam-panel.module.css";
import { listPendingDocuments, runExpiryAlerts } from "@/lib/bassam/acreditacion";
import { bassamSnapshot } from "@/lib/bassam/ops";
import { getCurrentUser } from "@/lib/current-user";
import { todayChile } from "@/lib/format";

export const metadata: Metadata = { title: "BASSAM 360", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BassamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const params = await searchParams;
  const raw = Array.isArray(params.tipo) ? params.tipo[0] : params.tipo;
  const tipo = raw === "mandante" || raw === "transportista" ? raw : undefined;
  runExpiryAlerts(todayChile());
  const data = bassamSnapshot(user);
  const docs = listPendingDocuments(tipo);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <section className={styles.shell}>
        <p className={styles.brand}>CARGA360GO</p>
        <h1>BASSAM 360</h1>
        <p className={styles.lede}>
          Gerencia solo revisa los casos de severidad muy alta. El agente de calidad cierra el resto con reglas fijas y deja fecha, decisión, regla y resultado.{" "}
          <Link className={styles.link} href="/admin/control">
            Centro de control
          </Link>
        </p>
        <AdminNav current="/admin/bassam" />
        <DocumentReview docs={docs} filtro={tipo} />
        <BassamPanel initial={data} />
      </section>
    </div>
  );
}
