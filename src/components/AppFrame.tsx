"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import type { PublicUser } from "@/lib/types";

/**
 * El layout raíz no se vuelve a renderizar en una navegación del cliente.
 * El cascarón y la clase del body siguen la ruta actual, no la del primer cargado.
 */
export function AppFrame({ user, children }: { user: PublicUser | null; children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const portada = pathname === "/";

  useEffect(() => {
    document.body.classList.toggle("portada-body", portada);
  }, [portada]);

  return (
    <div className={portada ? "app-shell portada-shell" : "app-shell"}>
      <Header user={user} />
      <div className="shell-content">{children}</div>
    </div>
  );
}
