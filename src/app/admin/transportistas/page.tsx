import { AdminNav } from "@/components/AdminNav";
import type { Metadata } from "next";
import Link from "next/link";
import { CarrierReview, type CarrierItem } from "@/components/CarrierReview";
import { listUsers } from "@/lib/auth";
import { accreditationOf } from "@/lib/accreditation";
import { carrierChecklist } from "@/lib/carrier";
import { getCurrentUser } from "@/lib/current-user";
import { listDocuments } from "@/lib/documents";
import { firstParam, formatWhatsappDisplay, todayChile } from "@/lib/format";
import { channelStatus } from "@/lib/notify";
import { lastCodeInfo } from "@/lib/verification";
import { backupContactOf, verificationPending } from "@/lib/backup-contact";
import { manualReadonlyOf } from "@/lib/manual-readonly";
import { deliveryLabel, listManualReadonlyNotifications } from "@/lib/manual-readonly-notify";

export const metadata: Metadata = { title: "Acreditación de cuentas", robots: { index: false, follow: false } };

const ROLES = [
  { id: "transportista", label: "Transportistas" },
  { id: "mandante", label: "Mandantes" },
];

const FILTERS = [
  { id: "pendiente", label: "Pendientes" },
  { id: "solo_lectura", label: "Solo lectura (verificación manual)" },
  { id: "rechazado", label: "Rechazados" },
  { id: "verificado", label: "Aprobados" },
  { id: "todos", label: "Todos" },
];

const DELIVERY_LABELS: Record<string, string> = {
  smtp: "enviado por correo",
  whatsapp: "enviado por WhatsApp",
  sms: "enviado por SMS",
  no_configurado: "no enviado (canal sin configurar)",
  error: "falló el envío",
};

function deliveryText(delivery: string, createdAt: string): string {
  const when = new Date(createdAt).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${DELIVERY_LABELS[delivery] ?? delivery.replace(/_/g, " ")} · ${when} (hora de Chile)`;
}


function lastManualNotice(userId: string) {
  const row = listManualReadonlyNotifications(userId).at(-1);
  if (!row) return null;
  return {
    kind: row.kind,
    email: { label: deliveryLabel(row.emailStatus), to: row.emailTo },
    whatsapp: { label: deliveryLabel(row.whatsappStatus), to: row.whatsappTo },
  };
}

export default async function AdminTransportistasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Sin acceso</h1>
          <p>Esta sección es solo para administradores de Carga360go.</p>
          <Link className="btn" href="/ingreso?next=/admin/transportistas">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const estado = FILTERS.some((item) => item.id === firstParam(sp.estado)) ? firstParam(sp.estado) : "pendiente";
  const rol = firstParam(sp.rol) === "mandante" ? "mandante" : "transportista";
  const carriers = listUsers().filter((item) => item.role === rol);
  const matches = (item: (typeof carriers)[number], id: string) =>
    id === "todos" || (id === "solo_lectura" ? Boolean(item.manualReadonlyUntil) : item.verificationStatus === id);
  const visible = carriers.filter((item) => matches(item, estado));
  const items: CarrierItem[] = visible.map((item) => {
    const email = lastCodeInfo(item.id, "email");
    const phone = lastCodeInfo(item.id, "phone");
    return {
      user: item,
      phoneDisplay: formatWhatsappDisplay(item.whatsapp),
      check: carrierChecklist(item.id),
      acc: accreditationOf(item.id),
      docs: listDocuments(item.id),
      lastEmailDelivery: email ? deliveryText(email.delivery, email.createdAt) : null,
      lastPhoneDelivery: phone ? deliveryText(phone.delivery, phone.createdAt) : null,
      backup: backupContactOf(item.id),
      backupPending: verificationPending(item.id),
      readonly: manualReadonlyOf(item.id),
      lastNotice: lastManualNotice(item.id),
    };

  });
  const channels = channelStatus();
  const count = (id: string) => carriers.filter((item) => matches(item, id)).length;
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Acreditación de cuentas</h1>
        <p>
          Solo las cuentas 100% acreditadas publican, ofertan y reciben contactos. Transportistas: correo y teléfono confirmados, documentos
          obligatorios aprobados y vigentes. Todas: Política de Privacidad aceptada y requisitos de calidad, seguridad y medio ambiente
          revisados. Luego apruebas la cuenta.{" "}
          <Link href="/admin">← Volver a administración</Link>
        </p>
      </div>
      <AdminNav current="/admin/transportistas" />
      <div className="notice" style={{ marginBottom: 12 }}>
        Canales de verificación: correo {channels.email ? "✓ activo (SMTP)" : "✗ sin configurar"} · WhatsApp{" "}
        {channels.whatsapp ? "✓ activo" : "✗ sin configurar"} · SMS {channels.sms ? "✓ activo" : "✗ sin configurar"}. Si un canal no está
        activo, confirma por teléfono o correo y márcalo a mano aquí.
      </div>
      <div className="row" style={{ margin: "8px 0 4px" }}>
        {ROLES.map((item) => (
          <Link key={item.id} className={rol === item.id ? "btn sm" : "btn sec sm"} href={`/admin/transportistas?rol=${item.id}&estado=${estado}`}>
            {item.label}
          </Link>
        ))}
      </div>
      <div className="row" style={{ margin: "8px 0 12px" }}>
        {FILTERS.map((item) => (
          <Link key={item.id} className={estado === item.id ? "btn sm" : "btn sec sm"} href={`/admin/transportistas?rol=${rol}&estado=${item.id}`}>
            {item.label} ({count(item.id)})
          </Link>
        ))}
      </div>
      <CarrierReview items={items} today={todayChile()} />
    </div>
  );
}
