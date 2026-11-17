import { CAMPAIGN_PROMISE, CAMPAIGN_TEXT } from "./campaign";
import { BRAND } from "./catalog";
import { kycEnabled } from "./kyc/config";
import { PAYMENTS_COMING_SOON_NOTE, paymentsComingSoon, paymentsLegalPublished } from "./pagos/config";
import {
  KYC_RETENTION_IMAGES_DAYS_PROPOSED,
  KYC_RETENTION_RESULTS_MONTHS_AFTER_CLOSE_PROPOSED,
} from "./kyc/consent";
import { privacyUpdated, privacyVersion, PRIVACY_UPDATED, PRIVACY_VERSION } from "./privacy";

/**
 * Texto único de la Política de Privacidad. Lo usan la página /privacidad y el generador del PDF/DOCX
 * (scripts/export-legal-docs.py). La versión 1.6 (verificación de identidad) solo se incluye
 * con KYC_FEATURE_ENABLED=true, junto con el resto del módulo. Ver policyMeta() y policySections().
 */
export type PolicyBlock = string | { list: string[] } | { table: [string, string][] };
export type PolicySection = { id: string; title: string; blocks: PolicyBlock[] };

const SITE = "https://carga360go.cl";
const PHONE = "+56 9 5842 8693";
const RAZON = "CARGA360 GO SpA";

export function policyMeta() {
  return {
    title: "Política de Privacidad de Carga360go",
    version: privacyVersion(),
    updated: privacyUpdated(),
    site: SITE,
  };
}

/** Instantánea al importar (flag apagado en carga). Preferir policyMeta(). */
export const POLICY_META = {
  title: "Política de Privacidad de Carga360go",
  version: PRIVACY_VERSION,
  updated: PRIVACY_UPDATED,
  site: SITE,
};

export const POLICY_INTRO: string[] = [
  `Esta Política de Privacidad explica cómo ${RAZON} (también escrita ${BRAND.company}) trata los datos personales de quienes visitan ${SITE} y de quienes se registran como mandantes (empresas o personas que necesitan transportar carga) o transportistas (empresas o personas con camiones).`,
  "Al marcar la casilla «He leído y acepto la Política de Privacidad» al crear tu cuenta, declaras haberla leído y aceptas el tratamiento de tus datos en los términos aquí descritos. Si no estás de acuerdo, no crees una cuenta.",
  "Esta política se rige por la legislación chilena, en particular la Ley N° 19.628 sobre Protección de la Vida Privada y la Ley N° 21.719, que la modifica y crea la Agencia de Protección de Datos Personales (vigente desde el 1 de diciembre de 2026, o la fecha que fije la ley si se posterga). Desde su entrada en vigencia aplicaremos todas las obligaciones y derechos que establece la Ley N° 21.719.",
];

export const POLICY_SECTIONS: PolicySection[] = [
  {
    id: "responsable",
    title: "1. Responsable del tratamiento",
    blocks: [
      {
        table: [
          ["Razón social", `${RAZON} (${BRAND.company})`],
          ["Nombre de fantasía", "Carga360go / Carga 360 Go"],
          ["RUT", BRAND.rut],
          ["País", "Chile"],
          ["Operación", "Solo en línea"],
          ["Representante legal", `${BRAND.manager} (Gerente General y Administrador)`],
          ["Correo de contacto y de privacidad", BRAND.email],
          ["Teléfono / WhatsApp", PHONE],
          ["Sitio web", SITE],
        ],
      },
      `No hemos designado un delegado de protección de datos. Toda consulta o solicitud sobre tus datos se atiende en ${BRAND.email}.`,
    ],
  },
  {
    id: "definiciones",
    title: "2. Definiciones",
    blocks: [
      {
        list: [
          "Datos personales: cualquier información sobre una persona natural identificada o identificable.",
          "Datos sensibles: los que se refieren a características físicas o morales, salud, origen, ideología, vida sexual u otros de la esfera íntima. Carga360go no solicita datos sensibles; si un documento los contiene, no los usamos para ningún fin.",
          "Titular: la persona a quien se refieren los datos.",
          "Tratamiento: cualquier operación con datos (recolectar, guardar, usar, comunicar, eliminar, etc.).",
          "Responsable: quien decide sobre el tratamiento; en Carga360go es la sociedad indicada en el punto 1.",
          "Encargado: proveedor que trata datos por cuenta del responsable (por ejemplo, el hosting o el correo).",
          "Mandante: usuario que publica cargas. Transportista: usuario que ofrece transporte y camiones.",
        ],
      },
    ],
  },
  {
    id: "datos",
    title: "3. Qué datos recopilamos",
    blocks: [
      "Solo pedimos lo necesario para operar la plataforma:",
      {
        list: [
          "Datos de la cuenta: tipo de cuenta (mandante o transportista), razón social o nombre, RUT de la empresa o RUT personal si actúas como persona natural, nombre de contacto, correo electrónico, número de WhatsApp o teléfono, región y ciudad base, y la contraseña (guardada solo como huella cifrada, nunca en texto legible).",
          "Datos de verificación y acreditación: confirmación de tu correo y teléfono (fecha y canal del código), la fecha y versión de esta política que aceptaste, y el resultado de la revisión de requisitos de calidad, seguridad y medio ambiente que hace un administrador.",
          "Documentos de transportistas: cédula de identidad, licencia de conducir profesional, padrón, revisión técnica, SOAP, permiso de circulación y, si los subes, seguro de carga, certificado de gases, hoja de vida del conductor, certificado de antecedentes y cursos; con su fecha de vencimiento, patente del camión o nombre de la persona y el archivo (PDF o imagen).",
          "Publicaciones: cargas (origen, destino, fechas, peso, equipo, descripción, precio ofrecido) y camiones (equipo, capacidad, ruta, disponibilidad).",
          "Ofertas: precio, fecha de retiro, camión y comentario que envía un transportista, y la elección del mandante.",
          "Alertas: búsquedas guardadas y preferencias de avisos por correo.",
          "Datos técnicos: dirección IP, fecha y hora de las acciones, navegador o aplicación usada y registros del servidor, necesarios para la seguridad y para prevenir fraudes.",
          "Comunicaciones: los mensajes que nos envías por correo o WhatsApp.",
        ],
      },
      "No recopilamos datos de tarjetas ni de medios de pago: hoy la plataforma no tiene un sistema de pago. Guardamos la fecha de término del periodo gratis de 30 días de cada cuenta. Antes de cobrar la futura membresía actualizaremos esta política para informar qué datos de facturación se pedirán, y solo los trataremos si aceptas la membresía.",
    ],
  },
  {
    id: "finalidades",
    title: "4. Para qué usamos tus datos",
    blocks: [
      {
        list: [
          "Crear y administrar tu cuenta, permitirte ingresar y recuperar tu contraseña.",
          "Acreditar las cuentas: verificar identidad, correo y teléfono, validar la documentación de transportistas y camiones, y revisar requisitos de calidad, seguridad y medio ambiente. Solo las cuentas 100% acreditadas pueden publicar cargas o camiones, ofertar y recibir datos de contacto.",
          "Publicar tus cargas o camiones, sugerir coincidencias (match) entre cargas y camiones compatibles y gestionar ofertas.",
          "Poner en contacto únicamente al mandante y al transportista elegido cuando se adjudica una oferta.",
          "Enviarte avisos de la cuenta (verificación, documentos por vencer, ofertas recibidas, mejoradas o aceptadas) y, si las activas, alertas de cargas o camiones que calzan.",
          "Mantener la seguridad: límites de intentos, detección de abusos y registro de auditoría de acciones importantes.",
          "Atender consultas, reclamos y solicitudes de derechos.",
          "Cumplir obligaciones legales y responder a requerimientos de autoridades competentes.",
          "Elaborar estadísticas agregadas y anónimas de uso (por ejemplo, número de cargas por región).",
        ],
      },
      "No vendemos ni arrendamos tus datos, y no los usamos para publicidad de terceros.",
    ],
  },
  {
    id: "bases",
    title: "5. Base legal del tratamiento",
    blocks: [
      {
        list: [
          "Tu consentimiento, que otorgas al aceptar esta política al registrarte y que puedes retirar en cualquier momento (sin efecto retroactivo). Retirarlo implica cerrar la cuenta, porque sin esos datos no podemos prestar el servicio.",
          "La ejecución de la relación con el usuario (Términos de uso): sin tus datos de cuenta no podemos prestarte el servicio.",
          "El interés legítimo de mantener una plataforma segura, prevenir fraudes y acreditar a mandantes y transportistas para proteger a ambas partes.",
          "El cumplimiento de obligaciones legales.",
        ],
      },
    ],
  },
  {
    id: "visibilidad",
    title: "6. Quién ve tus datos dentro de la plataforma",
    blocks: [
      "Regla general: los datos de contacto (WhatsApp, teléfono y correo) de quien publica una carga o un camión, y los de los transportistas que ofertan, no se muestran a nadie hasta que el mandante elige una oferta y la carga queda adjudicada. Recién entonces se revelan, y solo entre el mandante y el transportista elegido.",
      {
        list: [
          "Visitantes y usuarios registrados: ven el listado público de cargas y camiones (ruta, fechas, equipo, peso y el estado de verificación de quien publica), sin nombre ni datos de contacto. Si un texto libre incluye un teléfono, correo o enlace, la plataforma lo oculta.",
          "Ofertas: el mandante ve de cada oferta la razón social, la ciudad base, el estado de acreditación, el precio, la fecha y el comentario del transportista, pero no su WhatsApp, teléfono, correo ni nombre de contacto.",
          "Al adjudicar: cuando el mandante elige una oferta, ambos reciben el contacto del otro (nombre de contacto, WhatsApp y correo) por correo y en la plataforma, para coordinar el transporte. Los transportistas no elegidos no reciben datos del mandante, y el mandante no recibe los contactos de los demás.",
          "Documentos y requisitos: los documentos y la revisión de requisitos de calidad, seguridad y medio ambiente solo los ven el propio usuario y los administradores. Otros usuarios ven solo el resultado (por ejemplo, «Verificado» o «Documentos al día»).",
          "Administradores: el personal autorizado de la sociedad accede a los datos necesarios para acreditar cuentas, dar soporte, prevenir fraudes y resolver reclamos.",
        ],
      },
    ],
  },
  {
    id: "proveedores",
    title: "7. Proveedores (encargados) y transferencias internacionales",
    blocks: [
      "Compartimos datos solo con proveedores que los tratan por nuestra cuenta y bajo nuestras instrucciones:",
      {
        list: [
          "Hosting: la plataforma, su base de datos y los documentos se alojan en un servidor virtual privado (VPS) contratado al proveedor XHost.",
          "Correo electrónico: Google Workspace (Google LLC) para enviar desde contacto@carga360go.cl los avisos, códigos y notificaciones. Google puede procesar datos fuera de Chile (por ejemplo, en Estados Unidos) con sus propias garantías de seguridad y protección de datos.",
          "WhatsApp (próximamente): cuando habilitemos avisos o atención por WhatsApp Business, el número y los mensajes serán tratados también por Meta Platforms (WhatsApp), que puede procesarlos fuera de Chile. Te informaremos antes de activarlo.",
        ],
      },
      "Fuera de estos casos, solo comunicaremos datos a terceros si lo ordena la ley o una autoridad competente, o con tu consentimiento.",
    ],
  },
  {
    id: "cookies",
    title: "8. Cookies y tecnologías similares",
    blocks: [
      "Usamos solo una cookie técnica necesaria («c360_session») para mantener tu sesión iniciada de forma segura. Dura hasta 14 días o hasta que cierres sesión. No usamos cookies de publicidad ni herramientas de analítica de terceros.",
      "Si en el futuro incorporamos cookies que no sean necesarias, te pediremos tu consentimiento antes de usarlas.",
    ],
  },
  {
    id: "notificaciones",
    title: "9. Correos y avisos",
    blocks: [
      "Te enviaremos correos necesarios para el servicio (verificación, recuperación de contraseña, documentos, ofertas y adjudicaciones). Las alertas de cargas o camiones que calzan son opcionales: puedes desactivarlas en tu panel o con el enlace de baja de cada correo. No enviamos publicidad de terceros.",
    ],
  },
  {
    id: "conservacion",
    title: "10. Cuánto tiempo guardamos los datos",
    blocks: [
      {
        list: [
          "Datos de la cuenta, publicaciones y ofertas: mientras la cuenta esté activa. Si pides eliminarla, la borramos dentro de 30 días corridos, salvo lo que debamos conservar por obligación legal o para defendernos ante reclamos.",
          "Documentos de transportistas: mientras la cuenta esté activa; se eliminan junto con la cuenta. Puedes quitar un documento desde tu panel.",
          "Registro de auditoría (acciones importantes con fecha e IP): hasta 2 años, para seguridad y resolución de reclamos.",
          "Registros técnicos del servidor: hasta 90 días.",
          "Códigos de verificación y enlaces de recuperación: vencen en horas o pocos días y no se reutilizan.",
        ],
      },
    ],
  },
  {
    id: "seguridad",
    title: "11. Medidas de seguridad",
    blocks: [
      {
        list: [
          "Conexión cifrada (HTTPS) en todo el sitio.",
          "Contraseñas guardadas con un algoritmo de cifrado de una vía (scrypt), exigencia de contraseñas robustas y bloqueo temporal ante intentos fallidos.",
          "Acceso a documentos restringido al titular y a administradores, con validación del tipo de archivo.",
          "Datos de contacto ocultos para todos hasta la adjudicación, y filtro automático de teléfonos, correos y enlaces en textos libres.",
          "Límites de uso contra abusos y robots, cabeceras de seguridad del navegador y registro de auditoría de acciones sensibles.",
          "Respaldos de la base de datos y acceso al servidor limitado a personal autorizado.",
        ],
      },
      "Ningún sistema es 100% invulnerable. Si ocurre una vulneración de seguridad que afecte tus datos, la informaremos a la Agencia de Protección de Datos Personales y, cuando corresponda, a los titulares afectados, conforme a la ley.",
    ],
  },
  {
    id: "derechos",
    title: "12. Tus derechos (ARCO+)",
    blocks: [
      "Como titular puedes ejercer en forma gratuita los siguientes derechos:",
      {
        list: [
          "Acceso: saber qué datos tuyos tratamos, para qué, de dónde vienen y a quién se comunican.",
          "Rectificación: corregir datos inexactos o incompletos (puedes hacerlo tú mismo en «Mis datos»).",
          "Supresión o cancelación: pedir que eliminemos tus datos cuando ya no sean necesarios o retires tu consentimiento.",
          "Oposición: oponerte a ciertos tratamientos, por ejemplo a recibir alertas.",
          "Portabilidad: recibir tus datos en un formato estructurado y de uso común.",
          "Bloqueo: pedir la suspensión temporal del tratamiento mientras se resuelve una solicitud.",
          "No ser objeto de decisiones basadas únicamente en tratamiento automatizado: las sugerencias de match son automáticas, pero la aprobación de cuentas y documentos la hace una persona.",
          "Retirar tu consentimiento en cualquier momento.",
        ],
      },
      `Cómo ejercerlos: escribe a ${BRAND.email} con el asunto «Derechos de datos personales», indicando tu nombre, RUT, el correo de tu cuenta y qué derecho quieres ejercer. Para proteger tu cuenta podremos pedirte que confirmes tu identidad.`,
      "Plazo: acusaremos recibo y responderemos por escrito dentro de los plazos legales. Con la Ley N° 21.719, el plazo es de 30 días corridos desde la solicitud, prorrogable por una sola vez hasta por otros 30 días, avisándote. Las solicitudes de bloqueo temporal se responden dentro de 2 días hábiles.",
      "Si rechazamos total o parcialmente tu solicitud te explicaremos el motivo. Si no quedas conforme, o si no respondemos a tiempo, puedes reclamar ante la Agencia de Protección de Datos Personales dentro de 30 días hábiles (desde su entrada en funcionamiento) o ante los tribunales competentes.",
    ],
  },
  {
    id: "terceros",
    title: "13. Datos de terceros que subas",
    blocks: [
      "Si como empresa subes documentos o datos de conductores u otras personas (por ejemplo, la cédula o licencia de un chofer), declaras que les informaste y que cuentas con su autorización para entregarlos a Carga360go con los fines de esta política.",
    ],
  },
  {
    id: "menores",
    title: "14. Menores de edad",
    blocks: [
      "Carga360go está dirigida a empresas y personas mayores de 18 años. No permitimos cuentas de menores de edad ni tratamos sus datos de forma intencional. Si detectamos una cuenta de un menor, la eliminaremos.",
    ],
  },
  {
    id: "cambios",
    title: "15. Cambios a esta política",
    blocks: [
      `Podemos actualizar esta política por cambios legales o del servicio. Publicaremos la nueva versión en ${SITE}/privacidad con su fecha y número de versión. Si los cambios son importantes, te avisaremos por correo y, cuando la ley lo exija, te pediremos aceptarla nuevamente. Guardamos qué versión aceptó cada usuario y cuándo.`,
      "Historial: versión 1.0 (10 de noviembre de 2026), publicación inicial. Versión 1.1 (10 de noviembre de 2026): los datos de contacto se revelan solo al adjudicar una oferta y solo entre las dos partes, y solo las cuentas 100% acreditadas pueden publicar, ofertar y recibir contactos. Versión 1.2 (10 de noviembre de 2026): campaña de inscripción con 30 días gratis por cuenta desde su inscripción y futura membresía (valores por definir); se guarda la fecha de término del periodo gratis; la aceptación se pide junto con los Términos de uso. Versión 1.5 (17 de noviembre de 2026): se elimina el domicilio de calle. Carga360go opera solo en línea, en Chile; el contacto es el correo y el WhatsApp indicados.",
    ],
  },
  {
    id: "contacto",
    title: "16. Contacto",
    blocks: [
      `Para cualquier duda sobre esta política o tus datos: ${BRAND.email} · WhatsApp ${PHONE}.`,
      `${CAMPAIGN_TEXT} ${CAMPAIGN_PROMISE} El detalle está en los Términos de uso (${SITE}/terminos).`,
    ],
  },
];


const KYC_POLICY_SECTION: PolicySection = {
  id: "identidad",
  title: "17. Verificación de identidad y datos biométricos",
  blocks: [
    "Qué datos tratamos. Para acreditar cada cuenta (mandante o transportista) verificamos la identidad de la persona que la usa. Se trata: (a) la imagen de la cédula de identidad chilena por ambos lados y los datos que contiene (nombre, RUN, fecha de nacimiento, número y vigencia del documento); (b) una selfie en video para la prueba de vida; y (c) la comparación biométrica entre el rostro de la selfie y la foto de la cédula. No consultamos el RUN ante el Registro Civil. La imagen del rostro y la comparación facial son datos biométricos, datos personales sensibles según la Ley 21.719.",
    "Para qué. Únicamente para verificar que la persona es quien dice ser, prevenir suplantaciones y fraudes en la contratación de fletes y acreditar la cuenta. No se usan para publicidad, perfiles comerciales ni decisiones distintas de la acreditación, y no se venden ni se ceden.",
    "Base de licitud. El consentimiento expreso de la persona, que se pide en una casilla específica antes de iniciar la verificación y que queda registrado con fecha y versión del texto. Es voluntario, pero sin la verificación la cuenta no puede acreditarse para publicar, ofertar ni recibir contactos.",
    "Quién lo hace (encargado del tratamiento). Didit Identity Technologies S.L. (Barcelona, España), que realiza la verificación por cuenta de CARGA360GO SpA bajo un acuerdo de tratamiento de datos (DPA). Didit cuenta con certificaciones ISO 27001 y SOC 2.",
    "Transferencia internacional. Las imágenes y datos de la verificación se procesan y almacenan en servidores de la Unión Europea (Irlanda). La Unión Europea, bajo el Reglamento General de Protección de Datos (RGPD), ofrece un nivel adecuado de protección.",
    "Qué guarda Carga360go. No guardamos las fotos ni la selfie. Guardamos solo: el resultado (aprobado, rechazado, en revisión), el nombre y RUN leídos de la cédula (para compararlos con los datos de la cuenta), códigos de alerta técnicos, la fecha y el registro del consentimiento.",
    `Plazos de conservación. Imágenes y datos biométricos en Didit: como máximo ${KYC_RETENTION_IMAGES_DAYS_PROPOSED} días desde la decisión, y luego se eliminan. Resultado de la verificación en Carga360go: mientras la cuenta esté activa y hasta ${KYC_RETENTION_RESULTS_MONTHS_AFTER_CLOSE_PROPOSED} meses después de su cierre, para atender reclamos o requerimientos legales.`,
    "Derechos. Puedes pedir acceso, rectificación, supresión, oposición, portabilidad y bloqueo, y retirar tu consentimiento en cualquier momento, escribiendo a contacto@carga360go.cl. Retirarlo no afecta la licitud del tratamiento previo, pero la cuenta deja de estar acreditada. También puedes reclamar ante la Agencia de Protección de Datos Personales.",
    "Seguridad. La comunicación con Didit es cifrada; las respuestas del proveedor se reciben firmadas (HMAC) y se descartan las que no lo están. El acceso al resultado en el panel está limitado a administradores de Carga360go y queda registrado en la auditoría.",
  ],
};

/** Política vigente: con el flag incluye la sección 17 y ajustes relacionados; sin el flag, la 1.5 publicada. */
export function policySections(): PolicySection[] {
  const base = kycPolicySections();
  return paymentsLegalPublished() ? withPayments(base) : base;
}

const NO_PAYMENTS_SENTENCE = "No recopilamos datos de tarjetas ni de medios de pago: hoy la plataforma no tiene un sistema de pago.";
const ADDRESS_HISTORY_MARKER = " Versión 1.5 (17 de noviembre de 2026):";

/** Inserta una nota de historial antes del cambio de domicilio, para conservar el orden de versiones. */
function insertHistoryNote(block: string, note: string): string {
  const at = block.indexOf(ADDRESS_HISTORY_MARKER);
  if (at === -1) return `${block}${note}`;
  return `${block.slice(0, at)}${note}${block.slice(at)}`;
}

/** Pago de fletes con Mercado Pago (PAYMENTS_FEATURE_ENABLED=true): corrige las frases sobre pagos y agrega una sección. */
function withPayments(sections: PolicySection[]): PolicySection[] {
  const number = sections.length + 1;
  const mapped = sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block): PolicyBlock => {
      if (typeof block === "string") {
        if (block.startsWith(NO_PAYMENTS_SENTENCE)) {
          return block.replace(
            NO_PAYMENTS_SENTENCE,
            `No recopilamos ni guardamos datos de tarjetas: el pago del flete se hace en Mercado Pago, que procesa esos datos. Sí guardamos los datos del pago del flete descritos en la sección ${number}.`,
          );
        }
        if (block.startsWith("Historial:")) {
          const note = ` Versión 1.4 (11 de noviembre de 2026): pago de fletes con Mercado Pago (datos del pago, cuenta Mercado Pago del transportista y comprobantes de entrega) en la sección ${number}; versión borrador sujeta a revisión legal.`;
          return `${insertHistoryNote(block, note)} Versión 1.7 (17 de noviembre de 2026): se mantiene el pago de fletes y queda eliminado el domicilio de calle; la operación es solo en línea, en Chile.`;
        }
        return block;
      }
      if (section.id === "proveedores" && "list" in block && !block.list.some((item) => item.startsWith("Pagos:"))) {
        return {
          list: [
            ...block.list,
            `Pagos: Mercado Pago (MercadoLibre Chile Ltda. y sus empresas relacionadas) procesa el pago del flete y los datos del medio de pago del mandante, y acredita el dinero en la cuenta Mercado Pago del transportista. Le comunicamos los datos necesarios para cada cobro (monto, referencia del flete y del pago). Puede tratarlos fuera de Chile según sus propias políticas. El detalle está en la sección ${number}.`,
          ],
        };
      }
      return block;
    }),
  }));
  return mapped.concat({
    id: "pagos",
    title: `${number}. Pago de fletes con Mercado Pago`,
    blocks: [
      "Versión borrador sujeta a revisión legal. Esta sección aplica cuando el mandante y el transportista usan el pago de fletes de la plataforma.",
      ...(paymentsComingSoon() ? [PAYMENTS_COMING_SOON_NOTE] : []),
      {
        list: [
          "Qué datos tratamos: el monto del flete y de cada cuota (anticipo y saldo), el estado del pago y los identificadores que informa Mercado Pago (pago, preferencia, orden), los reembolsos, reclamos y contracargos, y los comprobantes de entrega (POD: fotos del documento de recepción y firma de quien recibió).",
          "Del transportista: el identificador de su cuenta Mercado Pago, la autorización (token) que Mercado Pago nos entrega al conectarla, guardada cifrada, su vigencia y su declaración de que puede emitir factura o boleta.",
          "No tratamos ni guardamos el número, vencimiento ni código de seguridad de la tarjeta: los ingresa el mandante directamente en Mercado Pago.",
          "Para qué: cobrar el flete por cuenta del transportista, mostrar el estado a las partes, revisar reclamos, ejecutar reembolsos, prevenir fraudes, conciliar y cumplir obligaciones legales y contables.",
          "Con quién: con Mercado Pago, para procesar cada pago, y entre el mandante y el transportista del mismo flete. Los comprobantes de entrega solo los ven esas dos partes y los administradores de Carga360go.",
          "Cuánto tiempo: mientras el flete esté activo y después por el plazo que exijan las normas tributarias y contables o para atender reclamos (plazo exacto pendiente de confirmación con asesoría legal y contable).",
          `El detalle del funcionamiento de los pagos está en la Política de Pagos: ${SITE}/politica-de-pagos.`,
        ],
      },
    ],
  });
}

function kycPolicySections(): PolicySection[] {
  if (!kycEnabled()) return POLICY_SECTIONS;
  return POLICY_SECTIONS.map((section) => {
    if (section.id === "definiciones") {
      return {
        ...section,
        blocks: section.blocks.map((block) => {
          if (typeof block !== "object" || !("list" in block)) return block;
          return {
            list: block.list.map((item) =>
              item.startsWith("Datos sensibles:")
                ? "Datos sensibles: los que se refieren a características físicas o morales, salud, origen, ideología, vida sexual, datos biométricos u otros de la esfera íntima. En la verificación de identidad tratamos datos biométricos (imagen del rostro y su comparación con la foto de la cédula) con tu consentimiento expreso, en los términos de la sección 17."
                : item,
            ),
          };
        }),
      };
    }
    if (section.id === "proveedores") {
      return {
        ...section,
        blocks: section.blocks.map((block) => {
          if (typeof block !== "object" || !("list" in block)) return block;
          const list = block.list.map((item) =>
            item.startsWith("WhatsApp (próximamente):")
              ? "WhatsApp: el número de Carga360go y los mensajes que nos envías (por ejemplo, el código para confirmar tu teléfono) son tratados también por Meta Platforms (WhatsApp), que puede procesarlos fuera de Chile."
              : item,
          );
          if (!list.some((item) => item.includes("Didit"))) {
            list.push(
              "Verificación de identidad: Didit Identity Technologies S.L. (Barcelona, España) trata las imágenes de tu cédula y de tu rostro por nuestra cuenta, en servidores de la Unión Europea (Irlanda). El detalle está en la sección 17.",
            );
          }
          return { list };
        }),
      };
    }
    if (section.id === "cambios") {
      return {
        ...section,
        blocks: section.blocks.map((block) =>
          typeof block === "string" && block.startsWith("Historial:")
            ? `${insertHistoryNote(
                block,
                " Versión 1.3 (11 de noviembre de 2026): verificación de identidad con cédula y reconocimiento facial (datos biométricos) a cargo de Didit; no se consulta el Registro Civil; plazos de conservación de imágenes (30 días) y del resultado (hasta 12 meses tras el cierre de la cuenta) propuestos, pendientes de confirmación.",
              )} Versión 1.6 (17 de noviembre de 2026): se mantiene la verificación de identidad y queda eliminado el domicilio de calle; la operación es solo en línea, en Chile.`
            : block,
        ),
      };
    }
    return section;
  }).concat(KYC_POLICY_SECTION);
}
