"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { docTypeLabel } from "@/lib/catalog";
import { expiryStatus, formatDateCL } from "@/lib/format";
import type { AdminMetrics } from "@/lib/metrics";
import { roleLabel } from "@/lib/roles";
import type { DocumentRecord, PublicUser, VerificationStatus } from "@/lib/types";
import { ProfileForm } from "./ProfileForm";

type AdminDoc = DocumentRecord & { ownerName: string; ownerEmail: string };
type Filter = "" | VerificationStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "", label: "Todos" },
  { id: "pendiente", label: "Pendiente" },
  { id: "verificado", label: "Verificado" },
  { id: "rechazado", label: "Rechazado" },
];

export function AdminConsole({
  users,
  documents,
  metrics,
  today,
}: {
  users: PublicUser[];
  documents: AdminDoc[];
  metrics: AdminMetrics;
  today: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [userFilter, setUserFilter] = useState<Filter>("pendiente");
  const [docFilter, setDocFilter] = useState<Filter>("pendiente");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState("");

  const visibleUsers = users.filter((user) => !userFilter || user.verificationStatus === userFilter);
  const visibleDocs = documents.filter((doc) => !docFilter || doc.verificationStatus === docFilter);

  async function updateUser(id: string, verificationStatus: VerificationStatus) {
    setError("");
    const note = notes[`u:${id}`]?.trim() || null;
    if (verificationStatus === "rechazado" && !note) {
      setError("Escribe el motivo antes de rechazar la cuenta.");
      return;
    }
    const response = await fetch(`/api/admin/usuarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationStatus, note }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "No se pudo actualizar la cuenta.");
      return;
    }
    router.refresh();
  }

  async function userAction(id: string, method: "PATCH" | "DELETE", body?: unknown) {
    setError("");
    const response = await fetch(`/api/admin/usuarios/${id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "No se pudo actualizar la cuenta.");
      return;
    }
    router.refresh();
  }

  async function updateDoc(id: string, verificationStatus: VerificationStatus) {
    setError("");
    const note = notes[`d:${id}`]?.trim() || null;
    if (verificationStatus === "rechazado" && !note) {
      setError("Escribe el motivo antes de rechazar el documento.");
      return;
    }
    const response = await fetch(`/api/admin/documentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationStatus, note }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "No se pudo actualizar el documento.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="grid c4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="meta">Usuarios</div>
          <strong style={{ fontSize: "1.6rem" }}>{metrics.users}</strong>
        </div>
        <div className="card">
          <div className="meta">Cargas</div>
          <strong style={{ fontSize: "1.6rem" }}>{metrics.loads}</strong>
        </div>
        <div className="card">
          <div className="meta">Camiones</div>
          <strong style={{ fontSize: "1.6rem" }}>{metrics.trucks}</strong>
        </div>
        <div className="card">
          <div className="meta">Documentos por vencer</div>
          <strong style={{ fontSize: "1.6rem" }}>{metrics.expiring}</strong>
          <div className="meta">{metrics.expired} vencido(s)</div>
        </div>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <h2>Cuentas</h2>
      <FilterBar value={userFilter} onChange={setUserFilter} />
      {visibleUsers.length === 0 ? (
        <div className="empty">No hay cuentas con ese estado.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Motivo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.razonSocial}
                    <div className="meta">
                      {user.rut} · {user.city}
                      <br />
                      {user.email} {user.emailVerifiedAt ? "· correo ✓" : "· correo sin confirmar"}
                      <br />
                      Inscrito {formatDateCL(user.createdAt.slice(0, 10))}
                    </div>
                    {user.verificationNote ? <div className="meta">Último motivo: {user.verificationNote}</div> : null}
                  </td>
                  <td>{roleLabel(user.role)}</td>
                  <td>{user.verificationStatus}</td>
                  <td>
                    <input
                      aria-label={`Motivo para ${user.razonSocial}`}
                      placeholder="Motivo si rechazas"
                      value={notes[`u:${user.id}`] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [`u:${user.id}`]: event.target.value }))}
                    />
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn sm" type="button" onClick={() => updateUser(user.id, "verificado")}>
                        Verificar
                      </button>
                      <button className="btn danger sm" type="button" onClick={() => updateUser(user.id, "rechazado")}>
                        Rechazar
                      </button>
                      <button className="btn sec sm" type="button" onClick={() => setEditing(editing === user.id ? "" : user.id)}>
                        {editing === user.id ? "Cerrar" : "Editar datos"}
                      </button>
                      {user.emailVerifiedAt ? null : (
                        <button className="btn sec sm" type="button" onClick={() => userAction(user.id, "PATCH", { emailVerified: true })}>
                          Marcar correo verificado
                        </button>
                      )}
                      {user.role !== "admin" && user.verificationStatus !== "verificado" ? (
                        <button
                          className="btn danger sm"
                          type="button"
                          onClick={() => {
                            if (window.confirm(`¿Eliminar el registro de ${user.razonSocial} (${user.email})? No se puede deshacer.`)) {
                              void userAction(user.id, "DELETE");
                            }
                          }}
                        >
                          Eliminar registro
                        </button>
                      ) : null}
                    </div>
                    {editing === user.id ? (
                      <div style={{ marginTop: 10, minWidth: 320 }}>
                        <ProfileForm user={user} adminId={user.id} />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 style={{ marginTop: 22 }}>Documentos</h2>
      <FilterBar value={docFilter} onChange={setDocFilter} />
      {visibleDocs.length === 0 ? (
        <div className="empty">No hay documentos con ese estado.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Cuenta</th>
                <th>Vence</th>
                <th>Motivo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleDocs.map((doc) => {
                const alert = expiryStatus(doc.expiry, today);
                const rowClass = alert.light === "rojo" ? "row-bad" : alert.light === "amarillo" ? "row-alert" : "";
                return (
                  <tr key={doc.id} className={rowClass}>
                    <td>
                      {docTypeLabel(doc.type)}
                      {doc.detail ? ` ${doc.detail}` : ""}
                      <div className="meta">{doc.audience === "camion" ? doc.holderName || "Camión" : doc.holderName || "Personal"}</div>
                      {doc.fileName ? (
                        <div className="meta">
                          <a href={`/api/documentos/${doc.id}/archivo`} target="_blank" rel="noopener noreferrer">
                            Ver o descargar
                          </a>
                        </div>
                      ) : (
                        <div className="meta">Sin archivo</div>
                      )}
                      {doc.verificationNote ? <div className="meta">Motivo: {doc.verificationNote}</div> : null}
                    </td>
                    <td>
                      {doc.ownerName}
                      <div className="meta">{doc.ownerEmail}</div>
                    </td>
                    <td>
                      {formatDateCL(doc.expiry)}
                      <div className="meta">{alert.label}</div>
                    </td>
                    <td>
                      <input
                        aria-label={`Motivo para ${docTypeLabel(doc.type)}`}
                        placeholder="Motivo si rechazas"
                        value={notes[`d:${doc.id}`] ?? ""}
                        onChange={(event) => setNotes((current) => ({ ...current, [`d:${doc.id}`]: event.target.value }))}
                      />
                    </td>
                    <td>
                      <div className="row">
                        <button className="btn sm" type="button" onClick={() => updateDoc(doc.id, "verificado")}>
                          Aprobar
                        </button>
                        <button className="btn danger sm" type="button" onClick={() => updateDoc(doc.id, "rechazado")}>
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterBar({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return (
    <div className="row" style={{ margin: "8px 0 12px" }}>
      {FILTERS.map((item) => (
        <button
          key={item.id || "todos"}
          className={value === item.id ? "btn sm" : "btn sec sm"}
          type="button"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
