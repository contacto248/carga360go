"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "@/app/portada.module.css";

const STARS = [
  [8, 12], [18, 40], [27, 18], [36, 62], [44, 28], [53, 74], [61, 16], [70, 48],
  [78, 22], [86, 66], [14, 78], [24, 88], [48, 84], [66, 90], [90, 38], [33, 46],
  [57, 8], [82, 12], [12, 55], [95, 72],
] as const;

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
    <section className={`hero-fold ${styles.stage}`} id="inicio" ref={stageRef}>
      <div className={styles.field} aria-hidden="true">
        <svg className={styles.routes} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          {STARS.map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r={index % 5 === 0 ? 0.35 : 0.22} fill={index % 4 === 0 ? "#FF5001" : "#ffffff"} opacity={index % 3 === 0 ? 0.85 : 0.45} />
          ))}
        </svg>
        <div className={styles.orbitWrap}>
          <svg className={styles.orbits} viewBox="0 0 800 800">
            <g className={styles.spin}>
              <ellipse cx="400" cy="400" rx="280" ry="108" fill="none" stroke="#3a3a3a" strokeWidth="1" />
              <ellipse cx="400" cy="400" rx="196" ry="74" fill="none" stroke="#FF5001" strokeWidth="1" transform="rotate(24 400 400)" />
              <circle cx="680" cy="400" r="2.5" fill="#FF5001" />
            </g>
            <g className={styles.spinSlow}>
              <ellipse cx="400" cy="400" rx="340" ry="132" fill="none" stroke="#2a2a2a" strokeWidth="1" transform="rotate(-18 400 400)" />
              <circle cx="400" cy="268" r="2" fill="#ffffff" />
            </g>
          </svg>
        </div>
      </div>
      <div className={styles.veil} />
      <div className={styles.panel}>
        <div className={styles.copy}>
          {/* Titular en uso: "Tu carga, en el centro." Alternativas: "Menos ruido. Más claridad." y "Ningún camión vuelve vacío." */}
          <p className={styles.mark}>Plataforma ÓRBITA · Sistema Carga360go</p>
          <h1 className={`brand-hero ${styles.title}`}>Tu carga, en el centro.</h1>
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
        <div className={styles.product}>
          <p className={styles.sample}>Vista de ejemplo</p>
          <div className={styles.slotMap}>
            <article className={styles.mock}>
              <strong>Chile</strong>
              <svg className={styles.mapSvg} viewBox="0 0 90 200" aria-hidden="true">
                <path d="M46 8 L58 18 L52 36 L62 54 L54 78 L64 104 L56 132 L50 168 L40 186 L32 168 L38 140 L28 112 L36 86 L30 58 L40 34 Z" fill="none" stroke="#8a8a8a" strokeWidth="1.4" />
                <path className={styles.draw} d="M48 52 C 44 78, 52 104, 46 136" fill="none" stroke="#FF5001" strokeWidth="1.6" pathLength="100" />
              </svg>
            </article>
          </div>
          <div className={styles.slotRoute}>
            <article className={styles.mock}>
              <strong>Carga en tránsito</strong>
              <p>La Serena → Santiago</p>
              <div className={styles.track} aria-hidden="true">
                <span className={styles.bar} />
              </div>
            </article>
          </div>
          <div className={styles.slotDocs}>
            <article className={`${styles.mock} ${styles.stepMock}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke="#FF5001" strokeWidth="1.25" />
                <path d="M7 12.5 L10.5 16 L17 8.5" fill="none" stroke="#FF5001" strokeWidth="1.25" />
              </svg>
              <strong>Documentos validados</strong>
            </article>
          </div>
          <div className={styles.slotEq}>
            <article className={styles.mock}>
              <strong>Equipo: cama baja</strong>
              <svg className={styles.rig} viewBox="0 0 120 36" aria-hidden="true">
                <path d="M8 22 H78 L92 14 H108" fill="none" stroke="#FF5001" strokeWidth="1.4" />
                <path d="M18 22 V16 H70 V22" fill="none" stroke="#c8c8c8" strokeWidth="1.2" />
                <circle cx="28" cy="24" r="3" fill="none" stroke="#c8c8c8" strokeWidth="1.2" />
                <circle cx="64" cy="24" r="3" fill="none" stroke="#c8c8c8" strokeWidth="1.2" />
                <circle cx="100" cy="24" r="3" fill="none" stroke="#c8c8c8" strokeWidth="1.2" />
              </svg>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
