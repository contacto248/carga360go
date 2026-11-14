import Link from "next/link";
import type { KycGrace } from "@/lib/kyc/grace";
import { formatDateCL, todayChile } from "@/lib/format";

/** Aviso a cuentas que ya estaban acreditadas: 15 días para verificar teléfono e identidad. */
export function KycGraceBanner({ grace }: { grace: KycGrace | null }) {
  if (!grace?.active) return null;
  const until = formatDateCL(todayChile(new Date(grace.endsAt)));
  const days = grace.daysLeft;
  return (
    <div className="notice" style={{ marginBottom: 12 }} role="status">
      <strong>Tienes {days} {days === 1 ? "día" : "días"} (hasta el {until})</strong> para verificar tu teléfono y tu
      identidad con tu cédula y una selfie. Mientras tanto tu cuenta sigue activa. Si no lo completas a tiempo, pasará a
      revisión y no podrás publicar ni ofertar.{" "}
      <Link href="/verificar-identidad">Verificar mi cuenta</Link>
    </div>
  );
}
