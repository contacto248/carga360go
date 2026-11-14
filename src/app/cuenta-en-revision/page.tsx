import type { Metadata } from "next";
import Link from "next/link";
import { AccreditationPanel } from "@/components/AccreditationPanel";
import { FreeBanner } from "@/components/FreeBanner";
import { ContactVerify } from "@/components/ContactVerify";
import { KycGraceBanner } from "@/components/KycGraceBanner";
import { accreditationOf } from "@/lib/accreditation";
import { DocPanel } from "@/components/DocPanel";
import { ProfileForm } from "@/components/ProfileForm";
import { ResendVerification } from "@/components/ResendVerification";
import { carrierChecklist } from "@/lib/carrier";
import { BackupContactForm } from "@/components/BackupContactForm";
import { ManualReadonlyBanner } from "@/components/ManualReadonlyBanner";
import { backupContactOf, verificationPending } from "@/lib/backup-contact";
import { isManualReadonly } from "@/lib/manual-readonly";
import { BRAND, equipmentById } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/current-user";
import { listDocuments } from "@/lib/documents";
import { formatWhatsappDisplay, todayChile } from "@/lib/format";
import { listOwn } from "@/lib/listings";
import { emailChannelReady, phoneChannelReady, whatsappOtpInboundEnabled } from "@/lib/notify";
import { lastCodeInfo } from "@/lib/verification";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

const STATUS_PILL: Record<string, string> = { falta: "gray", pendiente: "warn", rechazado: "bad", verificado: "ok", vencido: "bad" };
const STATUS_LABEL: Record<string, string> = {
  falta: "Falta subir",
  vencido: "Vencido: sube uno nuevo",
  pendiente: "En revisión",
  rechazado: "Rechazado",
  verificado: "Aprobado",
};

export default async function CuentaEnRevisionPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Mi cuenta</h1>
          <p>Ingresa para revisar el estado de tu cuenta.</p>
          <Link className="btn" href="/ingreso?next=/cuenta-en-revision">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  const acc = accreditationOf(user.id);
  const pendingVerification = verificationPending(user.id);
  const backup = backupContactOf(user.id);
  const backupForm = pendingVerification ? <BackupContactForm current={backup?.display ?? null} required /> : null;
  // Un transportista sin aprobar ve esta página completa, aunque tenga solo lectura manual vigente (debe terminar su verificación).
  const carrierPending = user.role === "transportista" && user.verificationStatus !== "verificado";
  if (!carrierPending) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card" style={{ marginBottom: 14 }}>
          <h1>{acc.accredited || user.role === "admin" ? "Tu cuenta está verificada" : "Completa tu acreditación"}</h1>
          <p>
            {acc.accredited || user.role === "admin"
              ? "Puedes publicar y participar en Carga360go. Los contactos se comparten solo entre el mandante y el transportista elegido al adjudicar una oferta."
              : "Puedes ver el listado público de cargas y camiones. Para publicar, ofertar y recibir contactos tu cuenta debe estar verificada (contacto confirmado, documentos vigentes si eres transportista, y aprobación de un administrador)."}
          </p>
          {user.emailVerifiedAt ? null : (
            <div className="notice" style={{ marginBottom: 10 }}>
              Confirma tu correo {user.email} para poder publicar. Abre el enlace que te enviamos o pide otro.
              <ResendVerification email={user.email} loggedIn />
            </div>
          )}
          <Link className="btn" href="/panel">
            Ir a mi panel
          </Link>
        </div>
        <ManualReadonlyBanner user={user} />
        <FreeBanner user={user} />
        <AccreditationPanel acc={acc} role={user.role} />
        {backupForm}
        <h2 id="mis-datos" style={{ marginTop: 22 }}>
          Mis datos
        </h2>
        <ProfileForm user={user} rutLocked={user.verificationStatus === "verificado" && user.role !== "admin"} />
      </div>
    );
  }
  const check = carrierChecklist(user.id);
  const docs = listDocuments(user.id);
  const trucks = listOwn(user.id).trucks;
  const phoneCode = lastCodeInfo(user.id, "phone");
  const phoneCodeActive = Boolean(phoneCode && phoneCode.expiresAt > new Date().toISOString());
  const rejected = user.verificationStatus === "rechazado";
  const readonly = isManualReadonly(user);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>{rejected ? "Cuenta rechazada" : "Cuenta en revisión"}</h1>
        <p>
          Hola {user.contactName}. Para proteger a mandantes y transportistas, las cuentas de transportista se activan solo después de
          validar la documentación.
        </p>
      </div>
      {rejected ? (
        <div className="notice" style={{ background: "#fee2e2", borderColor: "#f3c0c0", color: "#991b1b", marginBottom: 12 }}>
          Tu cuenta fue rechazada{user.verificationNote ? `: ${user.verificationNote}` : "."} Corrige lo indicado y sube los documentos
          nuevamente; la cuenta vuelve a revisión automáticamente.
        </div>
      ) : readonly ? (
        <ManualReadonlyBanner user={user} />
      ) : (
        <div className="notice" style={{ marginBottom: 12 }}>
          Mientras tu cuenta está en revisión no puedes ver cargas ni camiones, ni publicar disponibilidad u ofertar. Te avisaremos cuando un
          administrador la apruebe.
        </div>
      )}
      <FreeBanner user={user} />
      <KycGraceBanner grace={acc.grace} />
      <AccreditationPanel acc={acc} role={user.role} />
      {backupForm}
      <h2>1. Confirma tu correo y teléfono</h2>
      <ContactVerify
        email={user.email}
        phone={formatWhatsappDisplay(user.whatsapp)}
        emailVerified={check.emailVerified}
        phoneVerified={check.phoneVerified}
        emailChannel={emailChannelReady()}
        phoneChannel={phoneChannelReady()}
        phoneMode={whatsappOtpInboundEnabled() ? "inbound" : phoneChannelReady() ? "outbound" : "none"}
        phoneCodeActive={phoneCodeActive}
      />
      <h2 id="documentos" style={{ marginTop: 22 }}>2. Sube tu documentación</h2>
      <div className="card" style={{ marginBottom: 12 }}>
        <p className="meta" style={{ marginTop: 0 }}>
          Documentos obligatorios (PDF o foto legible, con fecha de vencimiento):
        </p>
        <div className="grid c3">
          {check.docs.map((doc) => (
            <div key={doc.type} className="row" style={{ justifyContent: "space-between" }}>
              <span>{doc.label}</span>
              <span className={`pill ${STATUS_PILL[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>
            </div>
          ))}
        </div>
        <p className="meta">
          Opcionales: seguro de carga, certificado de gases, hoja de vida del conductor, certificado de antecedentes, curso de manejo a la
          defensiva e inducción de seguridad. Los documentos del camión se identifican por la patente.
        </p>
      </div>
      <DocPanel
        docs={docs}
        today={todayChile()}
        trucks={trucks.map((truck) => ({
          id: truck.id,
          label: `${equipmentById(truck.equipment).label} ${truck.origin} → ${truck.destination}`,
        }))}
      />
      <h2 id="mis-datos" style={{ marginTop: 22 }}>
        Mis datos
      </h2>
      <p className="meta">¿Te equivocaste en el correo, el RUT o el teléfono? Corrígelo aquí.</p>
      <ProfileForm user={user} />
      <h2 style={{ marginTop: 22 }}>3. Revisión del administrador</h2>
      <div className="card">
        <p style={{ margin: 0 }}>
          Cuando tu correo y teléfono estén confirmados, los documentos obligatorios aprobados y vigentes, y un administrador apruebe la cuenta,
          quedan habilitadas la publicación y las ofertas. Esa revisión no es un sello de solvencia ni de seguridad operacional. ¿Dudas?
          Escríbenos a <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>.
        </p>
      </div>
    </div>
  );
}
