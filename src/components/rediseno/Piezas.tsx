import Link from "next/link";

/** Distintivo visible cuando el copy marca [ESTADO: Próximamente]. */
export function Proximamente() {
  return <strong className="estado-proxima">Próximamente</strong>;
}

/** [DESTINO POR CONFIRMAR]: no enlaza a una URL sin confirmar. */
export function DestinoPendiente({ children }: { children: string }) {
  return (
    <button type="button" className="btn sec" disabled>
      {children}
    </button>
  );
}

/** Línea de transparencia y los enlaces legales que ya existen. */
export function Transparencia() {
  return (
    <p className="rediseno-nota">
      Carga360go conecta a mandantes y transportistas. No es transportista ni asegura que el viaje se concrete. El
      acuerdo y el valor final los definen las partes. Solo mostramos avisos reales y vigentes.{" "}
      <Link href="/terminos">Términos</Link>
      {" · "}
      <Link href="/privacidad">Privacidad</Link>
    </p>
  );
}
