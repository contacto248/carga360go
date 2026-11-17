import { DocumentReview } from "@/components/DocumentReview";
import styles from "@/components/bassam-panel.module.css";
import { conteosControl, panelAcreditacion } from "@/lib/bassam/acreditacion";

/** Panel BASSAM: la misma revisión de acreditación que tenía /admin/bassam. */
export function ModuloPanelBassam() {
  const panel = panelAcreditacion();
  return (
    <section className={styles.shell} aria-labelledby="panel-bassam-titulo">
      <p className={styles.brand}>CARGA360GO · BASSAM 360</p>
      <h2 id="panel-bassam-titulo">Acreditación - Visión General</h2>
      <p className={styles.lede}>Cargas, camiones, documentos y el agente. Solo lo que está en la base.</p>
      <DocumentReview panel={panel} conteos={conteosControl()} />
    </section>
  );
}
