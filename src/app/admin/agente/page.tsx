import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { AgentToggles, LeadStatusSelect } from "@/components/AgentAdmin";
import { agentEnabled, agentWhatsappEnabled } from "@/lib/agent/config";
import { freightCostProvider } from "@/lib/agent/costs";
import { agentIndicators, getAgentConversation, listAgentConversations, listAgentLeads, listAgentMessages } from "@/lib/agent/store";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { voiceProvidersStatus } from "@/lib/agent/voice";
import { aiConfig, aiReady } from "@/lib/assistant/config";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam } from "@/lib/format";

export const metadata: Metadata = { title: "Agente comercial", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { cotizacion: "Cotización", registro: "Pre-registro", derivacion: "Derivación" };
const CHANNEL: Record<string, string> = { web: "Web", whatsapp: "WhatsApp", telefono: "Teléfono" };
const ROLE: Record<string, string> = { cliente: "Cliente", agente: "Agente", sistema: "Sistema" };
const TOOL_STATE: Record<string, string> = { conectada: "ok", no_conectada: "bad", pendiente: "warn" };

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
}

export default async function AdminAgentePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Sin acceso</h1>
          <p>Esta sección es solo para administradores de Carga360go.</p>
          <Link className="btn" href="/ingreso?next=/admin/agente">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const leads = listAgentLeads({ limit: 200 });
  const conversations = listAgentConversations(60);
  const selectedId = firstParam(sp.c) || "";
  const selected = selectedId ? getAgentConversation(selectedId) : null;
  const messages = selected ? listAgentMessages(selected.id) : [];
  const ind = agentIndicators();
  const ai = aiReady() ? aiConfig() : null;
  const costs = freightCostProvider().status();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Agente comercial (voz y texto)</h1>
        <p>
          Solicitudes y conversaciones del asistente CARGA360 en la web, WhatsApp y teléfono. <Link href="/admin">← Administración</Link>
        </p>
      </div>
      <AdminNav current="/admin/agente" />

      <div className="card" style={{ margin: "12px 0" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Estado real de conexión</h2>
        <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
          <li>
            Asistente en la web: <span className={`pill ${agentEnabled() ? "ok" : "warn"}`}>{agentEnabled() ? "ENCENDIDO" : "APAGADO"}</span> · flujo en WhatsApp:{" "}
            <span className={`pill ${agentWhatsappEnabled() ? "ok" : "gray"}`}>{agentWhatsappEnabled() ? "ENCENDIDO" : "APAGADO"}</span>
          </li>
          <li>
            Motor de respuestas libres:{" "}
            <span className={`pill ${ai ? "ok" : "warn"}`}>{ai ? `IA CONECTADA (${ai.provider}: ${ai.model})` : "IA NO CONFIGURADA: respuestas por reglas"}</span>
          </li>
          <li>
            Motor de costos de flete: <span className={`pill ${costs.connected ? "ok" : "bad"}`}>{costs.connected ? "CONECTADO" : "PENDIENTE DE CONECTAR"}</span> <span className="meta">{costs.state}</span>
          </li>
          {voiceProvidersStatus().map((p) => (
            <li key={p.id}>
              {p.label}: <span className={`pill ${p.connected ? "ok" : "bad"}`}>{p.state}</span> <span className="meta">· {p.cost}</span>
            </li>
          ))}
        </ul>
        <AgentToggles enabled={agentEnabled()} whatsappEnabled={agentWhatsappEnabled()} />
      </div>

      <div className="agent-status">
        <div className="card"><b>{ind.conversations7d}</b>conversaciones (7 días)</div>
        <div className="card"><b>{ind.messages7d}</b>mensajes ({ind.voiceMessages7d} por voz)</div>
        <div className="card"><b>{ind.handoffs7d}</b>derivaciones (7 días)</div>
        <div className="card"><b>{ind.leadsByKind.cotizacion}</b>cotizaciones</div>
        <div className="card"><b>{ind.leadsByKind.registro}</b>pre-registros</div>
        <div className="card"><b>{ind.leadsByStatus.nuevo}</b>solicitudes sin atender</div>
      </div>

      <div className="card" style={{ overflowX: "auto", margin: "12px 0" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Solicitudes (leads)</h2>
        {leads.length === 0 ? (
          <p className="empty">Aún no hay solicitudes.</p>
        ) : (
          <table className="tbl agent-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Canal</th>
                <th>Nombre</th>
                <th>Contacto</th>
                <th>Respaldo</th>
                <th>Detalle</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.code}</strong>
                    {lead.conversationId ? (
                      <>
                        <br />
                        <Link href={`/admin/agente?c=${lead.conversationId}`}>Ver conversación</Link>
                      </>
                    ) : null}
                  </td>
                  <td>{fmt(lead.createdAt)}</td>
                  <td>{KIND[lead.kind]}{lead.role ? ` · ${lead.role}` : ""}</td>
                  <td>{CHANNEL[lead.channel]}</td>
                  <td>{lead.name || "—"}</td>
                  <td>{lead.contact || "—"}</td>
                  <td>{lead.backupContact || "—"}</td>
                  <td style={{ whiteSpace: "pre-wrap", fontSize: ".82rem", maxWidth: 320 }}>{lead.summary || "—"}</td>
                  <td>
                    <LeadStatusSelect leadId={lead.id} status={lead.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid c2" style={{ alignItems: "start" }}>
        <div className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Conversaciones</h2>
          {conversations.length === 0 ? (
            <p className="empty">Aún no hay conversaciones.</p>
          ) : (
            <table className="tbl">
              <tbody>
                {conversations.map((conv) => (
                  <tr key={conv.id} style={conv.id === selected?.id ? { background: "#fff4e8" } : undefined}>
                    <td>
                      <Link href={`/admin/agente?c=${conv.id}`}>{fmt(conv.updatedAt)}</Link>
                    </td>
                    <td>{CHANNEL[conv.channel]}</td>
                    <td>{conv.messageCount} msj.</td>
                    <td>{conv.handoffAt ? <span className="pill warn">Derivada</span> : conv.lastIntent || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2 style={{ fontSize: "1.1rem" }}>{selected ? `Conversación ${CHANNEL[selected.channel]} · ${fmt(selected.createdAt)}` : "Elija una conversación"}</h2>
          {selected ? (
            <div className="chat-log" style={{ maxHeight: 520, borderRadius: 10 }}>
              {messages.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.role === "cliente" ? "from-me" : "from-bot"}`} title={m.engine || undefined}>
                  <small style={{ display: "block", opacity: 0.7 }}>
                    {ROLE[m.role]} · {fmt(m.createdAt)}
                    {m.via === "voz" ? " · 🎙️ voz" : ""}
                    {m.engine ? ` · ${m.engine}` : ""}
                  </small>
                  {m.body}
                </div>
              ))}
            </div>
          ) : (
            <p className="meta">Los números de tarjeta y las claves se ocultan antes de guardar. No se guarda audio.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto", margin: "12px 0" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Herramientas del agente (módulo 12)</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Herramienta</th>
              <th>Estado</th>
              <th>Acceso</th>
              <th>Confirmación</th>
              <th>Auditoría</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {AGENT_TOOLS.map((tool) => (
              <tr key={tool.name}>
                <td>
                  <code>{tool.name}</code>
                </td>
                <td>
                  <span className={`pill ${TOOL_STATE[tool.status]}`}>{tool.status.replace("_", " ")}</span>
                </td>
                <td>{tool.auth === "sesion" ? `Sesión · ${tool.roles}` : "Pública"}</td>
                <td>{tool.confirmation ? "Sí" : "No"}</td>
                <td>{tool.audited ? "Sí" : "No"}</td>
                <td style={{ fontSize: ".82rem" }}>
                  {tool.description}
                  {tool.note ? <em className="meta"> {tool.note}</em> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
