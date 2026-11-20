import { DocumentReview } from "@/components/DocumentReview";
import styles from "@/components/bassam-panel.module.css";
import { conteosControl, panelAcreditacion } from "@/lib/bassam/acreditacion";
import { marcaConteo, vistaCentro } from "@/lib/bassam/centro";
import type { PanelAcreditacion } from "@/lib/bassam/types";

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

/** BASSAM 360: bandeja ejecutiva. Las acciones humanas siguen siendo Autorizar, Rechazar y Solicitar revisión. */
export function ModuloBassam360() {
  const vista = vistaCentro();
  const base = conteosControl();
  const conteos = {
    cargas: marcaConteo(base.cargas),
    camiones: marcaConteo(base.camiones),
    documentos: marcaConteo(base.documentos),
    agente: marcaConteo(base.agente),
  };
  return (
    <section className={`${styles.shell} ${styles.ejecutivo}`} aria-labelledby="bassam360-titulo">
      <img
        className={styles.marca}
        src="/brand/logo-wordmark-negro.png"
        srcSet="/brand/logo-wordmark-negro.png 1x, /brand/logo-wordmark-negro@2x.png 2x"
        alt="Carga360go"
        width={220}
        height={50}
      />
      <p className={styles.secundario}>BASSAM 360 — Centro Ejecutivo Inteligente</p>
      <h2 id="bassam360-titulo">Bandeja de documentos</h2>
      <p className={styles.lede}>El asistente no aprueba solo. No ejecuta SQL ni ve secretos. Una persona usa los botones.</p>
      <p>
        <a className={styles.enlace} href="/api/admin/bassam360?formato=csv">
          Descargar indicadores
        </a>
      </p>
      <div className={styles.counts} aria-label="Conteos">
        <p>
          <span>Viajes</span>
          <strong>{vista.viajes}</strong>
        </p>
        <p>
          <span>Camiones</span>
          <strong>{vista.camiones}</strong>
        </p>
        <p>
          <span>Clientes</span>
          <strong>{vista.clientes}</strong>
        </p>
        <p>
          <span>Docs BASSAM</span>
          <strong>{vista.docs}</strong>
        </p>
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
  );
}
