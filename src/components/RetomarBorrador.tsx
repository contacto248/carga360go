"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  LLAVE_BORRADOR,
  inicioDePerfil,
  olvidarBorrador,
  parsearBorrador,
  rutaConBorrador,
  type RolPortada,
} from "@/lib/portada-intencion";

/** Si el ingreso volvió sin la consulta, repone el borrador guardado en este navegador. No publica. */
export function RetomarBorrador({ rol }: { rol: RolPortada }) {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    let raw = "";
    try {
      raw = window.sessionStorage.getItem(LLAVE_BORRADOR) || "";
    } catch {
      return;
    }
    const borrador = raw ? parsearBorrador(raw) : null;
    if (!borrador || borrador.rol !== rol) return;
    const yaEnLaUrl = Boolean(params.get("origen") || params.get("destino") || params.get("equipo"));
    if (yaEnLaUrl) {
      olvidarBorrador();
      return;
    }
    const next = rutaConBorrador(borrador);
    if (!next.startsWith(inicioDePerfil(rol))) return;
    olvidarBorrador();
    router.replace(next);
  }, [params, rol, router]);
  return null;
}
