import type { Metadata } from "next";
import Link from "next/link";
import { HomeTowerBoard } from "@/components/HomeTowerBoard";
import { PortadaInicio } from "@/components/PortadaInicio";
import { QuickSearch } from "@/components/QuickSearch";
import { WhatsAppChannel } from "@/components/WhatsAppChannel";
import { getCurrentUser } from "@/lib/current-user";
import { equipmentById } from "@/lib/catalog";
import { FAQ } from "@/lib/faq";
import { formatDateCL } from "@/lib/format";
import { recentListings, timeAgo, type RecentItem } from "@/lib/stats";
import styles from "./portada.module.css";

export const metadata: Metadata = {
  title: { absolute: "ORBITA - CARGA360GO — Trazabilidad y automatización de cargas y camiones en Chile" },
  description:
    "Carga360go conecta cargas y camiones en Chile. Dos accesos: necesito transportar carga o soy transportista. El historial registra publicación, ofertas y adjudicación. Sin GPS ni telemetría.",
  alternates: { canonical: "/" },
};

const FLOW = [
  {
    n: "01",
    title: "Publicar carga",
    text: "Origen, destino, fecha, peso y equipo. El sistema calcula un costo de referencia desglosado del flete.",
  },
  {
    n: "02",
    title: "Encontrar camión",
    text: "Carga360 Match compara ruta, fechas y capacidad, y muestra calces con razones claras.",
  },
  {
    n: "03",
    title: "Historial de eventos",
    text: "Cada carga registra publicación, ofertas y adjudicación con fecha y hora. Sin GPS ni telemetría.",
  },
  {
    n: "04",
    title: "Historial en tu panel",
    text: "El estado de la publicación, las ofertas y la adjudicación quedan registrados. El contacto se abre solo al adjudicar.",
  },
];

function bolsa(): { estado: "ok"; items: RecentItem[] } | { estado: "error" } {
  try {
    return { estado: "ok", items: recentListings(4) };
  } catch {
    return { estado: "error" };
  }
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const reciente = bolsa();

  return (
    <div>
      <PortadaInicio sesion={Boolean(user)} />

      <section className={styles.journey} aria-labelledby="pasos-titulo">
        <div className={styles.journeyGrid}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Así imaginamos la experiencia</p>
              <h2 id="pasos-titulo">Del primer dato al siguiente paso.</h2>
            </div>
            <p>Una sola secuencia. La torre es una demostración, no la operación de tu cuenta.</p>
          </div>
          <p className={styles.demoNote}>Demostración. Visualización ilustrativa, no es GPS real.</p>
          <HomeTowerBoard steps={FLOW} compact />
        </div>
      </section>

      <section className={styles.trust} aria-labelledby="verificados-titulo">
        <div className={styles.trustGrid}>
          <article className={styles.trustCard}>
            <p className={styles.eyebrow}>Confianza y cumplimiento</p>
            <h2 id="verificados-titulo">Transportistas verificados</h2>
            <ul className={styles.trustList}>
              <li>Correo confirmado</li>
              <li>Teléfono confirmado</li>
              <li>Cédula de identidad</li>
              <li>Padrón</li>
            </ul>
            <p>
              El transportista confirma correo y teléfono. Un administrador revisa la cédula y el padrón, además de la
              licencia, la revisión técnica, el SOAP y el permiso de circulación. No es un sello de solvencia, de
              seguridad ni de cumplimiento.{" "}
              <Link href="/como-verificamos">Cómo verificamos</Link>.
            </p>
          </article>
          <aside className={styles.ficha} aria-label="Ejemplo de ficha">
            <p className={styles.kicker}>Ejemplo de ficha · Demostración</p>
            <p>
              <strong>Cuenta en revisión</strong>
            </p>
            <p>Correo, teléfono, cédula y padrón. Ejemplo, no una cuenta real.</p>
            <p>No es una cuenta real ni un GPS. Sirve para mostrar qué se revisa antes de publicar.</p>
          </aside>
        </div>
      </section>

      <section className={`home-live-band ${styles.bolsa}`} aria-labelledby="bolsa-titulo">
        <div className="wrap">
          <h2 id="bolsa-titulo">Bolsa reciente</h2>
          <p className={styles.support}>Avisos reales y vigentes. Los filtros completos están en Cargas y Camiones.</p>
          <QuickSearch />
          <div className="tower-live" style={{ marginTop: 16 }}>
            <div className="lb-head">
              <span>Bolsa reciente</span>
              <Link href="/cargas" className="lb-all">
                Explorar bolsa
              </Link>
            </div>
            {reciente.estado === "error" ? (
              <div className="lb-empty">
                <strong>No pudimos cargar la bolsa.</strong>
                <p>Inténtalo de nuevo en unos minutos. No mostramos avisos de ejemplo.</p>
              </div>
            ) : reciente.items.length === 0 ? (
              <div className="lb-empty">
                <strong>La bolsa está en espera de avisos reales.</strong>
                <p>
                  Publica tu carga o tu camión desde «Necesito transportar carga» o «Soy transportista». Cuando el aviso
                  esté vigente, aparece en esta lista. Desde aquí no se publica nada.
                </p>
              </div>
            ) : (
              <ul className="lb-list">
                {reciente.items.map((item) => {
                  const eq = equipmentById(item.equipment);
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link href={`/${item.kind === "carga" ? "cargas" : "camiones"}/${item.id}`}>
                        <span className={`lb-kind ${item.kind}`}>{item.kind === "carga" ? "Carga" : "Camión"}</span>
                        <span className="lb-route">
                          {item.origin} → {item.destination}
                        </span>
                        <span className="lb-meta">
                          {eq.label} · {item.amount} · {item.kind === "carga" ? "retiro" : "desde"} {formatDateCL(item.date)}
                          {item.verified ? " · verificado" : ""}
                        </span>
                        <span className="lb-time">{timeAgo(item.createdAt)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className={styles.tech} aria-labelledby="tech-titulo">
        <div className="wrap">
          <h2 id="tech-titulo">Tecnología, seguridad y calidad</h2>
          <p className={styles.support}>
            Empresas y mandantes publican carga. Transportistas publican equipo y retorno. El contacto se abre solo al
            adjudicar. Las demostraciones de trazabilidad están en Tecnología.
          </p>
          <p>
            <Link href="/tecnologia">Abrir Tecnología</Link>
          </p>
        </div>
      </section>

      <section className={styles.faq} id="faq" aria-labelledby="faq-titulo">
        <div className="wrap">
          <h2 id="faq-titulo">Preguntas frecuentes</h2>
          <div className="faq" style={{ marginTop: 12 }}>
            {FAQ.slice(0, 4).map((item) => (
              <details key={item.q} className={`card ${styles.ficha}`}>
                <summary>{item.q}</summary>
                <p>
                  {item.q === "¿Qué significa verificado?" ? (
                    <>
                      Que revisamos contacto y, en transportistas, documentos vigentes, con aprobación de un administrador.
                      No es una garantía de solvencia, seguridad ni cumplimiento. Ver <Link href="/como-verificamos">Cómo verificamos</Link>.
                    </>
                  ) : item.q === "¿Cómo se calcula el costo del flete?" ? (
                    <>
                      Con la ruta, los peajes según los ejes, el diésel y los costos de operación: un costo de referencia
                      desglosado. No es una cotización cerrada ni una contratación.
                    </>
                  ) : (
                    item.a
                  )}
                </p>
              </details>
            ))}
          </div>
          <p style={{ marginTop: 12 }}>
            <Link href="/faq">Ver todas las preguntas</Link>
          </p>
        </div>
      </section>

      <section className={styles.closeNote}>
        <div className="wrap">
          <p>
            Escribe a AI.CARGA360 desde el botón del pie. Es el único acceso al asistente en esta portada. El canal de
            WhatsApp es para novedades, no para soporte ni seguimiento.
          </p>
          <WhatsAppChannel />
        </div>
      </section>
    </div>
  );
}
