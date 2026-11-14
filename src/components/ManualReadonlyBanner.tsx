import Link from "next/link";
import { formatDateCL, todayChile } from "@/lib/format";
import { manualReadonlyOf } from "@/lib/manual-readonly";
import type { PublicUser } from "@/lib/types";

/**
 * Aviso de verificación manual (solo lectura por 30 días). Componente de servidor: lee el estado vigente en la base.
 * El bloqueo real está en el servidor (assertNotManualReadonly); esto solo informa.
 */
export function ManualReadonlyBanner({ user }: { user: PublicUser | null }) {
  if (!user || user.role === "admin") return null;
  const ro = manualReadonlyOf(user.id);
  if (!ro.active || !ro.until) return null;
  const until = formatDateCL(todayChile(new Date(ro.until)));
  return (
    <div className="notice" style={{ marginBottom: 12, background: "#fff7ed", borderColor: "#fed7aa", color: "#7c2d12" }} role="status">
      <strong>
        Acceso de solo lectura hasta el {until} ({ro.daysLeft} {ro.daysLeft === 1 ? "día" : "días"}).
      </strong>{" "}
      Un administrador habilitó tu cuenta de forma manual para que puedas ver cargas y camiones mientras terminas tu verificación.
      Mientras tanto <strong>no puedes publicar, ofertar ni tomar cargas</strong>. Si no completas la acreditación antes de esa fecha,
      tu cuenta vuelve a revisión. <Link href="/cuenta-en-revision">Completar mi verificación</Link>
    </div>
  );
}
