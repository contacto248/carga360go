"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WaConversation, WaMessage } from "@/lib/whatsapp/store";

type Status = {
  globalEnabled: boolean;
  canSend: boolean;
  ai: boolean;
  aiModel: string | null;
  secret: boolean;
  verifyToken: boolean;
  pauseHours: number;
};

type Conv = WaConversation & { lastBody: string | null; count: number };

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
}

function who(c: WaConversation): string {
  return c.name || (c.waId ? `+${c.waId}` : c.userId || "Sin número");
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`pill ${ok ? "ok" : "warn"}`}>{ok ? `✓ ${label}` : `✗ ${label}`}</span>;
}

const SOURCE: Record<string, string> = { cliente: "Cliente", bot: "Bot", humano: "Usted (app)", sistema: "Sistema" };

export function WhatsappAdmin({ status, conversations, selected, messages, now }: { status: Status; conversations: Conv[]; selected: WaConversation | null; messages: WaMessage[]; now: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function patch(body: unknown) {
    setError("");
    setBusy(true);
    const response = await fetch("/api/admin/whatsapp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "No se pudo guardar.");
      return;
    }
    router.refresh();
  }

  const paused = (c: WaConversation) => Boolean(c.pausedUntil && c.pausedUntil > now);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <Flag ok={status.globalEnabled} label={status.globalEnabled ? "Bot encendido" : "Bot apagado"} />
          <Flag ok={status.canSend} label="Conectado a Meta" />
          <Flag ok={status.secret} label="Firma de Meta" />
          <Flag ok={status.ai} label={status.ai ? `IA (${status.aiModel})` : "IA sin clave: respuestas por reglas"} />
        </div>
        <div>
          <button className="btn" disabled={busy} onClick={() => patch({ globalEnabled: !status.globalEnabled })}>
            {status.globalEnabled ? "Apagar el bot en todos los chats" : "Encender el bot"}
          </button>
        </div>
        {!status.canSend && <p className="muted" style={{ margin: 0 }}>Mientras falten los datos de Meta, los mensajes se guardan pero el bot no responde.</p>}
        {error && <div className="notice">{error}</div>}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 2fr)" }} className="wa-grid">
        <div className="card" style={{ padding: 0, maxHeight: 640, overflow: "auto" }}>
          {conversations.length === 0 && <p style={{ padding: 12 }}>Todavía no hay conversaciones.</p>}
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/admin/whatsapp?c=${c.id}`}
              style={{ display: "block", padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: selected?.id === c.id ? "#f1f5f9" : undefined, textDecoration: "none", color: "inherit" }}
            >
              <strong>{who(c)}</strong>{" "}
              {c.botDisabled ? <span className="pill bad">bot off</span> : paused(c) ? <span className="pill warn">pausa</span> : null}
              {c.handoffAt && <span className="pill warn">derivado</span>}
              <div style={{ fontSize: 13, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastBody}</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{fmt(c.lastMessageAt)} · {c.count} msj</div>
            </Link>
          ))}
        </div>

        <div className="card" style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {!selected ? (
            <p>Elija una conversación.</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <h2 style={{ margin: 0 }}>{who(selected)}</h2>
                {selected.waId && <span className="muted">+{selected.waId}</span>}
              </div>
              <div style={{ fontSize: 14 }}>
                {selected.botDisabled
                  ? "El bot está apagado en este chat."
                  : paused(selected)
                    ? `Bot en pausa hasta ${fmt(selected.pausedUntil)} (${selected.pauseReason}).`
                    : "El bot responde en este chat."}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button className="btn" disabled={busy} onClick={() => patch({ conversationId: selected.id, botDisabled: !selected.botDisabled })}>
                  {selected.botDisabled ? "Encender bot en este chat" : "Apagar bot en este chat"}
                </button>
                {paused(selected) ? (
                  <button className="btn" disabled={busy} onClick={() => patch({ conversationId: selected.id, action: "resume" })}>
                    Quitar pausa
                  </button>
                ) : (
                  <button className="btn" disabled={busy} onClick={() => patch({ conversationId: selected.id, action: "pause" })}>
                    Pausar {status.pauseHours} h
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gap: 6, maxHeight: 520, overflow: "auto" }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      justifySelf: m.direction === "in" ? "start" : "end",
                      maxWidth: "85%",
                      background: m.direction === "in" ? "#f1f5f9" : m.source === "humano" ? "#fef3c7" : "#dcfce7",
                      borderRadius: 10,
                      padding: "6px 10px",
                      whiteSpace: "pre-wrap",
                      fontSize: 14,
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.65 }}>
                      {SOURCE[m.source] ?? m.source} · {fmt(m.createdAt)}
                      {m.engine ? ` · ${m.engine}` : ""}
                      {m.status && m.direction === "out" ? ` · ${m.status}` : ""}
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
