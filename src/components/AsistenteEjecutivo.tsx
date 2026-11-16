"use client";

import styles from "./bassam-panel.module.css";

export function AsistenteEjecutivo() {
  return (
    <button
      type="button"
      className={styles.principal}
      onClick={() => window.dispatchEvent(new Event("c360-abrir-agente"))}
    >
      Asistente IA ejecutivo
    </button>
  );
}
