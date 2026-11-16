import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { AsistenteEjecutivo } from "@/components/AsistenteEjecutivo";
import { DocumentReview } from "@/components/DocumentReview";
import styles from "@/components/bassam-panel.module.css";
import { conteosControl, panelAcreditacion } from "@/lib/bassam/acreditacion";
import { marcaConteo, vistaCentro } from "@/lib/bassam/centro";
import type { PanelAcreditacion } from "@/lib/bassam/types";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "BASSAM 360", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function pendientes(panel: PanelAcreditacion): PanelAcreditacion {
  const transportistas = panel.transportistas.filas.filter((fila) => fila.estadoAdmin === "pendiente_ok");
  const mandantes = panel.mandantes.filas.filter((fila) => fila.estadoAdmin === "pendiente_ok");
  const conteo = (n: number) => (n > 0 ? String(n) : "Sin datos");
  return {
    ...panel,
    transportistas: { conteo: conteo(transportistas.length), filas: transportistas },
    mandantes: { conteo: conteo(mandantes.length), filas: mandantes },
  };
}

export default async function Bassam360Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/ingreso?next=/admin/bassam360");
  if (user.role !== "admin") forbidden();
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
      <AdminNav current="/admin/bassam360" />
      <section className={`${styles.shell} ${styles.ejecutivo}`}>
        <img
          className={styles.marca}
          src="/brand/logo-wordmark.png"
          srcSet="/brand/logo-wordmark.png 1x, /brand/logo-wordmark@2x.png 2x"
          alt="Carga360go"
          width={220}
          height={50}
        />
        <p className={styles.secundario}>BASSAM 360 — Centro Ejecutivo Inteligente</p>
        <h1>Bandeja de documentos</h1>
        <p className={styles.lede}>El asistente no aprueba solo. No ejecuta SQL ni ve secretos. Una persona usa los botones.</p>
        <AsistenteEjecutivo />
        <p><a className={styles.enlace} href="/api/admin/bassam360?formato=csv">Descargar indicadores</a></p>
        <div className={styles.counts} aria-label="Conteos">
          <p><span>Viajes</span><strong>{vista.viajes}</strong></p>
          <p><span>Camiones</span><strong>{vista.camiones}</strong></p>
          <p><span>Clientes</span><strong>{vista.clientes}</strong></p>
          <p><span>Docs BASSAM</span><strong>{vista.docs}</strong></p>
        </div>
        <p className={styles.meta}>GPS: --. Agentes: --. WhatsApp: --.</p>
        <DocumentReview
          panel={pendientes(panelAcreditacion())}
          conteos={conteos}
          correccion
          endpoint="/api/admin/bassam360"
          vacio="Sin datos"
          etiquetas={{ aprobar: "Autorizar", rechazar: "Rechazar", pedir_correccion: "Solicitar revisión" }}
        />
      </section>
    </div>
  );
}
