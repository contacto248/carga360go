import Link from "next/link";

const MODULES = [
  {
    number: "01",
    title: "Vista pública",
    description: "Consultar cargas vigentes y acceder a las publicaciones de la bolsa.",
    href: "/cargas",
    action: "Ver cargas",
  },
  {
    number: "02",
    title: "Clientes",
    description: "Ingresar a los servicios disponibles para empresas que publican cargas.",
    href: "/mi-cuenta?rol=mandante",
    action: "Ingresar como cliente",
  },
  {
    number: "03",
    title: "Control de operaciones",
    description: "Revisar las publicaciones, ofertas y documentos de tu cuenta.",
    href: "/panel",
    action: "Abrir mi panel",
  },
  {
    number: "04",
    title: "Administración",
    description: "Acceso exclusivo para usuarios con permisos de administración.",
    href: "/admin",
    action: "Acceso autorizado",
  },
] as const;

/** Accesos de interfaz a rutas existentes. No crea estados ni datos simulados. */
export function ExistingModules() {
  return (
    <section className="c360-existing-modules" aria-labelledby="c360-modules-title">
      <div className="wrap">
        <p className="c360-module-eyebrow">CARGA360GO / PANELES CONECTADOS</p>
        <div className="c360-module-heading">
          <div>
            <h2 id="c360-modules-title">Una plataforma. Cuatro accesos.</h2>
            <p>Usa los módulos que ya existen en Carga360go, desde una interfaz más clara.</p>
          </div>
          <span className="c360-module-mark">SISTEMA WEB</span>
        </div>
        <div className="c360-modules-grid">
          {MODULES.map((module) => (
            <Link key={module.number} className="c360-module-card" href={module.href}>
              <span className="c360-module-top">
                <span className="c360-module-number">{module.number}</span>
                <span className="c360-module-arrow" aria-hidden="true">↗</span>
              </span>
              <strong>{module.title}</strong>
              <span className="c360-module-description">{module.description}</span>
              <span className="c360-module-action">{module.action} <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
