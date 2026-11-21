import type { Metadata } from "next";
import Link from "next/link";
import { CentroAgente } from "@/components/CentroAgente";
import styles from "@/components/centro-control.module.css";
import { MAP_H, MAP_W, REGION_SHAPES } from "@/lib/chile-map-data";
import { vistaCentro } from "@/lib/bassam/centro";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Centro de control", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const MENU = [
  ["vista", "Vista general"],
  ["operaciones", "Operaciones"],
  ["camiones", "Camiones y viajes"],
  ["clientes", "Clientes"],
  ["agentes", "Agentes IA"],
  ["cotizador", "Cotizador"],
  ["comunicaciones", "Comunicaciones"],
  ["seguridad", "Seguridad"],
  ["tareas", "Tareas y soporte"],
] as const;

const KPI = [
  ["viajes", "Viajes"],
  ["camiones", "Camiones"],
  ["clientes", "Clientes"],
  ["docs", "Documentos"],
] as const;

export default async function CentroControlPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap">
        <section className={styles.layout}>
          <div className={styles.main}>
            <h1>CENTRO DE CONTROL INTELIGENTE</h1>
            <p className={styles.lede}>Solo la sesión de administrador entra aquí.</p>
            <Link href="/ingreso?next=/admin/centro-control">Ingresar</Link>
          </div>
        </section>
      </div>
    );
  }
  const vista = vistaCentro();
  return (
    <div className="wrap">
      <section className={styles.layout}>
        <nav className={styles.side} aria-label="Centro de control">
          {MENU.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className={styles.main}>
          <h1>CENTRO DE CONTROL INTELIGENTE</h1>
          <section id="vista">
            <div className={styles.counts} aria-label="Conteos">
              {KPI.map(([key, label]) => (
                <p key={key}>
                  <span>{label}</span>
                  <strong>{vista[key]}</strong>
                </p>
              ))}
            </div>
            <div className={styles.section}>
              <h2>Esperando datos reales</h2>
              <svg className={styles.map} viewBox={`-4 -4 ${MAP_W + 8} ${MAP_H + 8}`} role="img" aria-label="Esperando datos reales">
                {Object.entries(REGION_SHAPES).map(([id, shape]) => (
                  <path key={id} d={shape.d} />
                ))}
              </svg>
            </div>
          </section>
          <section className={styles.section} id="operaciones">
            <h2>Operaciones</h2>
            <p>Viajes: {vista.viajes}</p>
          </section>
          <section className={styles.section} id="camiones">
            <h2>Camiones y viajes</h2>
            <p>Camiones: {vista.camiones}</p>
          </section>
          <section className={styles.section} id="clientes">
            <h2>Clientes</h2>
            <p>Clientes: {vista.clientes}</p>
          </section>
          <section className={styles.section} id="agentes">
            <h2>Agentes IA</h2>
            <p>--</p>
          </section>
          <section className={styles.section} id="cotizador">
            <h2>Cotizador</h2>
            <p>--</p>
          </section>
          <section className={styles.section} id="comunicaciones">
            <h2>Comunicaciones</h2>
            <p>WhatsApp: --</p>
          </section>
          <section className={styles.section} id="seguridad">
            <h2>Seguridad</h2>
            <p>--</p>
          </section>
          <section className={styles.section} id="tareas">
            <h2>Tareas y soporte</h2>
            <p>--</p>
          </section>
        </div>
        <aside className={styles.agents} aria-label="Agentes">
          <h2>Agentes</h2>
          <CentroAgente estado="--" />
        </aside>
      </section>
    </div>
  );
}
