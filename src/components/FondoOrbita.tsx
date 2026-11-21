"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/portada.module.css";

/**
 * Animación generativa de la portada.
 * Para sustituirla por el loop oficial, asigna la ruta del archivo en VIDEO_LOOP
 * (video/mp4 o video/webm). No hay archivo de video en el repositorio.
 */
const VIDEO_LOOP = "";

const ENTRADA_MS = 1800;

type Punto = { x: number; y: number };

const RUTA: Punto[] = [
  { x: 0.16, y: 0.74 },
  { x: 0.48, y: 0.6 },
  { x: 0.84, y: 0.72 },
];
const NOMBRES = ["Carga", "Camión", "Destino"];

function curva(t: number): Punto {
  const p0 = RUTA[0];
  const p1 = RUTA[1];
  const p2 = RUTA[2];
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function dibujar(ctx: CanvasRenderingContext2D, ancho: number, alto: number, ahora: number, inicio: number, puntos: Punto[]) {
  const progreso = Math.min(1, (ahora - inicio) / ENTRADA_MS);
  const giro = progreso >= 1 ? (ahora - inicio - ENTRADA_MS) * 0.00015 : 0;
  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  for (const punto of puntos) {
    ctx.beginPath();
    ctx.arc(punto.x * ancho, punto.y * alto, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,80,1,0.16)";
  ctx.lineWidth = 1;
  const malla = estrechoDe(ancho) ? 4 : 6;
  for (let i = 0; i < malla; i += 1) {
    const ax = ((i * 0.17) % 1) * ancho;
    const ay = ((i * 0.23) % 1) * alto;
    const bx = (((i + 2) * 0.19) % 1) * ancho;
    const by = (((i + 1) * 0.29) % 1) * alto;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,80,1,0.28)";
    ctx.beginPath();
    ctx.arc(ax, ay, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,80,1,0.85)";
  ctx.beginPath();
  const pasos = Math.max(2, Math.floor(48 * progreso));
  for (let i = 0; i <= pasos; i += 1) {
    const punto = curva(i / 48);
    const x = punto.x * ancho;
    const y = punto.y * alto;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  RUTA.forEach((nodo, indice) => {
    if (progreso < (indice + 1) / 3) return;
    ctx.fillStyle = indice === 1 ? "#FF5001" : "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(nodo.x * ancho, nodo.y * alto, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "400 11px sans-serif";
    ctx.fillText(NOMBRES[indice], nodo.x * ancho + 8, nodo.y * alto - 8);
  });

  const cx = ancho * 0.72;
  const cy = alto * 0.28;
  const radio = Math.min(ancho, alto) * 0.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(giro);
  ctx.strokeStyle = "rgba(255,80,1,0.22)";
  ctx.beginPath();
  ctx.arc(0, 0, radio, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#FF5001";
  ctx.lineWidth = 2;
  const arco = -Math.PI / 2 + progreso * Math.PI * 2 + giro * 8;
  ctx.beginPath();
  ctx.arc(0, 0, radio, arco, arco + 0.7);
  ctx.stroke();
  ctx.restore();
}

function estrechoDe(ancho: number) {
  return ancho < 900;
}

export function FondoOrbita() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setReduce(media.matches);
    aplicar();
    media.addEventListener("change", aplicar);
    return () => media.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    if (reduce || VIDEO_LOOP) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    const estrecho = window.matchMedia("(max-width: 800px)").matches;
    const cantidad = estrecho ? 28 : 56;
    const puntos: Punto[] = Array.from({ length: cantidad }, (_, i) => ({
      x: ((i * 97) % 1000) / 1000,
      y: ((i * 53) % 1000) / 1000,
    }));
    const inicio = performance.now();
    let marco = 0;
    let visible = true;
    let pestana = true;
    let ancho = 0;
    let alto = 0;

    const medir = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, estrecho ? 1 : 1.25);
      const siguienteAncho = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const siguienteAlto = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (siguienteAncho === ancho && siguienteAlto === alto) return;
      ancho = siguienteAncho;
      alto = siguienteAlto;
      canvas.width = ancho;
      canvas.height = alto;
    };

    const paso = (ahora: number) => {
      marco = 0;
      if (!visible || !pestana) return;
      medir();
      dibujar(ctx, ancho, alto, ahora, inicio, puntos);
      marco = window.requestAnimationFrame(paso);
    };

    const arrancar = () => {
      if (marco || !visible || !pestana) return;
      marco = window.requestAnimationFrame(paso);
    };
    const frenar = () => {
      if (marco) window.cancelAnimationFrame(marco);
      marco = 0;
    };

    const observador = new IntersectionObserver(([entrada]) => {
      visible = entrada.isIntersecting;
      if (visible) arrancar();
      else frenar();
    });
    observador.observe(canvas);
    const alCambiar = () => {
      pestana = document.visibilityState === "visible";
      if (pestana) arrancar();
      else frenar();
    };
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("resize", medir);
    arrancar();
    return () => {
      frenar();
      observador.disconnect();
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("resize", medir);
    };
  }, [reduce]);

  if (VIDEO_LOOP) {
    return (
      <video className={styles.fondo} src={VIDEO_LOOP} poster="/orbita/poster.svg" autoPlay muted loop playsInline />
    );
  }

  return (
    <div className={styles.fondo} aria-hidden="true">
      <img className={styles.poster} src="/orbita/poster.svg" alt="" />
      {reduce ? null : <canvas ref={canvasRef} className={styles.lienzo} />}
    </div>
  );
}
