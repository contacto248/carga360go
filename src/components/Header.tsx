"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { freePeriodOf } from "@/lib/campaign";
import type { PublicUser } from "@/lib/types";

const LINKS = [
  { href: "/cargas", label: "Cargas" },
  { href: "/camiones", label: "Camiones" },
  { href: "/regiones", label: "Regiones" },
  { href: "/cargas/nueva", label: "Publicar carga" },
  { href: "/camiones/nuevo", label: "Publicar camión" },
  { href: "/herramientas/calculadora", label: "Calculadora" },
  { href: "/panel", label: "Panel" },
];

const TABS = [
  { href: "/cargas", label: "Cargas", icon: "📦" },
  { href: "/camiones", label: "Camiones", icon: "🚛" },
  { href: "/cargas/nueva", label: "Publicar", icon: "➕" },
  { href: "/panel#alertas", label: "Alertas", icon: "🔔" },
  { href: "/panel", label: "Panel", icon: "👤" },
];

export function Header({ user }: { user: PublicUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const locked = user?.role === "transportista" && user.verificationStatus !== "verificado";
  const period = user?.role === "admin" ? null : freePeriodOf(user?.freeUntil);
  const links = locked
    ? [{ href: "/cuenta-en-revision", label: "Mi cuenta (en revisión)" }]
    : user?.role === "admin"
      ? [...LINKS.filter((link) => link.href !== "/herramientas/calculadora"), { href: "/admin", label: "Admin" }]
      : LINKS;

  async function salir() {
    await fetch("/api/auth/salir", { method: "POST" });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div className="demo-banner">
        {period && period.active ? (
          <>
            <strong>Tu periodo gratis termina el {period.label}</strong>
            <span className="hide-sm"> · campaña de inscripción de mandantes y transportistas</span>.
          </>
        ) : period ? (
          <>
            <strong>Tu periodo gratis terminó el {period.label}</strong>: no se cobra nada sin tu aceptación.
          </>
        ) : (
          <>
            <strong>Campaña de inscripción: 30 días gratis</strong> para mandantes, empresas y transportistas
            <span className="hide-sm"> · luego membresía con beneficios y convenios</span>.
          </>
        )}
      </div>
      <header className="top">
        <div className="wrap">
          <Link href="/" className="logo" onClick={() => setOpen(false)} aria-label="Carga360go">
            <img
              className="logo-img"
              src="/brand/logo-wordmark.png"
              srcSet="/brand/logo-wordmark.png 1x, /brand/logo-wordmark@2x.png 2x"
              alt="Carga360go"
              width={159}
              height={36}
            />
          </Link>
          <nav className="links">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={pathname === link.href ? "on" : ""}>
                {link.label}
              </Link>
            ))}
            {user ? (
              <>
                <span className="account" title={user.razonSocial}>
                  {user.razonSocial}
                </span>
                <button className="btn sm" type="button" style={{ marginLeft: 8 }} onClick={salir}>
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link href="/ingreso" className="btn sec sm" style={{ marginLeft: 8 }}>
                  Ingresar
                </Link>
                <Link href="/registro" className="btn sm">
                  Registrarse
                </Link>
              </>
            )}
          </nav>
          <button className="burger" type="button" aria-label="Menú" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? "✕" : "☰"}
          </button>
        </div>
        {open ? (
          <div className="mobile-menu">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
            {user ? (
              <button className="linkish" type="button" onClick={salir} style={{ color: "#fff", textAlign: "left", padding: "12px 4px" }}>
                Salir ({user.razonSocial})
              </button>
            ) : (
              <>
                <Link href="/ingreso" onClick={() => setOpen(false)}>
                  Ingresar
                </Link>
                <Link href="/registro" onClick={() => setOpen(false)}>
                  Registrar empresa / transportista
                </Link>
              </>
            )}
          </div>
        ) : null}
      </header>
      {locked ? null : (
        <nav className="tabbar" aria-label="Accesos rápidos">
          {TABS.map((tab) => (
            <Link key={tab.label} href={tab.href} className={pathname === tab.href.split("#")[0] && tab.label !== "Alertas" ? "on" : ""}>
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
