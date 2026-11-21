import Link from "next/link";
import type { PanelOrbita as Datos } from "@/lib/control/panel-orbita";
import styles from "./panel-orbita.module.css";

export function PanelOrbita({ datos }: { datos: Datos }) {
  return (
    <section className={styles.panel} aria-label="Centro de control ÓRBITA">
      <header className={styles.encabezado}>
        <p className={styles.marca}>Plataforma ÓRBITA · Sistema Carga360go</p>
        <h1>Centro de control ÓRBITA</h1>
        <p>Solo administración. El ingreso de administrador ya exige el código de verificación. Si no hay registros, se muestra «--» o «Sin datos».</p>
      </header>
      <div className={styles.kpis}>
        {datos.kpis.map((item) => (
          <article className={styles.kpi} key={item.etiqueta}>
            <span>{item.etiqueta}</span>
            <b>{item.valor}</b>
            <p className={styles.nota}>{item.nota}</p>
          </article>
        ))}
      </div>
      <div>
        <h2>Flujo operacional</h2>
        <div className={styles.flujo}>
          {datos.flujo.map((paso) => (
            <article className={styles.paso} key={paso.id}>
              <strong>{paso.titulo}</strong>
              <b>{paso.valor}</b>
              <small>{paso.nota}</small>
            </article>
          ))}
        </div>
      </div>
      <div id="autorizaciones">
        <h2>Autorizaciones pendientes</h2>
        <p className={styles.nota}>Autorizar y rechazar usan el mismo control de cuentas y documentos que ya está en esta página y en acreditación.</p>
        <p>
          <Link href="/admin/transportistas">Abrir acreditación</Link>
        </p>
      </div>
      <div>
        <h2>Automatizaciones</h2>
        <div className={styles.autos}>
          {datos.automatizaciones.map((item) => (
            <article className={styles.auto} key={item.nombre}>
              <div>
                <strong>{item.nombre}</strong>
                <small>{item.nota}</small>
              </div>
              <span className={styles.estado}>{item.estado}</span>
            </article>
          ))}
        </div>
      </div>
      <article className={styles.costos}>
        <h2>Costos de flete</h2>
        <p>{datos.costos.diesel}</p>
        <p>{datos.costos.peajes}</p>
        <p>
          <Link href="/admin/costos">Abrir costos: peajes, diésel y desglose</Link>
        </p>
      </article>
    </section>
  );
}
