"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WhatsAppContactGate } from "@/components/WhatsAppContactGate";
import { formatClp, formatDateCL } from "@/lib/format";
import type { OfferWithLoad } from "@/lib/offers";

type Mode = "owner" | "admin" | "carrier" | "carrier_locked" | "guest" | "other";

type Props = {
  loadId: string;
  loadRoute: string;
  status: string;
  offersOpen: boolean;
  offersUntil: string | null;
  allowImprove: boolean;
  budgetClp: number | null;
  pickupDate: string;
  today: string;
  mode: Mode;
  lockReason?: string;
  offers: OfferWithLoad[];
  trucks: { id: string; label: string }[];
  awardedContact: { name: string; contact: string; whatsapp: string; email: string } | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  activa: { label: "Activa", cls: "pill" },
  aceptada: { label: "✔ Aceptada", cls: "pill ok" },
  rechazada: { label: "No elegida", cls: "pill gray" },
  retirada: { label: "Retirada", cls: "pill gray" },
};

function fmtUntil(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" });
}

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "No se pudo completar la acción.");
  return data;
}

export function OffersPanel(props: Props) {
  const router = useRouter();
  const mine = props.mode === "carrier" ? props.offers[0] ?? null : null;
  const [price, setPrice] = useState(mine ? String(mine.priceClp) : "");
  const [pickupDate, setPickupDate] = useState(mine?.pickupDate ?? (props.pickupDate >= props.today ? props.pickupDate : props.today));
  const [truckId, setTruckId] = useState(mine?.truckId ?? "");
  const [note, setNote] = useState(mine?.note ?? "");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [pending, setPending] = useState(false);

  async function run(task: () => Promise<unknown>, success: string) {
    setPending(true);
    setError("");
    setOk("");
    try {
      await task();
      setOk(success);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error.");
    } finally {
      setPending(false);
    }
  }

  const canEditMine = mine && mine.status === "activa" ? props.allowImprove : true;
  const showForm = props.mode === "carrier" && props.offersOpen && (!mine || mine.status === "retirada" || (mine.status === "activa" && props.allowImprove));
  const active = props.offers.filter((offer) => offer.status === "activa");
  const best = active.length ? Math.min(...active.map((offer) => offer.priceClp)) : null;

  return (
    <section id="ofertas" className="card offers">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Ofertas</h2>
        {props.status === "abierta" ? (
          <span className="deadline">
            {props.offersOpen ? (props.offersUntil ? `⏱ Recibe ofertas hasta el ${fmtUntil(props.offersUntil)}` : "⏱ Recibiendo ofertas") : "⏱ El plazo para ofertar terminó"}
          </span>
        ) : props.status === "adjudicada" ? (
          <span className="pill ok">✔ Carga adjudicada</span>
        ) : (
          <span className="pill gray">Solicitud cerrada</span>
        )}
      </div>
      <p className="meta" style={{ marginTop: 6 }}>
        Solo transportistas con cuenta verificada pueden ofertar. Los contactos se comparten solo entre el mandante y el transportista elegido, al adjudicar.{" "}
        {props.status !== "abierta" ? "" : props.allowImprove ? "Pueden mejorar su oferta (bajar el precio) hasta el cierre." : "Cada transportista envía una sola oferta."}{" "}
        {props.budgetClp ? `Precio ofrecido por el mandante: $${formatClp(props.budgetClp)} CLP.` : "El mandante no indicó precio: oferta el tuyo."}
      </p>

      {props.mode === "guest" ? (
        <div className="notice">
          ¿Eres transportista? <Link href={`/ingreso?next=/cargas/${props.loadId}`}>Ingresa</Link> o{" "}
          <Link href="/registro">crea tu cuenta</Link> y valida tus documentos para ofertar.
        </div>
      ) : null}
      {props.mode === "carrier_locked" ? <div className="notice">{props.lockReason}</div> : null}
      {props.mode === "other" ? <div className="notice">Las ofertas las envían transportistas aprobados. Tú puedes publicar tus propias cargas.</div> : null}

      {props.mode === "carrier" && mine ? (
        <div className={`offer ${mine.status === "aceptada" ? "won" : ""}`} style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>Tu oferta</strong>
            <span className={STATUS[mine.status]?.cls}>{STATUS[mine.status]?.label}</span>
          </div>
          <div className="price">${formatClp(mine.priceClp)} CLP</div>
          <div className="meta">
            Retiro {formatDateCL(mine.pickupDate)}
            {mine.truckLabel ? ` · ${mine.truckLabel}` : ""}
            {mine.revisions ? ` · mejorada ${mine.revisions} ${mine.revisions === 1 ? "vez" : "veces"}` : ""}
          </div>
          {mine.note ? <div className="meta">“{mine.note}”</div> : null}
          {mine.status === "aceptada" && props.awardedContact ? (
            <div className="notice" style={{ background: "#effaf1", borderColor: "#c4e8cb", color: "#14532d" }}>
              ¡Ganaste esta carga! Coordina con {props.awardedContact.contact} ({props.awardedContact.name}) ·{" "}
              <WhatsAppContactGate
                number={props.awardedContact.whatsapp}
                text={`Hola, soy el transportista adjudicado en Carga360go para ${props.loadRoute}.`}
                className="wa-text"
              >
                WhatsApp +{props.awardedContact.whatsapp}
              </WhatsAppContactGate>{" "}
              · <a href={`mailto:${props.awardedContact.email}`}>{props.awardedContact.email}</a>
            </div>
          ) : null}
          {mine.status === "activa" ? (
            <div className="row">
              <button
                className="btn danger sm"
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("¿Retirar tu oferta?")) run(() => call(`/api/ofertas/${mine.id}`, "PATCH", { action: "retirar" }), "Oferta retirada.");
                }}
              >
                Retirar oferta
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <form
          style={{ marginTop: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => call(`/api/cargas/${props.loadId}/ofertas`, "POST", { priceClp: Number(price), pickupDate, truckId: truckId || null, note }),
              mine && mine.status === "activa" ? "Oferta mejorada. Avisamos al mandante." : "Oferta enviada. Avisamos al mandante por correo.",
            );
          }}
        >
          <h3>{mine && mine.status === "activa" ? "Mejorar mi oferta" : "Enviar mi oferta"}</h3>
          <div className="form-grid">
            <label className="f">
              Precio total del flete (CLP) *
              <input type="number" inputMode="numeric" min={1} step={1} value={price} onChange={(event) => setPrice(event.target.value)} required disabled={!canEditMine} />
            </label>
            <label className="f">
              Fecha de retiro *
              <input type="date" min={props.today} value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} required />
            </label>
            <label className="f">
              Camión (opcional)
              <select value={truckId} onChange={(event) => setTruckId(event.target.value)}>
                <option value="">Sin indicar</option>
                {props.trucks.map((truck) => (
                  <option key={truck.id} value={truck.id}>
                    {truck.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              Comentario (opcional)
              <input value={note} maxLength={600} onChange={(event) => setNote(event.target.value)} placeholder="Ej: incluye carga y descarga, seguro de carga vigente" />
            </label>
          </div>
          {mine && mine.status === "activa" ? <p className="meta">Para mejorar tu oferta el precio debe ser igual o menor a ${formatClp(mine.priceClp)}.</p> : null}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" type="submit" disabled={pending}>
              {pending ? "Enviando…" : mine && mine.status === "activa" ? "Mejorar oferta" : "Enviar oferta"}
            </button>
          </div>
        </form>
      ) : null}
      {props.mode === "carrier" && !props.offersOpen && !mine ? <div className="notice">Esta carga ya no recibe ofertas.</div> : null}

      {props.mode === "owner" || props.mode === "admin" ? (
        <div style={{ marginTop: 12 }}>
          {props.status === "adjudicada" && props.mode === "owner" ? (
            <div className="notice" style={{ background: "#effaf1", borderColor: "#c4e8cb", color: "#14532d", marginBottom: 10 }}>
              Elegiste una oferta. Te enviamos por correo el contacto del transportista y a él el tuyo.
            </div>
          ) : null}
          {props.offers.length === 0 ? (
            <div className="empty">Aún no hay ofertas. Avisamos por correo a los transportistas con camiones compatibles; te escribiremos cuando llegue una.</div>
          ) : (
            <div className="offer-list">
              {props.offers.map((offer) => (
                <div key={offer.id} className={`offer ${offer.status === "aceptada" ? "won" : offer.status === "activa" && offer.priceClp === best ? "best" : ""}`}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>
                      {offer.carrierName} {offer.carrierVerified ? <span className="pill ok">✔ Verificado</span> : <span className="pill warn">Sin verificar</span>}
                    </strong>
                    <span className={STATUS[offer.status]?.cls}>
                      {offer.status === "activa" && offer.priceClp === best ? "Mejor precio" : STATUS[offer.status]?.label}
                    </span>
                  </div>
                  <div className="price">${formatClp(offer.priceClp)} CLP</div>
                  <div className="meta">
                    Retiro {formatDateCL(offer.pickupDate)} · base {offer.carrierCity}
                    {offer.truckLabel ? ` · ${offer.truckLabel}` : ""}
                    {offer.revisions ? ` · mejorada ${offer.revisions} ${offer.revisions === 1 ? "vez" : "veces"}` : ""}
                  </div>
                  {offer.note ? <div className="meta">“{offer.note}”</div> : null}
                  {offer.status === "aceptada" && offer.carrierWhatsapp ? (
                    <div className="notice" style={{ background: "#effaf1", borderColor: "#c4e8cb", color: "#14532d" }}>
                      Contacto del transportista: {offer.carrierContact} · WhatsApp +{offer.carrierWhatsapp}
                      {offer.carrierEmail ? (
                        <>
                          {" "}
                          · <a href={`mailto:${offer.carrierEmail}`}>{offer.carrierEmail}</a>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="row">
                    {props.status === "abierta" && offer.status === "activa" ? (
                      <button
                        className="btn sm"
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`¿Elegir la oferta de ${offer.carrierName} por $${formatClp(offer.priceClp)}? Las demás se cerrarán.`)) {
                            run(() => call(`/api/ofertas/${offer.id}`, "PATCH", { action: "aceptar" }), "Oferta aceptada. Les enviamos el contacto a ambos.");
                          }
                        }}
                      >
                        Elegir esta oferta
                      </button>
                    ) : null}
                    {offer.status === "aceptada" || props.mode === "admin" ? (
                      <WhatsAppContactGate
                        number={offer.carrierWhatsapp}
                        text={`Hola ${offer.carrierContact}, te escribo por tu oferta en Carga360go para ${props.loadRoute}.`}
                        className="btn wa sm"
                      >
                        💬 WhatsApp
                      </WhatsAppContactGate>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          {props.status === "abierta" ? (
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn sec sm"
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("¿Dejar de recibir ofertas sin elegir ninguna? La carga sale del listado.")) {
                    run(() => call(`/api/cargas/${props.loadId}/cerrar`, "POST"), "Solicitud cerrada.");
                  }
                }}
              >
                Cerrar sin elegir
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? <p className="okmsg">{ok}</p> : null}
    </section>
  );
}
