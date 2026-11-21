"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/types";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/cargas", label: "Cargas" },
  { href: "/camiones", label: "Camiones" },
  { href: "/cargas/nueva", label: "Publicar carga" },
  { href: "/mi-cuenta", label: "Mi cuenta" },
  { href: "/tecnologia", label: "Tecnología" },
];

function activo(pathname: string, href: string) {
  if (href.includes("?")) return false;
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function abrirAgente(event: { preventDefault(): void }) {
  event.preventDefault();
  window.dispatchEvent(new Event("c360-abrir-agente"));
}

function Marca() {
  return (
    <Link href="/" className="orbita-wordmark" aria-label="ÓRBITA · Sistema Carga360go">
      <img
        className="logo-img"
        src="/brand/logo-wordmark.png"
        srcSet="/brand/logo-wordmark.png 1x, /brand/logo-wordmark@2x.png 2x"
        alt="Carga360go"
        width={159}
        height={36}
      />
      <span>ÓRBITA · Sistema Carga360go</span>
    </Link>
  );
}

export function Header({ user }: { user: PublicUser | null }) {
  const pathname = usePathname() || "/";
  const portada = pathname === "/";
  const router = useRouter();
  // El asistente público es uno solo. El enlace de acreditación queda en /admin.
  const agenteBassam = pathname.startsWith("/admin");

  async function salir() {
    await fetch("/api/auth/salir", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  if (portada) {
    return (
      <>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <header className="portada-top">
          <div className="wrap">
            <Link href="/" className="orbita-wordmark" aria-label="ÓRBITA · Sistema Carga360go">
              <span>ÓRBITA · Sistema Carga360go</span>
            </Link>
            <nav className="portada-nav" aria-label="Portada">
              <a href="#soluciones">Soluciones</a>
              <Link href="/tecnologia">Tecnología</Link>
              <Link href="/cargas" className="bolsa">
                Bolsa
              </Link>
              {user ? (
                <Link href="/panel" className="sesion">
                  Mi panel
                </Link>
              ) : (
                <Link href="/ingreso" className="sesion">
                  Ingresar
                </Link>
              )}
              {user?.role === "admin" ? <Link href="/admin">Administración</Link> : null}
              {user ? (
                <button type="button" onClick={salir}>
                  Salir
                </button>
              ) : null}
            </nav>
          </div>
        </header>
      </>
    );
  }

  function enlaces(compacto: boolean) {
    return (
      <>
        {LINKS.map((link) => {
          const on = activo(pathname, link.href);
          return (
            <Link key={`${compacto ? "m" : "d"}-${link.href}`} href={link.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
              {link.label}
            </Link>
          );
        })}
        {agenteBassam ? (
          <a href="#agente-bassam" onClick={abrirAgente}>
            Agente de acreditación
          </a>
        ) : null}
        {user?.role === "admin" ? (
          <Link href="/admin" className={activo(pathname, "/admin") ? "on" : undefined} aria-current={activo(pathname, "/admin") ? "page" : undefined}>
            Administración
          </Link>
        ) : null}
      </>
    );
  }

  const sesion = user ? (
    <button className="btn sm" type="button" onClick={salir}>
      Salir
    </button>
  ) : (
    <Link href="/ingreso" className="btn sec sm">
      Ingresar
    </Link>
  );

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="demo-banner">
        <strong>Costo de referencia desglosado del flete</strong>
        <span className="hide-sm"> · ruta, peajes por ejes, diésel y costos de operación · trazabilidad en una sola web</span>
      </div>
      <aside className="side-nav">
        <Marca />
        <nav className="side-links" aria-label="Principal">
          {enlaces(false)}
        </nav>
        <div className="side-session">{sesion}</div>
      </aside>
      <header className="top">
        <div className="wrap">
          <Marca />
          {user ? (
            <button className="btn sm mobile-cta" type="button" onClick={salir}>
              Salir
            </button>
          ) : (
            <Link href="/ingreso" className="btn sec sm mobile-cta">
              Ingresar
            </Link>
          )}
          <nav className="links" aria-label="Principal escritorio">
            {enlaces(false)}
            {sesion}
          </nav>
        </div>
      </header>
      <nav className="tabbar" aria-label="Accesos rápidos">
        {enlaces(true)}
      </nav>
    </>
  );
}
