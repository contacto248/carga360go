"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WebChatConversation, WebChatMessage } from "@/lib/chat/store";

type Status = {
  globalEnabled: boolean;
  ai: boolean;
  aiModel: string | null;
};

type Conv = WebChatConversation & { lastBody: string | null; count: number };

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`pill ${ok ? "ok" : "warn"}`}>{ok ? `✓ ${label}` : `✗ ${label}`}</span>;
}

const SOURCE: Record<string, string> = { cliente: "Visitante", bot: "Bot", sistema: "Sistema" };

export function WebChatAdmin({
  status,
  conversations,
  selected,
  messages,
}: {
  status: Status;
  conversations: Conv[];
  selected: WebChatConversation | null;
  messages: WebChatMessage[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function patch(body: unknown) {
    setError("");
    setBusy(true);
    const response = await fetch("/api/admin/chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "No se pudo guardar.");
      return;
    }
    router.refresh();
  }

  const aiLabel = status.ai ? `IA (Gemini: ${status.aiModel})` : "IA sin clave: respuestas por reglas";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <Flag ok={status.globalEnabled} label={status.globalEnabled ? "Chat encendido" : "Chat apagado"} />
          <Flag ok={status.ai} label={aiLabel} />
        </div>
        <div>
          <button className="btn" disabled={busy} onClick={() => patch({ globalEnabled: !status.globalEnabled })}>
            {status.globalEnabled ? "Apagar el chat en el sitio" : "Encender el chat en el sitio"}
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Apagado, el sitio solo muestra el botón de WhatsApp. Encendido, aparece el asistente junto a WhatsApp. Hace falta una clave de Gemini
          (plan gratuito) para respuestas con IA; si no hay clave, responde el motor de reglas.
        </p>
        {error && <div className="notice">{error}</div>}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 2fr)" }} className="wa-grid">
        <div className="card" style={{ padding: 0, maxHeight: 640, overflow: "auto" }}>
          {conversations.length === 0 && <p style={{ padding: 12 }}>Todavía no hay conversaciones del chat web.</p>}
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/admin/chat?c=${c.id}`}
              style={{ display: "block", padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: selected?.id === c.id ? "#f1f5f9" : undefined, textDecoration: "none", color: "inherit" }}
            >
              <strong>Chat {c.id.slice(0, 8)}</strong>{" "}
              {c.botDisabled ? <span className="pill bad">bot off</span> : null}
              {c.handoffAt && <span className="pill warn">derivado</span>}
              <div style={{ fontSize: 13, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastBody}</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                {fmt(c.lastMessageAt)} · {c.count} msj
              </div>
            </Link>
          ))}
        </div>

        <div className="card" style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {!selected ? (
            <p>Elija una conversación.</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <h2 style={{ margin: 0 }}>Chat {selected.id.slice(0, 8)}</h2>
              </div>
              <div style={{ fontSize: 14 }}>{selected.botDisabled ? "El bot está apagado en este chat." : selected.handoffAt ? `Derivado a una persona el ${fmt(selected.handoffAt)}.` : "El bot responde en este chat."}</div>
              <div>
                <button className="btn" disabled={busy} onClick={() => patch({ conversationId: selected.id, botDisabled: !selected.botDisabled })}>
                  {selected.botDisabled ? "Encender bot en este chat" : "Apagar bot en este chat"}
                </button>
              </div>
              <div style={{ display: "grid", gap: 6, maxHeight: 520, overflow: "auto" }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      justifySelf: m.direction === "in" ? "start" : "end",
                      maxWidth: "85%",
                      background: m.direction === "in" ? "#f1f5f9" : "#dcfce7",
                      borderRadius: 10,
                      padding: "6px 10px",
                      whiteSpace: "pre-wrap",
                      fontSize: 14,
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.65 }}>
                      {SOURCE[m.source] ?? m.source} · {fmt(m.createdAt)}
                      {m.engine ? ` · ${m.engine}` : ""}
                    </div>
                    {m.body}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 760px){.wa-grid{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}
