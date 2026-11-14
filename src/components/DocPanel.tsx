"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { docTypeById, docTypeLabel, docsFor } from "@/lib/catalog";
import { expiryStatus, formatDateCL, lightPill, worstLight } from "@/lib/format";
import type { DocAudience, DocumentRecord } from "@/lib/types";

export function DocPanel({
  docs,
  today,
  trucks,
}: {
  docs: DocumentRecord[];
  today: string;
  trucks: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [audience, setAudience] = useState<DocAudience>("camion");
  const types = docsFor(audience);
  const [type, setType] = useState(types[0].id);
  const [detail, setDetail] = useState("A4");
  const [holderName, setHolderName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [truckId, setTruckId] = useState(trucks[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);
  const lights = docs.map((doc) => expiryStatus(doc.expiry, today).light);
  const overall = worstLight(lights);
  const selected = docTypeById(type) ?? types[0];
  const detailValue = selected.details?.includes(detail) ? detail : selected.details?.[0] ?? "";
  const [serie, setSerie] = useState("");

  function changeAudience(next: DocAudience) {
    const nextTypes = docsFor(next);
    setAudience(next);
    setType(nextTypes[0].id);
    setHolderName("");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expiry) return;
    setPending(true);
    setError("");
    setSaved("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set("type", type);
    form.set("detail", selected.details ? detailValue : "");
    const serieText = type === "cedula" && serie.trim() ? ` · N° documento ${serie.trim()}` : "";
    form.set("holderName", audience === "personal" || !truckId ? holderName + serieText : "");
    form.set("truckId", audience === "camion" ? truckId : "");
    const response = await fetch("/api/documentos", { method: "POST", body: form });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "No se pudo guardar el documento.");
      return;
    }
    setExpiry("");
    setHolderName("");
    setSerie("");
    formElement.reset();
    setSaved("Documento guardado. Queda por revisar: te avisaremos cuando un administrador lo apruebe.");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Quitar este documento?")) return;
    const response = await fetch(`/api/documentos/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "No se pudo quitar.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Documentos y vencimientos</h3>
        <span className={`pill ${lightPill(overall)}`}>
          <span className={`light ${overall}`} />
          Semáforo: {overall}
        </span>
      </div>
      <p className="meta">
        Del camión: padrón, revisión técnica, permiso de circulación, SOAP, seguro de carga y certificado de gases. Del conductor: licencia
        A2, A4 o A5, cédula, hoja de vida, antecedentes, manejo a la defensiva e inducción de seguridad. Verde es más de 30 días, amarillo es 30
        días o menos y rojo es vencido. Un administrador aprueba o rechaza con motivo.
      </p>
      {docs.length === 0 ? (
        <div className="empty" style={{ padding: 10 }}>
          Aún no cargas documentos.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Vence</th>
                <th>Alerta</th>
                <th>Revisión</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const status = expiryStatus(doc.expiry, today);
                const rowClass = status.light === "rojo" ? "row-bad" : status.light === "amarillo" ? "row-alert" : "";
                const label = docTypeLabel(doc.type) + (doc.detail ? ` ${doc.detail}` : "");
                return (
                  <tr key={doc.id} className={rowClass}>
                    <td>
                      {label}
                      <div className="meta">{doc.audience === "camion" ? doc.holderName || "Camión" : doc.holderName || "Personal"}</div>
                      {doc.fileName ? (
                        <div className="meta">
                          <a href={`/api/documentos/${doc.id}/archivo`} target="_blank" rel="noopener noreferrer">
                            Ver o descargar
                          </a>
                        </div>
                      ) : null}
                      {doc.verificationNote ? <div className="meta">Motivo: {doc.verificationNote}</div> : null}
                    </td>
                    <td>{formatDateCL(doc.expiry)}</td>
                    <td>
                      <span className={`light ${status.light}`} />
                      {status.label}
                    </td>
                    <td>
                      <span className={`pill ${doc.verificationStatus === "verificado" ? "ok" : doc.verificationStatus === "rechazado" ? "bad" : "warn"}`}>
                        {doc.verificationStatus}
                      </span>
                    </td>
                    <td>
                      <button className="btn danger sm" type="button" onClick={() => remove(doc.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <form className="form-grid" style={{ marginTop: 12 }} onSubmit={onSubmit}>
        <label className="f">
          Corresponde a
          <select
            value={audience}
            onChange={(event) => changeAudience(event.target.value === "personal" ? "personal" : "camion")}
          >
            <option value="camion">Un camión</option>
            <option value="personal">Personal o conductor</option>
          </select>
        </label>
        <label className="f">
          Documento
          <select name="type" value={type} onChange={(event) => setType(event.target.value)}>
            {types.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {audience === "camion" ? (
          <label className="f">
            Camión *
            <select name="truckId" value={truckId} onChange={(event) => setTruckId(event.target.value)}>
              {trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.label}
                </option>
              ))}
              <option value="">Indicar patente</option>
            </select>
          </label>
        ) : (
          <label className="f">
            Nombre de la persona *
            <input name="holderName" value={holderName} onChange={(event) => setHolderName(event.target.value)} required />
          </label>
        )}
        {audience === "camion" && !truckId ? (
          <label className="f">
            Patente del camión *
            <input
              name="holderName"
              value={holderName}
              onChange={(event) => setHolderName(event.target.value.toUpperCase())}
              placeholder="ABCD12"
              maxLength={10}
              required
            />
          </label>
        ) : null}
        {type === "cedula" ? (
          <label className="f">
            N° de documento / serie (opcional)
            <input value={serie} onChange={(event) => setSerie(event.target.value)} maxLength={20} placeholder="Ej: 123.456.789" />
            <span className="meta">Sube una foto de la cara frontal y otra del reverso.</span>
          </label>
        ) : null}
        {selected.details ? (
          <label className="f">
            {selected.detailLabel || "Detalle"} *
            <select name="detail" value={detailValue} onChange={(event) => setDetail(event.target.value)}>
              {selected.details.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="f">
          Fecha de vencimiento *
          <input name="expiry" type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} required />
        </label>
        <label className="f full">
          Archivo (opcional, PDF o imagen, máx. 10 MB)
          <input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" />
        </label>
        {saved ? <p className="okmsg full">{saved}</p> : null}
        {error ? (
          <p className="err full" role="alert">
            {error}
          </p>
        ) : null}
        <div className="full">
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Agregar documento"}
          </button>
        </div>
      </form>
    </div>
  );
}
