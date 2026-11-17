import type { PublicUser } from "@/lib/types";

/**
 * Aviso principal del sitio: costo de referencia desglosado, trazabilidad y seguridad.
 * Reemplaza el antiguo aviso de campaña de inscripción (30 días gratis / membresía) por directriz de Gerencia
 * (14-11-2026): la interfaz pública no habla de modelos de cobro ni comisiones. Copy T-065: no «costo real».
 * Sin cifras: los montos los entrega el cotizador con su fuente.
 */
export function FreeBanner({ user, compact = false }: { user: PublicUser | null; compact?: boolean }) {
  if (user?.role === "admin") return null;
  return (
    <aside className={`cost-banner${compact ? " compact" : ""}`} aria-label="Costo de referencia desglosado del flete">
      <span className="cost-banner-icon" aria-hidden="true">
        ⛽
      </span>
      <div>
        <p>
          <strong>Costo de referencia desglosado del flete.</strong> Como cliente ves el desglose de tu envío; como
          transportista, el costo aproximado de tu viaje.
        </p>
        {compact ? null : (
          <>
            <p className="meta">
              Se calcula con la ruta, los peajes según los ejes del camión, el diésel y los costos de operación, cada uno
              con su fuente. No es una cotización cerrada: el valor final lo acuerdan las partes.
            </p>
            <p className="cost-tags" aria-hidden="true">
              <span>Ruta</span>
              <span>Peajes por ejes</span>
              <span>Diésel</span>
              <span>Costos de operación</span>
              <span>Trazabilidad</span>
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
