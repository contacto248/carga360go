import type { Metadata } from "next";
import Link from "next/link";
import { WhatsAppChannel } from "@/components/WhatsAppChannel";
import { DestinoPendiente, Proximamente, Transparencia } from "@/components/rediseno/Piezas";

export const metadata: Metadata = {
  title: { absolute: "Carga360go · Cargas, camiones y retornos en Chile" },
  description:
    "Publica tu carga, tu camión o tu retorno, encuentra el calce por ruta, fecha y equipo, y ve un costo de referencia desglosado. De Arica a Punta Arenas.",
  alternates: { canonical: "/" },
};

const PASOS = [
  {
    title: "Publica.",
    text: "Tu carga, tu camión o tu viaje de vuelta, con ruta, fechas y equipo.",
  },
  {
    title: "Calza.",
    text: "Carga360go cruza equipo, capacidad, ruta y fechas, y te muestra por qué calza.",
  },
  {
    title: "Te avisamos.",
    text: "Si no hay calce hoy, guarda una alerta y te escribimos por correo cuando aparezca uno.",
  },
  {
    title: "Eliges y coordinas.",
    text: "El mandante adjudica la oferta y recién ahí se abre el contacto entre las partes.",
  },
];

const FAQ = [
  {
    q: "¿Carga360go transporta mi carga?",
    a: "No. Carga360go conecta a mandantes con transportistas. El transporte, el acuerdo y el valor final quedan entre las partes.",
  },
  {
    q: "¿Necesito registrarme para cotizar?",
    a: "No. El cotizador se usa sin registro. Para publicar u ofertar necesitas una cuenta acreditada.",
  },
  {
    q: "¿Funciona fuera del norte?",
    a: "Sí. Puedes publicar en todo Chile, de Arica a Punta Arenas. El norte minero es nuestro foco de entrada.",
  },
  {
    q: "¿Cuándo veo el contacto de la otra parte?",
    a: "Cuando el mandante adjudica la oferta, y solo para ese flete.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="hero hero-fold" aria-labelledby="inicio-titulo">
        <div className="wrap hero-copy">
          <p className="brand-hero">Carga360go</p>
          <h1 id="inicio-titulo">Cargas, camiones y retornos en Chile, de Arica a Punta Arenas.</h1>
          <p className="hero-lead">
            Publica tu carga o tu camión y encuentra el calce por ruta, fecha y equipo, también en retornos. Ve un costo
            de referencia desglosado: ruta, peajes según ejes, diésel y costos de operación, cada uno con su fuente.
          </p>
          <div className="cta">
            <Link className="btn" href="/cargas/nueva">
              Tengo carga
            </Link>
          </div>
          <p className="hero-secondary-links">
            <Link href="/camiones/nuevo">Tengo camión o retorno</Link>
            <span aria-hidden="true"> · </span>
            <Link href="/herramientas/calculadora">Abrir el cotizador (sin registro)</Link>
          </p>
          <Transparencia />
        </div>
      </section>

      <section className="block" aria-labelledby="caminos-titulo">
        <div className="wrap">
          <h2 id="caminos-titulo">Elige tu camino</h2>
          <div className="grid c2">
            <article className="card">
              <h3>Si tienes carga</h3>
              <p>
                Publica tu carga y encuentra el camión que calza, con el costo del flete a la vista. Indicas ruta, fecha
                y equipo, recibes ofertas de transportistas acreditados y eliges. El contacto se abre solo cuando
                adjudicas.
              </p>
              <div className="rediseno-acciones">
                <Link className="btn sm" href="/cargas/nueva">
                  Publicar carga
                </Link>
                <DestinoPendiente>Conocer Carga360go para empresas</DestinoPendiente>
              </div>
            </article>
            <article className="card">
              <h3>Si tienes camión o retorno</h3>
              <p>
                Publica tu camión o tu retorno y te avisamos por correo cuando aparezca una carga que calza. Dejas tu
                corredor, tus fechas y la ficha de tu equipo, y ofreces tú el valor.
              </p>
              <div className="rediseno-acciones">
                <Link className="btn sm" href="/camiones/nuevo">
                  Publicar camión o retorno
                </Link>
                <DestinoPendiente>Conocer Carga360go para transportistas</DestinoPendiente>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="block alt" aria-labelledby="pasos-titulo">
        <div className="wrap">
          <h2 id="pasos-titulo">Así funciona Carga360go</h2>
          <ol className="pasos-rediseno">
            {PASOS.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="block" aria-labelledby="costo-titulo">
        <div className="wrap">
          <h2 id="costo-titulo">Mira de qué se compone el flete antes de ofertar</h2>
          <p>
            El cotizador arma un costo de referencia desglosado: ruta, peajes según ejes, diésel publicado por la CNE y
            costos de operación, cada uno con su fuente. Es una referencia para conversar con fundamento, no una
            cotización cerrada. El valor final lo acuerdan las partes.
          </p>
          <p>
            <Link className="btn sm" href="/herramientas/calculadora">
              Abrir el cotizador
            </Link>
          </p>
        </div>
      </section>

      <section className="block alt" aria-labelledby="minero-titulo">
        <div className="wrap">
          <h2 id="minero-titulo">Foco en el corredor minero: Calama, Antofagasta y Copiapó</h2>
          <p>
            Carga360go está abierta a carga general y masiva en todo Chile, de Arica a Punta Arenas. Empezamos con
            fuerza en el corredor minero del norte, donde el viaje pide un equipo concreto, una cama baja o un retorno
            que no quieres hacer vacío.
          </p>
          <ul>
            <li>
              <strong>Retornos.</strong> Publica tu viaje de vuelta y recibe una alerta por correo cuando aparezca una
              carga que calza por origen, destino, fechas, equipo y capacidad.
            </li>
            <li>
              <strong>Cama baja y maquinaria.</strong> La ficha pide ejes, ancho, capacidad y medidas, para que el
              mandante vea si el equipo calza antes de ofertar.
            </li>
            <li>
              <strong>Hacia y desde faena.</strong> Cargas de minería y de proveedores del corredor, con contacto
              protegido hasta adjudicar.
            </li>
          </ul>
          <div className="rediseno-acciones">
            <Link className="btn sm" href="/cargas-de-retorno-mineras">
              Publicar un retorno
            </Link>
            <Link className="btn sec sm" href="/transporte-minero-chile">
              Ver transporte minero
            </Link>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="torre-titulo">
        <div className="wrap">
          <div className="titulo-con-estado">
            <h2 id="torre-titulo">Torre de control: tus viajes ordenados en un solo panel</h2>
            <Proximamente />
          </div>
          <p>
            Hoy ya ves en tu panel la publicación, el calce, las ofertas y la adjudicación, con fecha y hora. Estamos
            preparando la torre de control para seguir cada viaje hasta la entrega.
          </p>
          <DestinoPendiente>Conocer la torre de control</DestinoPendiente>
        </div>
      </section>

      <section className="block alt" aria-labelledby="confianza-titulo">
        <div className="wrap">
          <h2 id="confianza-titulo">Cuentas revisadas y contacto protegido</h2>
          <ul>
            <li>
              <strong>Acreditación por una persona.</strong> Un administrador revisa el contacto y, en transportistas,
              los documentos vigentes antes de habilitar la cuenta.
            </li>
            <li>
              <strong>Aviso antes del vencimiento.</strong> Un semáforo de vencimientos avisa cuando un documento está
              por vencer.
            </li>
            <li>
              <strong>Contacto protegido.</strong> WhatsApp, teléfono y correo no aparecen en el aviso. Se abren solo
              para el flete adjudicado.
            </li>
            <li>
              <strong>Lo que significa «verificado».</strong> Que la cuenta pasó la revisión de Carga360go. No es un
              sello de solvencia ni reemplaza la revisión que hace cada parte.
            </li>
          </ul>
          <p>
            <Link className="btn sm" href="/como-verificamos">
              Cómo verificamos
            </Link>
          </p>
        </div>
      </section>

      <section className="block" aria-labelledby="agente-titulo">
        <div className="wrap">
          <h2 id="agente-titulo">¿Dudas? Escríbele a AI.CARGA360</h2>
          <p>
            Te ayuda por chat a cotizar, publicar y encontrar el calce entre cargas y camiones. Si tu caso necesita a
            una persona, te deriva al equipo de Carga360go.
          </p>
          <p>
            <Link className="btn sm" href="/agente-360go">
              Escribirle a AI.CARGA360
            </Link>
          </p>
        </div>
      </section>

      <section className="block alt" id="faq" aria-labelledby="faq-titulo">
        <div className="wrap">
          <h2 id="faq-titulo">Preguntas frecuentes</h2>
          <div className="faq">
            {FAQ.map((item) => (
              <details key={item.q} className="card">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="cta-band">
            <h2>¿Tienes carga o tienes camión? Empieza hoy.</h2>
            <div className="cta">
              <Link className="btn" href="/cargas/nueva">
                Tengo carga
              </Link>
              <Link className="btn sec" href="/camiones/nuevo">
                Tengo camión o retorno
              </Link>
            </div>
          </div>
          <WhatsAppChannel />
        </div>
      </section>
    </>
  );
}
