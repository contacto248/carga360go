import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactVerify } from "@/components/ContactVerify";
import { KycGraceBanner } from "@/components/KycGraceBanner";
import { IdentityStart } from "@/components/IdentityStart";
import { accreditationOf } from "@/lib/accreditation";
import { getCurrentUser } from "@/lib/current-user";
import { formatWhatsappDisplay } from "@/lib/format";
import { kycEnabled, KYC_MAX_ATTEMPTS } from "@/lib/kyc/config";
import { DIDIT_PRIVACY_LINKS, KYC_CONSENT_CHECKBOX, KYC_CONSENT_PARAGRAPHS, KYC_CONSENT_TITLE, KYC_CONSENT_VERSION } from "@/lib/kyc/consent";
import { kycOf, KYC_STATUS_LABELS } from "@/lib/kyc/service";
import { emailChannelReady, phoneChannelReady, whatsappOtpInboundEnabled } from "@/lib/notify";
import { lastCodeInfo } from "@/lib/verification";

/** Con el flag apagado ni el título revela la página. */
export function generateMetadata(): Metadata {
  return kycEnabled() ? { title: "Verificar mi cuenta", robots: { index: false, follow: false } } : { robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

const PILL: Record<string, string> = {
  no_iniciado: "gray",
  en_curso: "warn",
  en_revision: "warn",
  aprobado: "ok",
  rechazado: "bad",
  expirado: "gray",
};

/** Verificación de la cuenta: correo, teléfono e identidad (cédula + rostro). Solo con KYC_FEATURE_ENABLED=true. */
export default async function VerificarIdentidadPage() {
  if (!kycEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Verificar mi cuenta</h1>
          <p>Ingresa para verificar tu correo, tu teléfono y tu identidad.</p>
          <Link className="btn" href="/ingreso?next=/verificar-identidad">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  if (user.role === "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Verificar mi cuenta</h1>
          <p>La cuenta administradora no requiere verificación de identidad.</p>
          <Link className="btn" href="/admin/identidad">
            Ver verificaciones
          </Link>
        </div>
      </div>
    );
  }
  const kyc = kycOf(user.id);
  const phoneCode = lastCodeInfo(user.id, "phone");
  const canStart =
    Boolean(user.emailVerifiedAt) &&
    kyc.status !== "aprobado" &&
    kyc.status !== "en_revision" &&
    (kyc.attempts < KYC_MAX_ATTEMPTS || kyc.status === "en_curso");
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Verificar mi cuenta</h1>
        <p>
          Todas las cuentas de Carga360go, de mandantes y de transportistas, verifican su correo, su teléfono y su identidad. Así nadie
          puede hacerse pasar por otra persona o empresa.
        </p>
      </div>
      <KycGraceBanner grace={accreditationOf(user.id).grace} />
      <h2>1. Correo y teléfono</h2>
      <ContactVerify
        email={user.email}
        phone={formatWhatsappDisplay(user.whatsapp)}
        emailVerified={Boolean(user.emailVerifiedAt)}
        phoneVerified={Boolean(user.phoneVerifiedAt)}
        emailChannel={emailChannelReady()}
        phoneChannel={phoneChannelReady()}
        phoneMode={whatsappOtpInboundEnabled() ? "inbound" : phoneChannelReady() ? "outbound" : "none"}
        phoneCodeActive={Boolean(phoneCode && phoneCode.expiresAt > new Date().toISOString())}
      />
      <h2 style={{ marginTop: 22 }}>2. Identidad (cédula + reconocimiento facial)</h2>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Estado</strong>
          <span className={`pill ${PILL[kyc.status] ?? "gray"}`}>{KYC_STATUS_LABELS[kyc.status]}</span>
        </div>
        <p className="meta" style={{ marginBottom: 0 }}>
          {kyc.status === "aprobado"
            ? "Listo: tu identidad quedó verificada."
            : kyc.status === "en_revision"
              ? "Tu verificación quedó en revisión manual. Te avisaremos cuando termine (normalmente en menos de un día hábil)."
              : kyc.status === "en_curso"
                ? "Empezaste la verificación. Si no la terminaste, ábrela de nuevo con el botón de abajo."
                : kyc.status === "rechazado"
                  ? `La verificación no se aprobó. Revisa que tu cédula esté vigente, que la foto sea nítida y que haya buena luz. Intentos usados: ${kyc.attempts} de ${KYC_MAX_ATTEMPTS}.`
                  : kyc.status === "expirado"
                    ? "La verificación anterior venció sin terminarse. Puedes empezar otra."
                    : "Toma unos 3 minutos: una foto de tu cédula por ambos lados y una selfie corta."}
        </p>
      </div>
      {!user.emailVerifiedAt ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          Primero confirma tu correo; después podrás verificar tu identidad.
        </div>
      ) : null}
      {kyc.attempts >= KYC_MAX_ATTEMPTS && kyc.status === "rechazado" ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          Llegaste al máximo de intentos. Escríbenos a contacto@carga360go.cl y lo revisamos contigo.
        </div>
      ) : null}
      {canStart ? (
        <IdentityStart
          consentVersion={KYC_CONSENT_VERSION}
          title={KYC_CONSENT_TITLE}
          paragraphs={KYC_CONSENT_PARAGRAPHS}
          checkbox={KYC_CONSENT_CHECKBOX}
          links={DIDIT_PRIVACY_LINKS}
          buttonText={kyc.status === "en_curso" ? "Continuar la verificación" : "Verificar mi identidad"}
        />
      ) : null}
      <p className="meta">
        <a href="/api/inscripcion/pdf">Descargar la copia de mi inscripción (PDF)</a> · <Link href="/panel">Volver a mi panel</Link>
      </p>
    </div>
  );
}
