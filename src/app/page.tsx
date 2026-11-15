import type { Metadata } from "next";
import Link from "next/link";
import styles from "./home.module.css";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const PASOS = [
  { n: "1", title: "Datos", text: "Entra a Mi cuenta. El saludo usa el nombre de tu sesión." },
  { n: "2", title: "Subir documentos", text: "Arrastra los archivos. Transportista: licencia, padrón, SOAP, seguro obligatorio y seguro de carga. Mandante: RUT empresa, e-RUT, escritura y certificado de cuenta." },
  { n: "3", title: "Estado", text: "Ves Sin datos, En revisión o Acreditado. El admin confirma." },
];

const BENEFICIOS = [
  { title: "Un solo lugar", text: "Te acreditas en /mi-cuenta. No hay otra pantalla para adjuntar." },
  { title: "Dos caminos", text: "Publicar carga es para el mandante. Ofrecer el camión es para el transportista." },
  { title: "Sin aprobación automática", text: "El agente lee documentos reales y no aprueba solo." },
];

export default function HomePage() {
  return (
    <>
      <section className={styles.hero}>
        <div className="wrap">
          <h1>Conectamos cargas y camiones. Movemos la industria de Chile.</h1>
          <p className={styles.lead}>Elige cómo partes. Los dos botones te llevan a Mi cuenta para subir tus documentos.</p>
          <div className={styles.cta}>
            <Link className={`${styles.big} ${styles.primary}`} href="/mi-cuenta?rol=mandante">
              Publicar carga ahora
            </Link>
            <Link className={`${styles.big} ${styles.secondary}`} href="/mi-cuenta?rol=transportista">
              Ofrecer mi camión
            </Link>
          </div>
        </div>
      </section>
      <section className={styles.block}>
        <div className="wrap">
          <h2>Cómo funciona</h2>
          <div className={styles.steps}>
            {PASOS.map((paso) => (
              <article className={styles.card} key={paso.n}>
                <h3>
                  {paso.n}. {paso.title}
                </h3>
                <p>{paso.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className={styles.block}>
        <div className="wrap">
          <h2>Beneficios</h2>
          <div className={styles.benefits}>
            {BENEFICIOS.map((item) => (
              <article className={styles.card} key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
