import { AdminNav } from "@/components/AdminNav";
import { WebChatAdmin } from "@/components/WebChatAdmin";
import type { Metadata } from "next";
import Link from "next/link";
import { webChatEnabled } from "@/lib/chat/config";
import { getWebConversation, listWebConversations, listWebMessages } from "@/lib/chat/store";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam } from "@/lib/format";
import { aiReady, waConfig } from "@/lib/whatsapp/config";

export const metadata: Metadata = { title: "Chat de la web", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminChatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Sin acceso</h1>
          <p>Esta sección es solo para administradores de Carga360go.</p>
          <Link className="btn" href="/ingreso?next=/admin/chat">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const conversations = listWebConversations();
  const selectedId = firstParam(sp.c) || conversations[0]?.id || "";
  const selected = selectedId ? getWebConversation(selectedId) : null;
  const cfg = waConfig();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Chat de la web</h1>
        <p>
          Asistente del sitio carga360go.cl. Las conversaciones se guardan aquí; las derivaciones llegan a {cfg.handoffEmail}.{" "}
          <Link href="/admin">← Administración</Link>
        </p>
      </div>
      <AdminNav current="/admin/chat" />
      <WebChatAdmin
        status={{
          globalEnabled: webChatEnabled(),
          ai: aiReady(),
          aiProvider: aiReady() ? cfg.aiProvider : null,
          aiModel: aiReady() ? cfg.aiModel : null,
        }}
        conversations={conversations}
        selected={selected}
        messages={selected ? listWebMessages(selected.id) : []}
      />
    </div>
  );
}
