"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { paginasPublicasNuevasEnabled } from "@/lib/paginas-publicas/flag";
import type { PublicUser } from "@/lib/types";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/cargas", label: "Cargas" },
  { href: "/camiones", label: "Camiones" },
  { href: "/mi-cuenta?rol=mandante", label: "Publicar carga" },
  { href: "/mi-cuenta", label: "Mi cuenta" },
  { href: "/tecnologia", label: "Tecnología" },
];

/** Páginas de #63. Solo salen en el menú con UI_PAGINAS_PUBLICAS_NUEVAS_ENABLED="true". */
const LINKS_PUBLICOS_NUEVOS = [
  { href: "/clientes", label: "Clientes" },
  { href: "/documentos", label: "Documentos" },
  { href: "/finanzas", label: "Finanzas" },
];

export function enlacesMenu(enabled: boolean = paginasPublicasNuevasEnabled()) {
  return enabled ? [...LINKS, ...LINKS_PUBLICOS_NUEVOS] : LINKS;
}

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
    <Link href="/" className="logo" aria-label="Carga360go">
      <img
        className="logo-img"
        src="/brand/logo-wordmark.png"
        srcSet="/brand/logo-wordmark.png 1x, /brand/logo-wordmark@2x.png 2x"
        alt="Carga360go"
        width={159}
        height={36}
      />
    </Link>
  );
}

export function Header({ user }: { user: PublicUser | null }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  // Decisión Gerencia 16-11: el Agente BASSAM 360 solo se abre desde /admin/* y /mi-cuenta.
  const agenteBassam = Boolean(pathname && (pathname.startsWith("/admin") || pathname.startsWith("/mi-cuenta")));

  async function salir() {
    await fetch("/api/auth/salir", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  function enlaces(compacto: boolean) {
    return (
      <>
        {enlacesMenu().map((link) => {
          const on = activo(pathname, link.href);
          return (
            <Link key={`${compacto ? "m" : "d"}-${link.href}`} href={link.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
              {link.label}
            </Link>
          );
        })}
        {agenteBassam ? (
          <a href="#agente-bassam" onClick={abrirAgente}>
            Agente BASSAM 360
          </a>
        ) : null}
        {user?.role === "admin" ? (
          <>
            <Link href="/admin/bassam" className={activo(pathname, "/admin/bassam") ? "on" : undefined} aria-current={activo(pathname, "/admin/bassam") ? "page" : undefined}>
              Panel BASSAM
            </Link>
            <Link href="/admin/bassam360" className={activo(pathname, "/admin/bassam360") ? "on" : undefined} aria-current={activo(pathname, "/admin/bassam360") ? "page" : undefined}>
              BASSAM 360
            </Link>
            <Link href="/admin" className={activo(pathname, "/admin") ? "on" : undefined} aria-current={activo(pathname, "/admin") ? "page" : undefined}>
              Administración
            </Link>
          </>
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
