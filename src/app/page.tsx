import type { Metadata } from "next";
import Link from "next/link";
import { webChatEnabled } from "@/lib/chat/config";
import { getDb } from "@/lib/db";
import { liveStats } from "@/lib/stats";
import { aiReady, waConfig } from "@/lib/whatsapp/config";
import styles from "./home.module.css";

export const metadata: Metadata = { alternates: { canonical: "/" } };

function gpsEstado(): string {
  try {
    const table = getDb().prepare(`SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'trip_gps_points'`).get() as { n: number } | undefined;
    if (!table) return "Sin conexión";
    const row = getDb().prepare(`SELECT COUNT(*) AS n FROM trip_gps_points`).get() as { n: number };
    return row.n > 0 ? "Con datos" : "Sin conexión";
  } catch {
    return "Sin conexión";
  }
}

function documentosEstado(): string {
  try {
    const row = getDb().prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number };
    return row.n > 0 ? String(row.n) : "Sin datos";
  } catch {
    return "Sin datos";
  }
}

const TRAMOS = [
  {
    kicker: "En crecimiento",
    title: "Ordenar la primera red",
    text: "Cargas, camiones y documentos en una sola web. El volumen de envíos de esta etapa no está medido.",
  },
  {
    kicker: "En expansión",
    title: "Más rutas, el mismo equipo",
    text: "El agente revisa la acreditación. Gerencia solo confirma que vio ese trabajo.",
  },
  {
    kicker: "A gran escala",
    title: "Varias regiones, un criterio",
    text: "El mapa usa los avisos reales. No hay una cifra de red nacional inventada.",
  },
];

export default function HomePage() {
  const avisos = liveStats().activeLoads;
  const chat = webChatEnabled() && aiReady();
  const whatsapp = waConfig().envEnabled ? "Encendido" : "Apagado";
  const correo = process.env.SMTP_HOST?.trim() ? "En el sitio" : "Sin conexión";
  const voz = ["1", "true", "on"].includes((process.env.VOICE_ENABLED || "").trim().toLowerCase()) ? "En el sitio" : "Sin conexión";
  const nodos = [
    { nombre: "Voz", estado: voz },
    { nombre: "WhatsApp", estado: whatsapp },
    { nombre: "Correo", estado: correo },
    { nombre: "GPS", estado: gpsEstado() },
    { nombre: "Documentos", estado: documentosEstado() },
    { nombre: "Cotizador", estado: "En el sitio" },
  ];

  return (
    <>
      <section className={styles.hero}>
        <div className={`wrap ${styles.heroGrid}`}>
          <div>
            <p className={styles.kicker}>Carga360go</p>
            <h1>El agente de la web, en el centro de la operación.</h1>
            <p className={styles.lead}>
              Alrededor solo están las piezas de esta plataforma. Si una no está encendida, se dice. No hay marcas ajenas conectadas.
            </p>
            <p className={styles.volume}>{avisos > 0 ? `${avisos} avisos vigentes en la base` : "Volumen de envíos: Sin datos"}</p>
            <div className={styles.cta}>
              <Link className={styles.primary} href="/registro">
                Registrar empresa o transportista
              </Link>
              <Link className={styles.secondary} href="/herramientas/calculadora">
                Abrir el cotizador
              </Link>
            </div>
          </div>
          <div className={styles.hub} aria-label="Agente y extensiones reales">
            <div className={styles.core}>
              <span>Centro</span>
              <strong>Agente de la web</strong>
              <em>{chat ? "Chat web encendido" : "Sin conexión"}</em>
            </div>
            <ul>
              {nodos.map((nodo) => (
                <li key={nodo.nombre}>
                  <span>{nodo.nombre}</span>
                  <strong>{nodo.estado}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className={styles.tramos} aria-label="Tres tramos de operación">
        <div className="wrap">
          <h2>Tres tramos. El volumen de cada uno es Sin datos.</h2>
          <div className={styles.tramoGrid}>
            {TRAMOS.map((tramo) => (
              <article key={tramo.kicker}>
                <p>{tramo.kicker}</p>
                <h3>{tramo.title}</h3>
                <p>{tramo.text}</p>
                <strong>Volumen: Sin datos</strong>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
