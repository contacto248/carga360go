"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { equipmentById, regionLabel, regionOfCity, specLines } from "@/lib/catalog";
import { MATCH_DISCLAIMER, MATCH_NAME } from "@/lib/match-copy";
import { formatClp, formatDateCL, waLink } from "@/lib/format";
import { roadKm } from "@/lib/geo";
import { TruckArt } from "./TruckArt";
import { PRICE_DISCLAIMER, estimatePrice } from "@/lib/pricing";
import type { LoadListItem, TruckListItem } from "@/lib/types";

function WhatsApp({ number, text, label = "WhatsApp" }: { number: string; text: string; label?: string }) {
  return (
    <a className="btn wa sm" href={waLink(number, text)} target="_blank" rel="noopener noreferrer">
      💬 {label}
    </a>
  );
}

function ContactLocked() {
  return (
    <span className="pill gray contact-locked" title="El WhatsApp, correo y teléfono se comparten solo entre el mandante y el transportista elegido, al adjudicar una oferta.">
      🔒 Contacto oculto hasta adjudicar la oferta
    </span>
  );
}

function RegionLine({ origin, destination }: { origin: string; destination: string }) {
  const from = regionLabel(regionOfCity(origin));
  const to = regionLabel(regionOfCity(destination));
  if (!from && !to) return null;
  return <div className="meta region-line">📍 {from === to ? `${from} (dentro de la región)` : `${from} → ${to}`}</div>;
}

function TrustBadges({ status, docsOk }: { status: string; docsOk?: boolean }) {
  return (
    <>
      {status === "verificado" ? <span className="pill ok" title="Cuenta revisada por un administrador">✔ Verificado</span> : null}
      {status === "rechazado" ? <span className="pill bad">Cuenta rechazada</span> : null}
      {status === "pendiente" ? (
        <span className="pill gray" title="Un administrador aún no revisa la cuenta de quien publica">
          Cuenta sin verificar
        </span>
      ) : null}
      {docsOk ? <span className="pill docs" title="Documentos aprobados y ninguno vencido">📄 Documentos al día</span> : null}
    </>
  );
}

function Distance({ origin, destination }: { origin: string; destination: string }) {
  const km = roadKm(origin, destination);
  if (!km) return null;
  return <span title="Distancia vial estimada">≈ {formatClp(km)} km</span>;
}

function PriceHint({ origin, destination, equipment }: { origin: string; destination: string; equipment: string }) {
  const estimate = estimatePrice(origin, destination, equipment);
  if (!estimate) return null;
  return (
    <div className="price-hint" title={PRICE_DISCLAIMER}>
      💡 Precio referencial: ${formatClp(estimate.min)} – ${formatClp(estimate.max)} <Link className="ref" href="/herramientas/calculadora">referencial · cómo se calcula</Link>
    </div>
  );
}

function deadlineText(until: string | null): string {
  if (!until) return "Recibiendo ofertas";
  const ms = Date.parse(until) - Date.now();
  if (ms <= 0) return "Plazo para ofertar terminado";
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 48) return `Ofertas por ${Math.floor(hours / 24)} días más`;
  if (hours >= 1) return `Ofertas por ${hours} h más`;
  return `Ofertas por ${Math.max(1, Math.floor(ms / 60_000))} min más`;
}

export function LoadStatusLine({ load }: { load: LoadListItem }) {
  const trip =
    load.tripStatus === "en_camino" ? "En camino al retiro" :
    load.tripStatus === "retirado" ? "Carga retirada" :
    load.tripStatus === "en_transito" ? "En tránsito" :
    load.tripStatus === "incidencia" ? "Incidencia" :
    load.tripStatus === "entregado" ? "Entrega declarada" :
    load.status === "adjudicada" ? "Adjudicada" : "";
  return (
    <span className="row" style={{ gap: 8 }}>
      {load.inmediata ? <span className="pill">Pedido inmediato</span> : null}
      {trip ? <span className={load.tripStatus === "incidencia" ? "pill bad" : "pill ok"}>{trip}</span> : null}
      {load.status === "cerrada" ? <span className="pill gray">Cerrada</span> : null}
      {load.status === "abierta" ? (
        <span className="deadline" suppressHydrationWarning>
          ⏱ {deadlineText(load.offersUntil)} · {load.offerCount} {load.offerCount === 1 ? "oferta" : "ofertas"}
        </span>
      ) : null}
    </span>
  );
}

export function LoadCard({
  load,
  canManage = false,
  priceHint = false,
  showOfferButton = true,
}: {
  load: LoadListItem;
  canManage?: boolean;
  priceHint?: boolean;
  showOfferButton?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const equipment = equipmentById(load.equipment);
  const chips = specLines(load.equipment, load.specs, "load");

  async function remove() {
    if (!confirm("¿Eliminar esta carga?")) return;
    const response = await fetch(`/api/cargas/${load.id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error || "No se pudo eliminar.");
      return;
    }
    router.refresh();
  }

  return (
    <article className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill eqpill">
          <TruckArt id={equipment.id} className="truck-mini" /> {equipment.label}
        </span>
        <span className="row">
          {load.isDemo ? <span className="pill demo">DEMO</span> : null}
          {load.soloVerificados ? <span className="pill">Solo verificados</span> : null}
          <TrustBadges status={load.ownerVerification} docsOk={load.ownerDocsOk} />
        </span>
      </div>
      <Link href={`/cargas/${load.id}`} className="route" style={{ marginTop: 8 }}>
        {load.origin} <span className="arrow">→</span> {load.destination}
      </Link>
      <RegionLine origin={load.origin} destination={load.destination} />
      {load.isDemo ? null : (
        <div style={{ margin: "6px 0 2px" }}>
          <LoadStatusLine load={load} />
        </div>
      )}
      <div className="meta">
        Retiro {formatDateCL(load.pickupDate)} · {load.weightT} t · <Distance origin={load.origin} destination={load.destination} />
        {load.ownerName ? ` · ${load.ownerName}` : ""}
      </div>
      <p style={{ margin: "8px 0 0" }}>{load.description}</p>
      {chips.length > 0 ? (
        <div className="chips">
          {chips.map((chip) => (
            <span key={chip} className="chip">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      {load.budgetClp ? <div className="meta">Precio ofrecido por el mandante: <strong>${formatClp(load.budgetClp)} CLP</strong></div> : null}
      {priceHint ? <PriceHint origin={load.origin} destination={load.destination} equipment={load.equipment} /> : null}
      {load.notes ? <div className="meta">{load.notes}</div> : null}
      <div className="row" style={{ marginTop: 10 }}>
        {showOfferButton && !load.isDemo ? (
          <Link className="btn sm" href={`/cargas/${load.id}#ofertas`}>
            {canManage ? `Ver ofertas (${load.offerCount})` : load.status === "abierta" ? "💲 Ofertar / ver detalle" : "Ver detalle"}
          </Link>
        ) : null}
        {canManage ? null : !load.whatsapp ? <ContactLocked /> : <WhatsApp
          number={load.whatsapp}
          text={`Hola, vi tu carga ${load.origin} → ${load.destination} (${equipment.label}, ${load.weightT} t, retiro ${formatDateCL(load.pickupDate)}) en Carga360go. Tengo un camión disponible.`}
        />}
        <button className="btn sec sm" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "Ocultar" : `Camiones compatibles (${load.matches.length})`}
        </button>
        {canManage ? (
          <Link className="btn sec sm" href={`/cargas/${load.id}/editar`}>
            Editar
          </Link>
        ) : null}
        {canManage ? (
          <button className="btn danger sm" type="button" onClick={remove}>
            Eliminar
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="matchbox">
          {load.matches.length === 0 ? (
            <div className="meta">Aún no hay camiones compatibles. Cuando se publique uno que calce, avisamos por correo a quien publicó la carga.</div>
          ) : null}
          {load.matches.map((item) => (
            <div key={item.truck.id} className="matchitem">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {item.truck.origin} → {item.truck.destination} · {item.truck.tonnage} t
                </strong>
                <span className="score">{item.score}% {MATCH_NAME}</span>
              </div>
              <div className="meta">
                Disponible {formatDateCL(item.truck.availableFrom)} al {formatDateCL(item.truck.availableTo)}{item.truck.ownerName ? ` · ${item.truck.ownerName}` : ""}{" "}
                {item.truck.isDemo ? <span className="pill demo">DEMO</span> : null}
              </div>
              <ul>
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {item.warnings.map((warning) => (
                  <li key={warning} className="w">
                    ⚠ {warning}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 6 }}>
                {!item.truck.whatsapp ? (
                  <span className="meta">🔒 Si le interesa, este transportista puede ofertar en la carga. El contacto se comparte al adjudicar.</span>
                ) : <WhatsApp
                  number={item.truck.whatsapp}
                  label="Contactar transportista"
                  text={`Hola, tu camión ${equipment.label} ${item.truck.origin} → ${item.truck.destination} calza con una carga mía en Carga360go: ${load.origin} → ${load.destination}, ${load.weightT} t, retiro ${formatDateCL(load.pickupDate)}.`}
                />}
              </div>
            </div>
          ))}
          {load.matches.length > 0 ? <p className="meta match-disclaimer">{MATCH_DISCLAIMER}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

export function TruckCard({ truck, canManage = false }: { truck: TruckListItem; canManage?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const equipment = equipmentById(truck.equipment);
  const chips = specLines(truck.equipment, truck.specs, "truck");

  async function remove() {
    if (!confirm("¿Eliminar este camión?")) return;
    const response = await fetch(`/api/camiones/${truck.id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error || "No se pudo eliminar.");
      return;
    }
    router.refresh();
  }

  return (
    <article className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill eqpill">
          <TruckArt id={equipment.id} className="truck-mini" /> {equipment.label}
        </span>
        <span className="row">
          {truck.isDemo ? <span className="pill demo">DEMO</span> : null}
          <TrustBadges status={truck.ownerVerification} docsOk={truck.ownerDocsOk} />
        </span>
      </div>
      <Link href={`/camiones/${truck.id}`} className="route" style={{ marginTop: 8 }}>
        {truck.origin} <span className="arrow">→</span> {truck.destination}
      </Link>
      <RegionLine origin={truck.origin} destination={truck.destination} />
      <div className="meta">
        Disponible {formatDateCL(truck.availableFrom)} al {formatDateCL(truck.availableTo)} · {truck.tonnage} t ·{" "}
        <Distance origin={truck.origin} destination={truck.destination} />
        {truck.ownerName ? ` · ${truck.ownerName}` : ""}
      </div>
      {chips.length > 0 ? (
        <div className="chips">
          {chips.map((chip) => (
            <span key={chip} className="chip">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      {truck.notes ? <div className="meta">{truck.notes}</div> : null}
      <div className="row" style={{ marginTop: 10 }}>
        {canManage ? null : !truck.whatsapp ? <ContactLocked /> : <WhatsApp
          number={truck.whatsapp}
          label="Contactar"
          text={`Hola, vi tu camión ${equipment.label} ${truck.origin} → ${truck.destination} (${formatDateCL(truck.availableFrom)} al ${formatDateCL(truck.availableTo)}) en Carga360go. Tengo una carga para ti.`}
        />}
        <button className="btn sec sm" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "Ocultar" : `Cargas compatibles (${truck.matches.length})`}
        </button>
        {canManage ? (
          <Link className="btn sec sm" href={`/camiones/${truck.id}/editar`}>
            Editar
          </Link>
        ) : null}
        {canManage ? (
          <button className="btn danger sm" type="button" onClick={remove}>
            Eliminar
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="matchbox">
          {truck.matches.length === 0 ? <div className="meta">No hay cargas compatibles por ahora. Cuando se publique una que calce, avisamos por correo a quien publicó el camión.</div> : null}
          {truck.matches.map((item) => (
            <div key={item.load.id} className="matchitem">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {item.load.origin} → {item.load.destination} · {item.load.weightT} t
                </strong>
                <span className="score">{item.score}% {MATCH_NAME}</span>
              </div>
              <div className="meta">
                Retiro {formatDateCL(item.load.pickupDate)} · {item.load.description}{" "}
                {item.load.isDemo ? <span className="pill demo">DEMO</span> : null}
              </div>
              <ul>
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {item.warnings.map((warning) => (
                  <li key={warning} className="w">
                    ⚠ {warning}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 6 }}>
                {!item.load.whatsapp ? (
                  <Link className="btn sm" href={`/cargas/${item.load.id}#ofertas`}>
                    💲 Ofertar en esta carga
                  </Link>
                ) : <WhatsApp
                  number={item.load.whatsapp}
                  label="Contactar dueño de la carga"
                  text={`Hola, tengo un camión ${equipment.label} ${truck.origin} → ${truck.destination} compatible con tu carga ${item.load.origin} → ${item.load.destination} (Carga360go).`}
                />}
              </div>
            </div>
          ))}
          {truck.matches.length > 0 ? <p className="meta match-disclaimer">{MATCH_DISCLAIMER}</p> : null}
        </div>
      ) : null}
    </article>
  );
}
