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
  const motionRef = useRef<SVGSVGElement>(null);
  const carga = sesion ? "/cargas/nueva" : `/ingreso?next=${encodeURIComponent("/cargas/nueva")}`;
  const transporte = sesion ? "/camiones/nuevo" : `/ingreso?next=${encodeURIComponent("/camiones/nuevo")}`;

  useEffect(() => {
    const stage = stageRef.current;
    const motion = motionRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const sync = () => {
      if (motion) {
        if (reduce.matches) motion.pauseAnimations();
        else motion.unpauseAnimations();
      }
      if (reduce.matches && stage) stage.style.setProperty("--py", "0px");
    };
    const onScroll = () => {
      if (!stage || reduce.matches) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        stage.style.setProperty("--py", `${Math.min(window.scrollY, 800)}px`);
      });
    };
    sync();
    onScroll();
    reduce.addEventListener("change", sync);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
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
          <p className={styles.lead}>Conectamos carga y camiones de todo Chile en un solo panel, claro y verificado.</p>
          <div className={styles.ctaRow}>
            <Link className={styles.cta} href={carga}>
              Necesito transportar carga
            </Link>
            <Link className={styles.secondary} href={transporte}>
              Soy transportista
            </Link>
          </div>
        </div>
        <div className={styles.product} aria-hidden="true">
          <div className={styles.slotMap}>
            <article className={styles.mock}>
              <svg className={styles.mapSvg} viewBox="0 0 80 160">
                <path d="M40 6 L50 16 L46 34 L54 52 L48 74 L56 98 L50 124 L44 150 L34 136 L38 110 L30 88 L38 66 L32 44 L38 22 Z" fill="none" stroke="#8a8a8a" strokeWidth="1.2" />
                <path d="M44 30 C 38 58, 52 86, 42 128" fill="none" stroke="#FF5001" strokeWidth="1.2" />
              </svg>
            </article>
          </div>
          <div className={styles.slotRoute}>
            <article className={styles.mock}>
              <svg ref={motionRef} className={styles.routeSvg} viewBox="0 0 240 64">
                <path d="M8 40 C 50 8, 90 58, 140 28 S 200 8, 232 36" fill="none" stroke="#3a3a3a" strokeWidth="1.25" />
                <path className={styles.dash} d="M8 40 C 50 8, 90 58, 140 28 S 200 8, 232 36" fill="none" stroke="#FF5001" strokeWidth="1.25" />
                <circle r="3" fill="#FF5001">
                  <animateMotion dur="8s" repeatCount="indefinite" path="M8 40 C 50 8, 90 58, 140 28 S 200 8, 232 36" />
                </circle>
              </svg>
            </article>
          </div>
          <div className={styles.slotStep}>
            <article className={`${styles.mock} ${styles.stepMock}`}>
              <svg width="22" height="22" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" fill="none" stroke="#FF5001" strokeWidth="1.25" />
                <path d="M7 12.5 L10.5 16 L17 8.5" fill="none" stroke="#FF5001" strokeWidth="1.25" />
              </svg>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
