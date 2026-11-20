import type { Metadata } from "next";
import Link from "next/link";
import { LoadCard, TruckCard } from "@/components/Cards";
import { AlertsPanel } from "@/components/Alerts";
import { AccreditationPanel } from "@/components/AccreditationPanel";
import { FreeBanner } from "@/components/FreeBanner";
import { KycGraceBanner } from "@/components/KycGraceBanner";
import { DocPanel } from "@/components/DocPanel";
import { accreditationOf } from "@/lib/accreditation";
import { ResendVerification } from "@/components/ResendVerification";
import { alertsEnabled, listSavedSearches } from "@/lib/alerts";
import { marketplaceViewer } from "@/lib/access";
import { listDocuments } from "@/lib/documents";
import { firstParam, formatClp, formatDateCL, todayChile } from "@/lib/format";
import { listOwn } from "@/lib/listings";
import { equipmentById } from "@/lib/catalog";
import { listOffersByCarrier } from "@/lib/offers";
import { canPublishLoad, canPublishTruck, roleLabel } from "@/lib/roles";
import { kycEnabled } from "@/lib/kyc/config";
import { registrationPdfEnabled } from "@/lib/registration-pdf";
import { BackupContactForm } from "@/components/BackupContactForm";
import { ManualReadonlyBanner } from "@/components/ManualReadonlyBanner";
import { backupContactOf, needsBackupContact } from "@/lib/backup-contact";
import { ComprobantesPanel } from "@/components/qr/ComprobantesPanel";
import { qrFase1Enabled } from "@/lib/qr/flag";

export const metadata: Metadata = { title: "Mi panel", robots: { index: false, follow: false } };

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await marketplaceViewer();
  const ok = firstParam(sp.ok);
  if (!user) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="page-title">
          <h1>Mi panel</h1>
          <p>Tus publicaciones, matches y documentos.</p>
        </div>
        <div className="card">
          <h3>Aún no tienes una sesión iniciada</h3>
          <p>Registra tu empresa o transportista para publicar y gestionar documentos.</p>
          <div className="row">
            <Link className="btn" href="/registro">
              Registrar empresa
            </Link>
            <Link className="btn sec" href="/ingreso?next=/panel">
              Ingresar
            </Link>
          </div>
        </div>
      </div>
    );
  }
  const own = listOwn(user.id);
  const acc = accreditationOf(user.id);
  const docs = listDocuments(user.id);
  const matches = own.loads.reduce((sum, load) => sum + load.matches.length, 0) + own.trucks.reduce((sum, truck) => sum + truck.matches.length, 0);
  const message = ok === "carga" ? "Carga publicada." : ok === "camion" ? "Camión publicado." : ok === "perfil" ? "Cuenta creada." : "";
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Mi panel</h1>
        <p>Tus publicaciones, matches y documentos.</p>
      </div>
      {message ? (
        <div className="notice" style={{ background: "#effaf1", borderColor: "#c4e8cb", color: "#14532d", marginBottom: 12 }}>
          ✓ {message}
          {ok === "carga" || ok === "camion" ? " Ya aparece en el listado público y avisamos por correo a quienes calzan." : ""}
        </div>
      ) : null}
      <ManualReadonlyBanner user={user} />
      <FreeBanner user={user} />
      <KycGraceBanner grace={acc.grace} />
      <AccreditationPanel acc={acc} role={user.role} compact />
      {needsBackupContact(user.id) ? <BackupContactForm current={backupContactOf(user.id)?.display ?? null} required /> : null}
      {user.emailVerifiedAt || user.role === "admin" ? null : (
        <div className="notice" style={{ marginBottom: 12 }}>
          Confirma tu correo {user.email} para poder publicar cargas y camiones. Abre el enlace que te enviamos o pide otro.{" "}
          <Link href="/cuenta-en-revision#mis-datos">¿El correo está mal? Corrígelo en Mis datos</Link>
          <ResendVerification email={user.email} loggedIn />
        </div>
      )}
      <p className="meta" style={{ marginTop: 0 }}>
        <Link href="/cuenta-en-revision#mis-datos">Mis datos (correo, RUT, WhatsApp)</Link>
        {kycEnabled() && user.role !== "admin" ? (
          <>
            {" · "}
            <Link href="/verificar-identidad">Verificar mi cuenta (teléfono e identidad)</Link>
          </>
        ) : null}
        {registrationPdfEnabled() && user.role !== "admin" ? (
          <>
            {" · "}
            <a href="/api/inscripcion/pdf">Copia de mi inscripción (PDF)</a>
          </>
        ) : null}
      </p>
      <div className="grid c4" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="meta">Cuenta</div>
          <strong>{user.razonSocial}</strong>
          <div className="meta">
            {roleLabel(user.role)} · RUT {user.rut} · {user.city} ·{" "}
            {user.verificationStatus === "verificado" ? "verificada" : user.verificationStatus === "rechazado" ? "rechazada" : "sin verificar"}
          </div>
        </div>
        {canPublishLoad(user.role) || own.loads.length ? (
          <div className="card">
            <div className="meta">Cargas publicadas</div>
            <strong style={{ fontSize: "1.6rem" }}>{own.loads.length}</strong>
          </div>
        ) : null}
        {canPublishTruck(user.role) || own.trucks.length ? (
          <div className="card">
            <div className="meta">Camiones publicados</div>
            <strong style={{ fontSize: "1.6rem" }}>{own.trucks.length}</strong>
          </div>
        ) : null}
        <div className="card">
          <div className="meta">Matches disponibles</div>
          <strong style={{ fontSize: "1.6rem" }}>{matches}</strong>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        {canPublishLoad(user.role) && acc.accredited ? (
          <Link className="btn" href="/cargas/nueva">
            + Publicar carga
          </Link>
        ) : null}
        {canPublishTruck(user.role) && acc.accredited ? (
          <Link className="btn" href="/camiones/nuevo">
            + Publicar camión
          </Link>
        ) : null}
      </div>
      <AlertsPanel alerts={listSavedSearches(user.id)} enabled={alertsEnabled(user.id)} />
      {user.role !== "mandante" || docs.length ? (
        <DocPanel
          docs={docs}
          today={todayChile()}
          trucks={own.trucks.map((truck) => ({
            id: truck.id,
            label: `${equipmentById(truck.equipment).label} ${truck.origin} → ${truck.destination}`,
          }))}
        />
      ) : null}
      {qrFase1Enabled() && (user.role === "mandante" || user.role === "admin") ? <ComprobantesPanel userId={user.id} /> : null}
      {user.role === "transportista" ? <MyOffers userId={user.id} /> : null}
      {canPublishLoad(user.role) || own.loads.length ? <h2 style={{ marginTop: 22 }}>Mis cargas</h2> : null}
      {!canPublishLoad(user.role) && own.loads.length === 0 ? null : own.loads.length === 0 ? (
        <div className="empty">No has publicado cargas.</div>
      ) : (
        <div className="grid c2">
          {own.loads.map((load) => (
            <LoadCard key={load.id} load={load} canManage />
          ))}
        </div>
      )}
      {canPublishTruck(user.role) || own.trucks.length ? <h2 style={{ marginTop: 22 }}>Mis camiones</h2> : null}
      {!canPublishTruck(user.role) && own.trucks.length === 0 ? null : own.trucks.length === 0 ? (
        <div className="empty">No has publicado camiones.</div>
      ) : (
        <div className="grid c2">
          {own.trucks.map((truck) => (
            <TruckCard key={truck.id} truck={truck} canManage />
          ))}
        </div>
      )}
    </div>
  );
}

const OFFER_LABEL: Record<string, string> = { activa: "Activa", aceptada: "✔ Aceptada", rechazada: "No elegida", retirada: "Retirada" };

function MyOffers({ userId }: { userId: string }) {
  const offers = listOffersByCarrier(userId);
  return (
    <section id="ofertas">
      <h2 style={{ marginTop: 22 }}>Mis ofertas</h2>
      {offers.length === 0 ? (
        <div className="empty">
          Aún no has ofertado. <Link href="/cargas">Busca cargas y envía tu oferta →</Link>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Carga</th>
                <th>Precio</th>
                <th>Retiro</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id}>
                  <td>
                    <Link href={`/cargas/${offer.loadId}#ofertas`}>{offer.loadRoute}</Link>
                    <div className="meta">{offer.loadOwnerName}</div>
                  </td>
                  <td>${formatClp(offer.priceClp)}</td>
                  <td>{formatDateCL(offer.pickupDate)}</td>
                  <td>{OFFER_LABEL[offer.status] ?? offer.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
