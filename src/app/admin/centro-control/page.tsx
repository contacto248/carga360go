import type { Metadata } from "next";
import Link from "next/link";
import { CentroAgente } from "@/components/CentroAgente";
import styles from "@/components/centro-control.module.css";
import { RegionsDashboard } from "@/components/RegionsDashboard";
import { vistaCentro } from "@/lib/bassam/centro";
import { getCurrentUser } from "@/lib/current-user";
import { regionIndicators } from "@/lib/stats";

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

export default async function CentroControlPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap">
        <section className={styles.layout}>
          <div className={styles.main}>
            <h1>Centro de control</h1>
            <p className={styles.lede}>Solo la sesión de administrador entra aquí.</p>
            <Link href="/ingreso?next=/admin/centro-control">Ingresar</Link>
          </div>
        </section>
      </div>
    );
  }
  const vista = vistaCentro();
  const regiones = regionIndicators();
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
          <h1>Centro de control</h1>
          <p className={styles.lede}>Conteos de la base. Si no hay filas, se muestra --.</p>
          <section id="vista">
            <div className={styles.counts} aria-label="Conteos">
              <p><span>Cargas</span><strong>{vista.cargas}</strong></p>
              <p><span>Camiones</span><strong>{vista.camiones}</strong></p>
              <p><span>Documentos</span><strong>{vista.documentos}</strong></p>
              <p><span>Agente</span><strong>{vista.agente}</strong></p>
            </div>
            <RegionsDashboard regions={regiones} compact />
          </section>
          <section className={styles.section} id="operaciones">
            <h2>Operaciones</h2>
            <p>Cargas reales: {vista.cargas}</p>
          </section>
          <section className={styles.section} id="camiones">
            <h2>Camiones y viajes</h2>
            <p>Camiones reales: {vista.camiones}. El mapa no agrega camiones.</p>
          </section>
          <section className={styles.section} id="clientes">
            <h2>Clientes</h2>
            <p>Cuentas de transportista y mandante: {vista.clientes}</p>
          </section>
          <section className={styles.section} id="agentes">
            <h2>Agentes IA</h2>
            <CentroAgente estado={vista.agenteEstado} />
          </section>
          <section className={styles.section} id="cotizador">
            <h2>Cotizador</h2>
            <p>Cotizaciones guardadas: {vista.cotizador}</p>
          </section>
          <section className={styles.section} id="comunicaciones">
            <h2>Comunicaciones</h2>
            <p>WhatsApp: Por verificar</p>
          </section>
          <section className={styles.section} id="seguridad">
            <h2>Seguridad</h2>
            <p>Por verificar</p>
          </section>
          <section className={styles.section} id="tareas">
            <h2>Tareas y soporte</h2>
            <p>{vista.tareas}</p>
          </section>
        </div>
      </section>
    </div>
  );
}
