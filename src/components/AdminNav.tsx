import Link from "next/link";
import { paymentsEnabled } from "@/lib/pagos/config";
import { kycEnabled } from "@/lib/kyc/config";

const ITEMS = [
  { href: "/admin", label: "Usuarios y documentos" },
  { href: "/admin/transportistas", label: "Acreditación" },
  { href: "/admin/ofertas", label: "Ofertas y ajustes" },
  { href: "/admin/auditoria", label: "Auditoría" },
  { href: "/admin/whatsapp", label: "WhatsApp" },
  { href: "/admin/chat", label: "Chat web" },
  { href: "/admin/agente", label: "Agente comercial" },
  { href: "/admin/costos", label: "Costos" },
];

/** Pagos solo aparece con PAYMENTS_FEATURE_ENABLED=true. */
const PAYMENTS_ITEM = { href: "/admin/pagos", label: "Pagos" };
/** Identidad solo aparece con KYC_FEATURE_ENABLED=true. */
const KYC_ITEM = { href: "/admin/identidad", label: "Identidad" };

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="admin-nav" aria-label="Administración">
      {[...ITEMS, ...(paymentsEnabled() ? [PAYMENTS_ITEM] : []), ...(kycEnabled() ? [KYC_ITEM] : [])].map((item) => (
        <Link key={item.href} href={item.href} className={item.href === current ? "on" : ""}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
