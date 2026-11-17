import { CAMPAIGN_PROMISE, CAMPAIGN_TEXT } from "./campaign";
import { BRAND } from "./catalog";
import type { PolicySection } from "./privacy-policy";
import { PAYMENTS_COMING_SOON_NOTE, paymentsComingSoon, paymentsLegalPublished, paymentRules } from "./pagos/config";
import { TERMS_UPDATED, TERMS_VERSION, termsUpdated, termsVersion } from "./privacy";

/**
 * Texto único de los Términos de uso. Lo usan la página /terminos, el aviso de aceptación y el generador del PDF/DOCX
 * (scripts/export-legal-docs.py). Si cambias el contenido, sube TERMS_VERSION en src/lib/privacy.ts.
 */
const SITE = "https://carga360go.cl";
const RAZON = "CARGA360 GO SpA";

export const TERMS_META = {
  title: "Términos de uso de Carga360go",
  version: TERMS_VERSION,
  updated: TERMS_UPDATED,
  site: SITE,
  path: "/terminos",
};

/** Metadatos vigentes según el flag de pagos. */
export function termsMeta() {
  return { ...TERMS_META, version: termsVersion(), updated: termsUpdated() };
}

export const TERMS_INTRO: string[] = [
  `Carga360go es una plataforma de ${RAZON} (también escrita ${BRAND.company}), RUT ${BRAND.rut}, que opera solo en línea en Chile. Contacto: ${BRAND.email} · WhatsApp ${BRAND.whatsappDisplay}.`,
  "Al marcar la casilla «He leído y acepto los Términos de uso» al crear tu cuenta, o al aceptarlos cuando te los presentemos al ingresar, declaras haberlos leído y aceptas estas condiciones. Si no estás de acuerdo, no uses la plataforma.",
];

export const TERMS_SECTIONS: PolicySection[] = [
  {
    id: "que-es",
    title: "1. Qué es Carga360go",
    blocks: [
      "Carga360go es un espacio de publicación que conecta a transportistas con mandantes y empresas que necesitan transportar carga general o carga masiva dentro de Chile, de Arica a Punta Arenas. La plataforma muestra avisos de carga y de camiones disponibles y sugiere coincidencias según equipo, capacidad, ruta y fechas.",
    ],
  },
  {
    id: "rol",
    title: "2. Rol de la plataforma",
    blocks: [
      `${BRAND.company} no es transportista ni mandante, no fija tarifas, no cobra ni administra el pago del flete y no garantiza la ejecución del transporte. El acuerdo, el precio, los seguros, la documentación tributaria y la responsabilidad por la carga son materia exclusiva entre las partes. Los precios sugeridos que muestra la plataforma son rangos referenciales calculados con una distancia estimada y una tarifa por kilómetro según el equipo; no son una cotización ni una tarifa fijada por ${BRAND.company}.`,
    ],
  },
  {
    id: "membresia",
    title: "3. Campaña de inscripción, periodo gratis y futura membresía",
    blocks: [
      CAMPAIGN_TEXT,
      {
        list: [
          "El periodo gratis es por cuenta: cada mandante, empresa con carga o transportista tiene 30 días corridos gratis contados desde la fecha de su inscripción. La fecha exacta de término aparece en el panel de cada cuenta («Tu periodo gratis termina el …»).",
          "Las cuentas que ya estaban inscritas cuando comenzó esta campaña y cuyo plazo de 30 días ya había pasado reciben 30 días gratis desde la fecha de publicación de estos términos.",
          "Terminado el periodo gratis se cobrará una membresía tanto a las empresas con carga (mandantes) como a los transportistas inscritos. Sus valores aún no están definidos; se publicarán antes de comenzar a cobrar.",
          "La membresía incluirá beneficios dentro de la plataforma y beneficios a través de convenios con terceros, que informaremos junto con sus valores.",
          `${CAMPAIGN_PROMISE} Hoy la plataforma no tiene un sistema de pago ni guarda datos de tarjetas.`,
          "Si no aceptas la membresía cuando se te ofrezca, no se te cobrará nada y podrás pedir el cierre de tu cuenta.",
          `Durante el periodo gratis ${BRAND.company} no cobra comisión por el flete ni por publicar, ofertar o adjudicar.`,
        ],
      },
    ],
  },
  {
    id: "cuentas",
    title: "4. Cuentas y acreditación",
    blocks: [
      "Cada usuario debe registrar datos verdaderos (razón social o nombre, RUT, contacto y región). Solo las cuentas 100% acreditadas pueden publicar cargas o camiones, ofertar y recibir contactos: Política de Privacidad y Términos de uso aceptados, correo confirmado, requisitos de calidad, seguridad y medio ambiente revisados y aprobación de un administrador; los transportistas además confirman su teléfono y mantienen aprobados y vigentes sus documentos.",
      "Un administrador puede aprobar, rechazar o suspender cuentas cuando la información sea incompleta, falsa o esté vencida. La acreditación es una revisión documental y no reemplaza la verificación que cada parte deba hacer antes de contratar.",
    ],
  },
  {
    id: "publicaciones",
    title: "5. Publicaciones",
    blocks: [
      "Quien publica es responsable de que la información sea exacta y esté vigente, y de que la carga y el transporte cumplan la normativa aplicable (pesos y dimensiones, carga peligrosa, permisos y seguros). Podemos retirar avisos que sean engañosos, duplicados o contrarios a la ley.",
    ],
  },
  {
    id: "contactos",
    title: "6. Uso de datos de contacto",
    blocks: [
      "Los datos de contacto se comparten solo entre el mandante y el transportista elegido cuando se adjudica una oferta, y solo pueden usarse para coordinar ese transporte. No está permitido incluir teléfonos, correos o enlaces en los textos de las publicaciones u ofertas para saltarse esta regla (la plataforma los oculta), copiarlos de forma masiva ni usarlos para publicidad no solicitada.",
    ],
  },
  {
    id: "alertas",
    title: "7. Alertas por correo",
    blocks: [
      "Cuando se publica una carga o un camión que calza con tus publicaciones o con una búsqueda que guardaste, podemos enviarte un correo con un máximo de 6 avisos al día. Cada correo incluye un enlace para dejar de recibirlos y puedes pausarlos desde tu panel.",
    ],
  },
  {
    id: "ofertas",
    title: "8. Solicitudes de transporte y ofertas",
    blocks: [
      "Quien publica una carga puede recibir ofertas de transportistas 100% acreditados hasta el plazo que indique, y elegir libremente una de ellas o ninguna. Una oferta es una propuesta del transportista; el acuerdo final, el pago y la ejecución del transporte son entre las partes.",
    ],
  },
  {
    id: "seguridad",
    title: "9. Seguridad y uso indebido",
    blocks: [
      "Está prohibido suplantar a otra persona o empresa, registrar RUT ajenos, subir documentos falsos o alterados, usar la plataforma con fines fraudulentos o intentar vulnerar su seguridad. Podemos suspender cuentas y conservar los registros necesarios para informar a las autoridades.",
    ],
  },
  {
    id: "privacidad",
    title: "10. Datos personales",
    blocks: [
      `El tratamiento de datos personales se rige por la Política de Privacidad publicada en ${SITE}/privacidad, que forma parte de estos términos.`,
    ],
  },
  {
    id: "cambios",
    title: "11. Cambios a estos términos",
    blocks: [
      `Podemos actualizar estos términos por cambios legales o del servicio. Publicaremos la nueva versión en ${SITE}/terminos con su fecha y número de versión, te avisaremos y te pediremos aceptarla al ingresar. Guardamos qué versión aceptó cada usuario y cuándo.`,
      "Historial: versión 1.0 (10 de noviembre de 2026): términos versionados con aceptación obligatoria, acreditación 100% y campaña de inscripción con 30 días gratis por cuenta. Versión 1.2 (17 de noviembre de 2026): se elimina el domicilio de calle. Carga360go opera solo en línea, en Chile; consultas y reclamos por correo y WhatsApp.",
    ],
  },
  {
    id: "ley",
    title: "12. Ley aplicable y contacto",
    blocks: [
      `Estos términos se rigen por las leyes de la República de Chile. Consultas y reclamos: ${BRAND.email} o WhatsApp ${BRAND.whatsappDisplay}.`,
    ],
  },
];

/* ------------------------------------------------------------------ pagos (PAYMENTS_FEATURE_ENABLED) */

const PAY_POLICY = `${SITE}/politica-de-pagos`;

function paymentsSection(): PolicySection {
  const rules = paymentRules();
  const fee = (rules.feeRateEstimate * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  return {
    id: "pagos",
    title: "13. Pago de fletes con Mercado Pago",
    blocks: [
      "Versión borrador sujeta a revisión legal: esta sección describe el pago de fletes que está en prueba y puede cambiar antes de habilitarse para todo el público.",
      ...(paymentsComingSoon() ? [PAYMENTS_COMING_SOON_NOTE] : []),
      {
        list: [
          `El mandante paga el flete a través de Mercado Pago (Checkout Pro, modalidad marketplace o split). El dinero se acredita directamente en la cuenta Mercado Pago del transportista. ${BRAND.company} no recibe, no capta ni custodia el dinero del flete.`,
          "Los datos de la tarjeta o del medio de pago los ingresa el mandante en Mercado Pago y los procesa Mercado Pago. Carga360go no los ve ni los guarda.",
          "Para cobrar en la plataforma, el transportista conecta su propia cuenta Mercado Pago y declara que puede emitir factura o boleta por el flete. El transportista factura el flete al mandante.",
          `El flete se paga en dos cuotas: anticipo del ${rules.anticipoPercent} % al adjudicar y saldo del ${100 - rules.anticipoPercent} % después de que el transportista sube el comprobante de entrega (POD).`,
          `La comisión de Mercado Pago la paga el mandante: el total de cada cuota se recarga con un estimado (hoy ${fee} % más IVA) para que el transportista reciba la cuota pactada. El costo final lo determina Mercado Pago según el medio y el plazo elegidos.`,
          rules.marketplaceFeeAmount === 0
            ? `${BRAND.company} no cobra comisión por el flete por ahora (comisión de la plataforma: $0). Si eso cambia, se informará antes y no se aplicará a fletes cuyo pago ya fue creado.`
            : `${BRAND.company} cobra una comisión fija por flete informada antes de pagar.`,
          `Mandante y transportista pueden abrir un reclamo mientras el flete está en tránsito o dentro de las ${rules.disputeWindowBusinessHours} horas hábiles (lunes a viernes, sin feriados de Chile, hora de Chile) siguientes a la entrega del POD. Con un reclamo abierto el flete no se da por cerrado y un administrador lo revisa.`,
          "El mandante puede cancelar el pago del flete en la plataforma antes de pagar el anticipo (no si el pago del anticipo está aprobado o pendiente en Mercado Pago).",
          "Los reembolsos se hacen desde la cuenta Mercado Pago del transportista, los solicita un administrador según la Política de Pagos y dependen de que esa cuenta tenga saldo. Carga360go no cubre con fondos propios reembolsos ni contracargos.",
        ],
      },
      `El detalle está en la Política de Pagos publicada en ${PAY_POLICY}, que forma parte de estos términos.`,
    ],
  };
}

/** Términos vigentes: con el flag de pagos se corrigen las frases sobre pagos y se agrega la sección 13. */
export function termsSections(): PolicySection[] {
  if (!paymentsLegalPublished()) return TERMS_SECTIONS;
  const fix = (text: string) =>
    text
      .replace("no fija tarifas, no cobra ni administra el pago del flete y no garantiza", "no fija tarifas, no recibe ni custodia el dinero del flete (el pago se hace por Mercado Pago directamente al transportista, ver sección 13) y no garantiza")
      .replace(" Hoy la plataforma no tiene un sistema de pago ni guarda datos de tarjetas.", " El pago del flete se hace con Mercado Pago (sección 13); Carga360go no guarda datos de tarjetas.")
      .replace("el acuerdo final, el pago y la ejecución del transporte son entre las partes.", "el acuerdo final y la ejecución del transporte son entre las partes. El pago puede hacerse en la plataforma con Mercado Pago, según la sección 13.");
  const sections = TERMS_SECTIONS.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      if (typeof block === "string") {
        if (block.startsWith("Historial:")) {
          const note =
            " Versión 1.1 (11 de noviembre de 2026): pago de fletes con Mercado Pago directo al transportista, cuotas de anticipo y saldo, comisión de Mercado Pago a cargo del mandante, comisión de la plataforma $0, reclamos en horas hábiles y Política de Pagos (borrador sujeto a revisión legal).";
          const marker = " Versión 1.2 (17 de noviembre de 2026):";
          const at = block.indexOf(marker);
          const withNote = at === -1 ? `${block}${note}` : `${block.slice(0, at)}${note}${block.slice(at)}`;
          return `${withNote} Versión 1.3 (17 de noviembre de 2026): se mantiene el pago de fletes y queda eliminado el domicilio de calle; la operación es solo en línea, en Chile.`;
        }
        return fix(block);
      }
      if ("list" in block) return { list: block.list.map(fix) };
      return block;
    }),
  }));
  return [...sections, paymentsSection()];
}
