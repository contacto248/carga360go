"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { FLETE_EMPRESA, FLETE_TRANSPORTISTA } from "@/lib/bassam/flete";
import { BRAND } from "@/lib/catalog";
import { waLink } from "@/lib/format";
import styles from "./flete-button.module.css";

export function FleteButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/admin")) return null;
  const empresa = waLink(BRAND.whatsapp, FLETE_EMPRESA);
  const transportista = waLink(BRAND.whatsapp, FLETE_TRANSPORTISTA);
  return (
    <div className={styles.dock}>
      {open ? (
        <section className={styles.panel} role="dialog" aria-labelledby="flete-title">
          <header className={styles.head}>
            <h2 id="flete-title">¿Necesitas Flete?</h2>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Cerrar">
              Cerrar
            </button>
          </header>
          <p>¿Eres empresa o transportista?</p>
          <a className={styles.link} href={empresa} target="_blank" rel="noopener noreferrer">
            Soy empresa y quiero publicar una carga
          </a>
          <a className={styles.link} href={transportista} target="_blank" rel="noopener noreferrer">
            Quiero ser transportista
          </a>
        </section>
      ) : null}
      <button type="button" className={styles.fab} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        ¿Necesitas Flete?
      </button>
    </div>
  );
}
