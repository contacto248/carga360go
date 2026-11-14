import { AdminNav } from "@/components/AdminNav";
import type { Metadata } from "next";
import Link from "next/link";
import { WhatsappAdmin } from "@/components/WhatsappAdmin";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam } from "@/lib/format";
import { aiReady, canSend, waConfig } from "@/lib/whatsapp/config";
import { botGloballyEnabled, getConversation, listConversations, listMessages } from "@/lib/whatsapp/store";

export const metadata: Metadata = { title: "WhatsApp", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminWhatsappPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Sin acceso</h1>
          <p>Esta sección es solo para administradores de Carga360go.</p>
          <Link className="btn" href="/ingreso?next=/admin/whatsapp">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const conversations = listConversations();
  const selectedId = firstParam(sp.c) || conversations[0]?.id || "";
  const selected = selectedId ? getConversation(selectedId) : null;
  const cfg = waConfig();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>WhatsApp</h1>
        <p>
          Bot de +56 9 5842 8693. Cuando usted responde desde la app de WhatsApp Business, el bot se calla {cfg.pauseHours} h en ese chat.{" "}
          <Link href="/admin">← Administración</Link>
        </p>
      </div>
      <AdminNav current="/admin/whatsapp" />
      <WhatsappAdmin
        status={{
          globalEnabled: botGloballyEnabled(),
          canSend: canSend(),
          ai: aiReady(),
          aiModel: aiReady() ? cfg.aiModel : null,
          secret: Boolean(cfg.appSecret),
          verifyToken: Boolean(cfg.verifyToken),
          pauseHours: cfg.pauseHours,
        }}
        conversations={conversations}
        selected={selected}
        messages={selected ? listMessages(selected.id) : []}
        now={new Date().toISOString()}
      />
    </div>
  );
}
