"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/types";

const LINKS = [
  { href: "/mi-cuenta?rol=mandante", label: "Publicar carga" },
  { href: "/camiones", label: "Camiones" },
  { href: "/mi-cuenta", label: "Mi cuenta" },
];

function abrirAgente(event: { preventDefault(): void }) {
  event.preventDefault();
  window.dispatchEvent(new Event("c360-abrir-agente"));
}

export function Header({ user }: { user: PublicUser | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function salir() {
    await fetch("/api/auth/salir", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <header className="top">
        <div className="wrap">
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
          <nav className="links" aria-label="Principal">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={pathname === link.href ? "on" : ""}>
                {link.label}
              </Link>
            ))}
            <a href="#agente-bassam" onClick={abrirAgente}>
              Agente BASSAM 360
            </a>
            {user?.role === "admin" ? (
              <>
                <Link href="/admin/bassam" className={pathname === "/admin/bassam" ? "on" : ""}>
                  Panel BASSAM
                </Link>
                <Link href="/admin/bassam360" className={pathname === "/admin/bassam360" ? "on" : ""}>
                  BASSAM 360
                </Link>
              </>
            ) : null}
            {user ? (
              <button className="btn sm" type="button" onClick={salir}>
                Salir
              </button>
            ) : (
              <Link href="/ingreso" className="btn sec sm">
                Ingresar
              </Link>
            )}
          </nav>
        </div>
      </header>
      <nav className="tabbar" aria-label="Accesos rápidos">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={pathname === link.href ? "on" : ""}>
            {link.label}
          </Link>
        ))}
        <a href="#agente-bassam" onClick={abrirAgente}>
          Agente BASSAM 360
        </a>
      </nav>
    </>
  );
}
