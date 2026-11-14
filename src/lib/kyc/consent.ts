/**
 * Consentimiento para la verificación de identidad (datos biométricos).
 * Texto aprobado para publicarse junto con KYC_FEATURE_ENABLED=true
 * (revisado por un abogado; Bastián autorizó publicarlo el 11-nov-2026).
 * Si cambia el texto, cambiar la versión: queda guardada junto a la fecha del
 * consentimiento de cada persona y se envía a Didit.
 *
 * Plazos de conservación: propuesta pendiente de confirmación de Bastián
 * (CARGA360GO SpA) antes de producción. Ver KYC_RETENTION_* más abajo.
 */
export const KYC_CONSENT_VERSION = "kyc-1.0-2026-11-11";

/**
 * PROPUESTA PENDIENTE DE CONFIRMACIÓN DE BASTIÁN (no está cerrada en el DPA).
 * Didit conserva las imágenes como máximo este plazo desde la decisión y luego las elimina.
 * Carga360go no guarda fotos ni selfies: solo el resultado.
 */
export const KYC_RETENTION_IMAGES_DAYS_PROPOSED = 30;
/**
 * PROPUESTA PENDIENTE DE CONFIRMACIÓN DE BASTIÁN.
 * El resultado (sin imágenes) se conserva mientras la cuenta esté activa y hasta estos meses después de su cierre.
 */
export const KYC_RETENTION_RESULTS_MONTHS_AFTER_CLOSE_PROPOSED = 12;
/** Sigue pendiente que Bastián confirme los dos plazos de arriba. */
export const KYC_RETENTION_PENDING_CONFIRMATION = true;

export const KYC_CONSENT_TITLE = "Consentimiento para verificar tu identidad (datos biométricos)";

export const KYC_CONSENT_PARAGRAPHS: string[] = [
  "CARGA360GO SpA (RUT 78.553.352-6, Colón 352 of. 318, La Serena) necesita verificar la identidad de cada persona que usa Carga360go, sea mandante o transportista, para evitar suplantaciones y fraudes en la contratación de fletes.",
  "Para eso te pediremos una foto de tu cédula de identidad chilena (por ambos lados) y una selfie en video corta. Con ellas se comprueba que la cédula es auténtica y está vigente, que eres una persona real presente en ese momento (prueba de vida) y que tu rostro coincide con la foto de la cédula. La imagen de tu rostro y su comparación son datos biométricos, que la Ley 21.719 considera datos personales sensibles.",
  "La verificación la realiza nuestro proveedor Didit (Didit Identity Technologies S.L., Barcelona, España), por encargo de CARGA360GO SpA. Tus imágenes se procesan y almacenan en servidores de la Unión Europea (Irlanda), que cuenta con un nivel adecuado de protección de datos. Carga360go no guarda tus fotos ni tu selfie: solo recibe el resultado (aprobado, rechazado o en revisión), tu nombre y RUN leídos de la cédula y la fecha.",
  "Usamos estos datos solo para verificar tu identidad y acreditar tu cuenta. No los usamos para publicidad ni los vendemos. Las imágenes se conservan en el proveedor como máximo 30 días desde la decisión y luego se eliminan. El resultado se conserva en Carga360go mientras tu cuenta esté activa y hasta 12 meses después de su cierre, para atender reclamos o requerimientos legales.",
  "Tu consentimiento es voluntario, pero sin la verificación de identidad tu cuenta no puede acreditarse para publicar, ofertar ni recibir contactos. Puedes retirar tu consentimiento y ejercer tus derechos de acceso, rectificación, supresión, oposición, portabilidad y bloqueo escribiendo a contacto@carga360go.cl. Más detalles en nuestra Política de Privacidad.",
];

export const KYC_CONSENT_CHECKBOX =
  "Autorizo expresamente a CARGA360GO SpA y a su proveedor Didit a tratar mis datos biométricos (imagen de mi rostro y de mi cédula) para verificar mi identidad, en los términos descritos arriba.";

export const DIDIT_PRIVACY_LINKS = [
  { href: "https://didit.me/terms/verification-privacy-notice", label: "Aviso de privacidad de Didit" },
  { href: "https://didit.me/terms/identity-verification", label: "Términos de verificación de Didit" },
];
