import Link from "next/link";
import { CAMPAIGN_PROMISE, FREE_DAYS, freePeriodOf } from "@/lib/campaign";
import type { PublicUser } from "@/lib/types";

/**
 * Aviso de la campaña de inscripción. Sin sesión: 30 días gratis desde la inscripción. Con sesión: la fecha de término de su cuenta.
 * No hay sistema de pago: el texto promete aviso previo y que nada se cobra sin aceptación.
 */
export function FreeBanner({ user, compact = false }: { user: PublicUser | null; compact?: boolean }) {
  if (user?.role === "admin") return null;
  const period = freePeriodOf(user?.freeUntil);
  let headline: React.ReactNode;
  if (!period) {
    headline = (
      <>
        <strong>Campaña de inscripción:</strong> cada cuenta tiene <strong>{FREE_DAYS} días gratis</strong> desde su inscripción, para mandantes,
        empresas con carga y transportistas.
      </>
    );
  } else if (period.active) {
    headline = (
      <>
        <strong>Tu periodo gratis termina el {period.label}</strong>
        {period.daysLeft > 0 ? ` (te quedan ${period.daysLeft} ${period.daysLeft === 1 ? "día" : "días"})` : " (hoy es el último día)"}.
      </>
    );
  } else {
    headline = (
      <>
        <strong>Tu periodo gratis terminó el {period.label}.</strong> Aún no se cobra nada: sigues usando Carga360go sin costo hasta que
        publiquemos la membresía y la aceptes.
      </>
    );
  }
  return (
    <aside className={`free-banner${compact ? " compact" : ""}`} aria-label="Campaña de inscripción">
      <span className="free-banner-icon" aria-hidden="true">
        🎉
      </span>
      <div>
        <p>{headline}</p>
        {compact ? null : (
          <p className="meta">
            Después se cobrará una membresía (valores por definir) con beneficios en la plataforma y convenios. {CAMPAIGN_PROMISE}{" "}
            <Link href="/terminos#membresia">Ver condiciones</Link>
          </p>
        )}
      </div>
    </aside>
  );
}
