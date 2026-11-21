"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { FondoOrbita } from "@/components/FondoOrbita";
import styles from "@/app/portada.module.css";

export function PortadaInicio({ sesion }: { sesion: boolean }) {
  const stageRef = useRef<HTMLElement>(null);
  const carga = sesion ? "/cargas/nueva" : `/ingreso?next=${encodeURIComponent("/cargas/nueva")}`;
  const transporte = sesion ? "/camiones/nuevo" : `/ingreso?next=${encodeURIComponent("/camiones/nuevo")}`;

  useEffect(() => {
    const stage = stageRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let idle = 0;
    let usedIdle = false;
    const sync = () => {
      if (reduce.matches && stage) stage.style.setProperty("--py", "0px");
    };
    const onScroll = () => {
      if (!stage || reduce.matches || !stage.classList.contains(styles.live)) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        stage.style.setProperty("--py", `${Math.min(window.scrollY, 800)}px`);
      });
    };
    const arrancar = () => {
      stage?.classList.add(styles.live);
      sync();
      onScroll();
    };
    if (reduce.matches) arrancar();
    else {
      usedIdle = true;
      idle = window.requestIdleCallback(arrancar, { timeout: 1600 });
    }
    reduce.addEventListener("change", sync);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (usedIdle) window.cancelIdleCallback(idle);
      reduce.removeEventListener("change", sync);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <>
    <section className={`hero-fold ${styles.stage}`} id="inicio" ref={stageRef}>
      <FondoOrbita />
      <div className={styles.veil} />
      <div className={styles.panel}>
        <div className={styles.copy}>
          {/* Titular en uso: "Tu carga, en el centro." Alternativas: "Menos ruido. Más claridad." y "Ningún camión vuelve vacío." */}
          <div className={styles.marca}>
            <svg className={styles.isotipo} viewBox="0 0 64 64" aria-hidden="true">
              <circle className={styles.anillo} cx="32" cy="32" r="26" fill="none" stroke="#FF5001" strokeWidth="1" />
              <rect className={styles.contenedor} x="22" y="24" width="20" height="14" fill="#FF5001" />
            </svg>
            <span className={styles.separador} aria-hidden="true" />
            <p className={styles.wordmark}>
              Plataforma <span>ÓRBITA</span> · Sistema <span>Carga360go</span>
            </p>
          </div>
          <h1 className={`brand-hero ${styles.title}`}>Tu carga, en el centro.</h1>
          <p className={styles.tagline}>Descubre la nueva era</p>
          <p className={styles.lead}>
            Plataforma tecnológica de carga y retorno en Chile. Conectamos carga y camiones en un solo panel, claro y verificado.
          </p>
          <div className={styles.ctaRow}>
            <Link className={styles.cta} href={carga}>
              Necesito transportar carga
            </Link>
            <Link className={styles.secondary} href={transporte}>
              Soy transportista
            </Link>
          </div>
        </div>
      </div>
    </section>
    <section className={styles.ejemplo} aria-label="Vista de ejemplo">
      <div className={styles.fragmento}>
        <p className={styles.sample}>Vista de ejemplo</p>
        <svg className={styles.esquema} viewBox="0 0 220 120" aria-hidden="true">
          <path d="M108 8 L128 16 L118 36 L132 52 L118 78 L128 100 L108 112 L90 98 L98 74 L84 54 L96 32 Z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
          <path d="M112 28 C 108 48, 116 70, 110 92" fill="none" stroke="#FF5001" strokeWidth="1.25" />
          <circle cx="112" cy="28" r="2" fill="#FF5001" />
          <circle cx="110" cy="92" r="2" fill="#fff" />
        </svg>
        <dl>
          <div>
            <dt>Tramo</dt>
            <dd>La Serena → Santiago</dd>
          </div>
          <div>
            <dt>Equipo</dt>
            <dd>Cama baja</dd>
          </div>
        </dl>
      </div>
    </section>
    </>
  );
}
