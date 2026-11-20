import React from "react";
import Link from "next/link";

/** Línea de transparencia y enlaces legales que ya existen. No reescribe esos textos. */
export function Transparencia({ pagosLegales }: { pagosLegales: boolean }) {
  return (
    <p className="page-legal">
      Carga360go conecta a mandantes y transportistas. No es transportista ni asegura que el viaje se concrete. El acuerdo y el valor final los definen las partes. Solo mostramos avisos reales y vigentes.{" "}
      <Link href="/terminos">Términos</Link>
      {" · "}
      <Link href="/privacidad">Privacidad</Link>
      {pagosLegales ? (
        <>
          {" · "}
          <Link href="/politica-de-pagos">Política de pagos</Link>
        </>
      ) : null}
      {" · "}
      <Link href="/como-verificamos">Cómo verificamos</Link>
    </p>
  );
}
