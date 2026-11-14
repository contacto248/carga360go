"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { docTypeLabel } from "@/lib/catalog";
import { expiryStatus, formatDateCL } from "@/lib/format";
import type { Accreditation } from "@/lib/accreditation";
import { REQUIREMENTS, REQUIREMENT_STATUSES, REQUIREMENT_STATUS_LABELS } from "@/lib/requirements";
import type { DocumentRecord, PublicUser, VerificationStatus } from "@/lib/types";
import type { BackupContact } from "@/lib/backup-contact";
import type { ManualReadonly } from "@/lib/manual-readonly";

type Checklist = {
  emailVerified: boolean;
  phoneVerified: boolean;
  docs: { type: string; label: string; status: string }[];
  docsReady: boolean;
  ready: boolean;
};

export type CarrierItem = {
  user: PublicUser;
  phoneDisplay: string;
  check: Checklist;
  acc: Accreditation;
  docs: DocumentRecord[];
  lastEmailDelivery: string | null;
  lastPhoneDelivery: string | null;
  /** Contacto de respaldo (privado: solo admin y el propio usuario). */
  backup: BackupContact | null;
  /** true si la verificación sigue pendiente (correo, teléfono, documentos o aprobación). */
  backupPending: boolean;
  /** Verificación manual: solo lectura por 30 días. */
  readonly: ManualReadonly;
};

const READONLY_BUTTON = "Verificación manual (solo lectura, 30 días)";

function dateTimeCL(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PILL: Record<string, string> = { falta: "gray", pendiente: "warn", rechazado: "bad", verificado: "ok", vencido: "bad" };
const LABEL: Record<string, string> = { falta: "Falta", pendiente: "Por revisar", rechazado: "Rechazado", verificado: "Aprobado", vencido: "Vencido" };

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`pill ${ok ? "ok" : "warn"}`}>{ok ? `✓ ${label}` : `✗ ${label}`}</span>;
}

export function CarrierReview({ items, today }: { items: CarrierItem[]; today: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  async function call(key: string, url: string, body: unknown) {
    setError("");
    setBusy(key);
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy("");
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "No se pudo guardar.");
      return;
    }
    router.refresh();
  }

  function rejectUser(id: string) {
    const note = notes[`u:${id}`]?.trim();
    if (!note) return setError("Escribe el motivo antes de rechazar la cuenta.");
    call(`u:${id}`, `/api/admin/usuarios/${id}`, { verificationStatus: "rechazado", note });
  }

  function grantReadonly(user: PublicUser) {
    const ok = window.confirm(
      `¿Dar a ${user.razonSocial} acceso de SOLO LECTURA por 30 días?\n\n` +
        "Podrá ver la plataforma, pero no publicar, ofertar ni tomar cargas hasta quedar acreditada y verificada por completo. " +
        "Al vencer sin acreditación, vuelve a pendiente. Quedará registrado que lo aprobaste tú.",
    );
    if (!ok) return;
    call(`ro:${user.id}`, `/api/admin/usuarios/${user.id}`, { manualReadonly: "otorgar" });
  }

  function revokeReadonly(user: PublicUser) {
    if (!window.confirm(`¿Revocar el acceso de solo lectura de ${user.razonSocial}? Volverá a quedar pendiente sin acceso.`)) return;
    call(`ro:${user.id}`, `/api/admin/usuarios/${user.id}`, { manualReadonly: "revocar" });
  }

  function rejectDoc(id: string) {
    const note = notes[`d:${id}`]?.trim();
    if (!note) return setError("Escribe el motivo antes de rechazar el documento.");
    call(`d:${id}`, `/api/admin/documentos/${id}`, { verificationStatus: "rechazado", note });
  }

  if (items.length === 0) return <div className="empty">No hay transportistas en este estado.</div>;

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {items.map(({ user, phoneDisplay, check, acc, docs, lastEmailDelivery, lastPhoneDelivery, backup, backupPending, readonly }) => (
        <article key={user.id} className="card" style={{ minWidth: 0 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h3 style={{ margin: 0 }}>{user.razonSocial}</h3>
              <div className="meta">
                RUT {user.rut} · {user.city} · {user.contactName} · registrado {formatDateCL(user.createdAt.slice(0, 10))}
                {user.freeUntil ? ` · gratis hasta ${formatDateCL(user.freeUntil)}` : ""}
              </div>
            </div>
            <span className={`pill ${readonly.active ? "warn" : PILL[user.verificationStatus]}`}>
              {user.verificationStatus === "verificado"
                ? "Aprobado"
                : user.verificationStatus === "rechazado"
                  ? "Rechazado"
                  : readonly.active
                    ? "Solo lectura (manual)"
                    : "En revisión"}
            </span>
          </div>
          {user.verificationNote ? <div className="meta">Último motivo: {user.verificationNote}</div> : null}
          <div className="meta" style={{ marginTop: 4 }}>
            Contacto de respaldo:{" "}
            {backup ? (
              <strong>
                {backup.display} ({backup.type === "email" ? "correo" : "teléfono"})
              </strong>
            ) : backupPending ? (
              <span className="err">no registrado (se le pide mientras la verificación esté pendiente)</span>
            ) : (
              "no registrado"
            )}
            {backup?.updatedAt ? ` · actualizado ${dateTimeCL(backup.updatedAt)} (hora de Chile)` : ""}
          </div>

          <div className="grid c2" style={{ marginTop: 10 }}>
            <div>
              <div className="row">
                <Badge ok={check.emailVerified} label="Correo" />
                <span className="meta">{user.email}</span>
              </div>
              {lastEmailDelivery ? <div className="meta">Último envío: {lastEmailDelivery}</div> : null}
              <button
                className="btn sec sm"
                type="button"
                style={{ marginTop: 6 }}
                disabled={busy === `e:${user.id}`}
                onClick={() => call(`e:${user.id}`, `/api/admin/usuarios/${user.id}`, { emailVerified: !check.emailVerified })}
              >
                {check.emailVerified ? "Desmarcar correo" : "Marcar correo verificado"}
              </button>
            </div>
            <div>
              <div className="row">
                <Badge ok={check.phoneVerified} label="Teléfono" />
                <span className="meta">{phoneDisplay}</span>
              </div>
              {lastPhoneDelivery ? <div className="meta">Último código: {lastPhoneDelivery}</div> : null}
              <button
                className="btn sec sm"
                type="button"
                style={{ marginTop: 6 }}
                disabled={busy === `p:${user.id}`}
                onClick={() => call(`p:${user.id}`, `/api/admin/usuarios/${user.id}`, { phoneVerified: !check.phoneVerified })}
              >
                {check.phoneVerified ? "Desmarcar teléfono" : "Marcar teléfono verificado"}
              </button>
            </div>
          </div>

          <div className="qse" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>Acreditación {acc.done}/{acc.total}</strong>
              <span className={`pill ${acc.accredited ? "ok" : acc.ready ? "warn" : "gray"}`}>
                {acc.accredited ? "100% acreditada" : acc.ready ? "Lista para aprobar" : "Incompleta"}
              </span>
            </div>
            <div className="meta">
              Política de Privacidad: {acc.privacyAccepted ? "✓ aceptada (versión vigente)" : "✗ no aceptada (se le pedirá al ingresar)"}
            </div>
            <div className="form-grid" style={{ marginTop: 8 }}>
              {REQUIREMENTS.map((req) => (
                <label key={req.key} className="f">
                  {req.label}
                  <select
                    value={acc.requirements[req.key]}
                    disabled={busy === `r:${user.id}:${req.key}`}
                    onChange={(event) =>
                      call(`r:${user.id}:${req.key}`, `/api/admin/usuarios/${user.id}`, { requirement: req.key, requirementStatus: event.target.value })
                    }
                  >
                    {REQUIREMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {REQUIREMENT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {user.role !== "transportista" ? null : (
          <>
          <div className="chips" style={{ marginTop: 10 }}>
            {check.docs.map((doc) => (
              <span key={doc.type} className={`pill ${PILL[doc.status]}`}>
                {doc.label}: {LABEL[doc.status]}
              </span>
            ))}
          </div>

          {docs.length === 0 ? (
            <div className="meta">Aún no sube documentos.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Vence</th>
                    <th>Estado</th>
                    <th>Motivo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const alert = expiryStatus(doc.expiry, today);
                    return (
                      <tr key={doc.id} className={alert.light === "rojo" ? "row-bad" : alert.light === "amarillo" ? "row-alert" : ""}>
                        <td>
                          {docTypeLabel(doc.type)}
                          {doc.detail ? ` ${doc.detail}` : ""}
                          <div className="meta">{doc.holderName || (doc.audience === "camion" ? "Camión" : "Personal")}</div>
                          {doc.fileName ? (
                            <div className="meta">
                              <a href={`/api/documentos/${doc.id}/archivo`} target="_blank" rel="noopener noreferrer">
                                Ver archivo
                              </a>
                            </div>
                          ) : (
                            <div className="meta">Sin archivo</div>
                          )}
                        </td>
                        <td>
                          {formatDateCL(doc.expiry)}
                          <div className="meta">{alert.label}</div>
                        </td>
                        <td>
                          <span className={`pill ${PILL[doc.verificationStatus]}`}>{LABEL[doc.verificationStatus]}</span>
                          {doc.verificationNote ? <div className="meta">{doc.verificationNote}</div> : null}
                        </td>
                        <td>
                          <input
                            aria-label="Motivo de rechazo del documento"
                            placeholder="Motivo si rechazas"
                            value={notes[`d:${doc.id}`] ?? ""}
                            onChange={(event) => setNotes((current) => ({ ...current, [`d:${doc.id}`]: event.target.value }))}
                          />
                        </td>
                        <td>
                          <div className="row">
                            {doc.verificationStatus === "verificado" ? null : (
                              <button
                                className="btn sm"
                                type="button"
                                disabled={busy === `d:${doc.id}`}
                              onClick={() =>
                                call(`d:${doc.id}`, `/api/admin/documentos/${doc.id}`, {
                                  verificationStatus: "verificado" as VerificationStatus,
                                  note: null,
                                })
                              }
                            >
                                Aprobar
                              </button>
                            )}
                            <button className="btn danger sm" type="button" onClick={() => rejectDoc(doc.id)}>
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

          </>
          )}

          {user.verificationStatus === "verificado" ? null : (
            <div className="qse" style={{ marginTop: 12 }}>
              <strong>Verificación manual</strong>
              {readonly.active && readonly.until ? (
                <div className="meta">
                  ✓ Solo lectura vigente hasta el {dateTimeCL(readonly.until)} (hora de Chile), {readonly.daysLeft}{" "}
                  {readonly.daysLeft === 1 ? "día" : "días"} restantes. Aprobada por {readonly.grantedByEmail ?? readonly.grantedBy ?? "—"}
                  {readonly.grantedAt ? ` el ${dateTimeCL(readonly.grantedAt)} (hora de Chile)` : ""}. No puede publicar, ofertar ni tomar cargas.
                </div>
              ) : readonly.expired && readonly.until ? (
                <div className="meta">La solo lectura venció el {dateTimeCL(readonly.until)} sin acreditación completa: la cuenta está pendiente.</div>
              ) : (
                <div className="meta">
                  Da acceso de solo lectura por 30 días mientras termina su acreditación. No habilita publicar, ofertar ni tomar cargas.
                </div>
              )}
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn sec sm" type="button" disabled={busy === `ro:${user.id}`} onClick={() => grantReadonly(user)}>
                  {readonly.active ? "Renovar: " : ""}
                  {READONLY_BUTTON}
                </button>
                {readonly.active ? (
                  <button className="btn danger sm" type="button" disabled={busy === `ro:${user.id}`} onClick={() => revokeReadonly(user)}>
                    Revocar solo lectura
                  </button>
                ) : null}
              </div>
            </div>
          )}

          <div className="row" style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <button
              className="btn"
              type="button"
              disabled={!acc.ready || busy === `u:${user.id}` || user.verificationStatus === "verificado"}
              title={acc.ready ? "" : "Faltan requisitos de acreditación"}
              onClick={() => call(`u:${user.id}`, `/api/admin/usuarios/${user.id}`, { verificationStatus: "verificado" })}
            >
              {user.verificationStatus === "verificado" ? "✓ Cuenta aprobada" : "Aprobar cuenta"}
            </button>
            <input
              aria-label={`Motivo de rechazo para ${user.razonSocial}`}
              placeholder="Motivo del rechazo de la cuenta"
              value={notes[`u:${user.id}`] ?? ""}
              onChange={(event) => setNotes((current) => ({ ...current, [`u:${user.id}`]: event.target.value }))}
              style={{ maxWidth: 320 }}
            />
            <button className="btn danger" type="button" onClick={() => rejectUser(user.id)}>
              Rechazar cuenta
            </button>
            {!acc.ready && user.verificationStatus !== "verificado" ? (
              <span className="meta">
                Para aprobar falta:{" "}
                {acc.items
                  .filter((item) => item.key !== "aprobacion" && !item.ok)
                  .map((item) => item.label.toLowerCase())
                  .join(", ")}
                .
              </span>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
