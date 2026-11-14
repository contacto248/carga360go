import type { PublicUser } from "@/lib/types";

/**
 * Aviso principal del sitio: costo real y automático del flete, trazabilidad y seguridad.
 * Reemplaza el antiguo aviso de campaña de inscripción (30 días gratis / membresía) por directriz de Gerencia
 * (14-11-2026): la interfaz pública no habla de modelos de cobro ni comisiones. Mantiene el nombre y las props
 * para no tocar las páginas que lo usan. Sin cifras: los montos los entrega el cotizador con su fuente.
 */
export function FreeBanner({ user, compact = false }: { user: PublicUser | null; compact?: boolean }) {
  if (user?.role === "admin") return null;
  return (
    <aside className={`cost-banner${compact ? " compact" : ""}`} aria-label="Costo real del flete">
      <span className="cost-banner-icon" aria-hidden="true">
        ⛽
      </span>
      <div>
        <p>
          <strong>Costo real y automático del flete.</strong> Como cliente ves el costo real de tu envío; como transportista, el costo
          aproximado de tu viaje.
        </p>
        {compact ? null : (
          <>
            <p className="meta">
              Se calcula con la ruta, los peajes según los ejes del camión, el precio del diésel y los costos operacionales, con
              trazabilidad de cada operación y seguridad en una sola web automatizada.
            </p>
            <p className="cost-tags" aria-hidden="true">
              <span>Ruta</span>
              <span>Peajes por ejes</span>
              <span>Diésel</span>
              <span>Costos operacionales</span>
              <span>Trazabilidad</span>
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
