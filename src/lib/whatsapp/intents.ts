import { COST_EXPLANATION } from "../agent/cost-copy";
import { BRAND, EQUIPMENT } from "../catalog";

const SITE = "https://carga360go.cl";

export const LINKS = {
  home: SITE,
  publicar: `${SITE}/cargas/nueva`,
  publicarCamion: `${SITE}/camiones/nuevo`,
  registro: `${SITE}/registro`,
  cargas: `${SITE}/cargas`,
  camiones: `${SITE}/camiones`,
  regiones: `${SITE}/regiones`,
  terminos: `${SITE}/terminos`,
  privacidad: `${SITE}/privacidad`,
  ingreso: `${SITE}/ingreso`,
};

export type Intent =
  | "humano"
  | "reclamo"
  | "pago"
  | "legal"
  | "saludo"
  | "publicar_carga"
  | "publicar_camion"
  | "registro_transportista"
  | "documentos_rechazo"
  | "documentos"
  | "precio"
  | "regiones"
  | "tipos_camion"
  | "seguimiento_carga"
  | "buscar_carga"
  | "buscar_camion"
  | "estado_cuenta"
  | "contacto"
  | "gracias"
  | "desconocido";

/** Intenciones que siempre pasan a una persona, con o sin IA. */
export const HANDOFF_INTENTS: Intent[] = ["humano", "reclamo", "pago", "legal"];

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ/¾ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RULES: { intent: Intent; re: RegExp }[] = [
  { intent: "humano", re: /\b(humano|persona|ejecutiv[oa]|asesor|operador[a]?|alguien real|hablar con (alguien|ustedes|usted)|llamen|llamame|llamar|atencion personal|agente)\b/ },
  { intent: "reclamo", re: /\b(reclamo|reclamar|queja|estafa|fraude|denuncia|mal servicio|robo|robaron|perdieron|danad[oa]|siniestro|accidente|no me pagaron)\b/ },
  { intent: "legal", re: /\b(abogado|demanda|legal|juicio|tribunal|contrato|sernac|carta notarial)\b/ },
  { intent: "pago", re: /\b(pago|pagar|transferencia|factura|facturar|boleta|cobro|cobraron|reembolso|devolucion|deposito|cuenta bancaria|comision)\b/ },
  { intent: "gracias", re: /^(gracias|muchas gracias|ok gracias|vale gracias|perfecto gracias|listo gracias|chao|adios|saludos)\b/ },
  { intent: "precio", re: /\b(cuanto cuesta|cuanto vale|costo|precios?|tarifas?|cobran|gratis|gratuito|plan(es)?|suscripcion|mensualidad)\b/ },
  // Seguimiento / ubicación: antes de contacto ("donde") y de buscar_carga ("carga").
  {
    intent: "seguimiento_carga",
    re: /\b(donde (esta|anda|va)|ubicacion|seguimiento|gps|tracking|en tiempo real|localizar|localizacion)\b.{0,40}\b(mi )?carga|\b(mi )?carga\b.{0,40}\b(donde|ubicacion|seguimiento|gps|tracking)\b|\b(seguimiento|gps|ubicacion en tiempo real|estado de (mi )?viaje|donde va (mi )?(camion|carga))\b/,
  },
  // Rechazo de documentos: antes de "documentos" genérico y de estado_cuenta.
  {
    intent: "documentos_rechazo",
    re: /\b(por que|porque).{0,30}\b(rechaz|no (me )?aprob)|\b(rechaz(aron|ado|ada|aron|aste)|no (me )?aprobaron|observacion(es)? de revision).{0,40}\b(documento|documentos|papeles)|\b(documento|documentos|papeles).{0,40}\b(rechaz|observacion|no (me )?aprob)/,
  },
  { intent: "documentos", re: /\b(documento|documentos|papeles|padron|revision tecnica|soap|permiso de circulacion|licencia|cedula|requisito|requisitos)\b/ },
  { intent: "estado_cuenta", re: /\b(aprob|validar mi cuenta|mi cuenta|en revision|verificacion|verificar|codigo|no puedo ver|contacto oculto|bloquead)\b/ },
  { intent: "publicar_carga", re: /\b(necesito (un |una )?(transportista|camion|camionero)|busco (un )?transportista)\b/ },
  { intent: "publicar_camion", re: /\b(public(ar|o) (mi )?(camion|disponibilidad|flota)|ofrecer (mi )?camion|tengo (un )?camion|camion disponible|retorno|vuelvo vacio|viaje de vuelta|flete de retorno)\b/ },
  // Buscar cargas (incl. "soy transportista y busco…"): antes de registro_transportista y de tipos_camion ("camion").
  {
    intent: "buscar_carga",
    re: /\b((soy )?transportista|camionero)\b.{0,60}\b(busco|buscar|ver|consultar)\b.{0,25}\bcargas?\b|\b(busco|buscar|ver|consultar)\b.{0,25}\bcargas?\b|\b(cargas disponibles|hay cargas|ver cargas)\b/,
  },
  { intent: "registro_transportista", re: /\b(registr|inscrib|crear cuenta|soy transportista|soy camionero|transportista|unirme|trabajar con ustedes)\b/ },
  { intent: "publicar_carga", re: /\b(soy empresa( con carga)?|empresa con carga|soy mandante)\b/ },
  { intent: "publicar_carga", re: /\b(public(ar|o|a)|necesito (un )?(camion|transporte|flete)|necesito mover|mover (una )?carga|tengo (una )?carga|cotizar|cotizacion|flete|enviar carga|trasladar)\b/ },
  { intent: "tipos_camion", re: /\b(tipo(s)? de camion|cama baja|rampla|batea|tolva|frigorifico|refrigerado|3 ?\/ ?4|tres cuartos|plano|sobredimensionad|sider|furgon|estanque|portacontenedor|ninera|camion(es)?)\b/ },
  { intent: "regiones", re: /\b(region|regiones|arica|iquique|antofagasta|calama|copiapo|la serena|coquimbo|valparaiso|santiago|rancagua|talca|chillan|concepcion|temuco|valdivia|puerto montt|osorno|coyhaique|punta arenas|norte|sur|todo chile|a nivel nacional)\b/ },
  { intent: "buscar_carga", re: /\b(cargas disponibles|hay cargas|busco carga|buscar carga|ver cargas|cargas)\b/ },
  { intent: "buscar_camion", re: /\b(camiones disponibles|hay camiones|busco camion|ver camiones)\b/ },
  { intent: "contacto", re: /\b(correo|email|mail|telefono|direccion|donde estan|oficina|contacto)\b/ },
  { intent: "saludo", re: /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|alo|hey|info|informacion|consulta)\b/ },
];

export function detectIntent(text: string): Intent {
  const t = normalize(text);
  if (!t) return "desconocido";
  for (const rule of RULES) if (rule.re.test(t)) return rule.intent;
  return "desconocido";
}

export type LiveContext = {
  activeLoads: number;
  activeTrucks: number;
  recentLoads: string[];
  recentTrucks: string[];
};

const MENU = [
  "1️⃣ Publicar una carga",
  "2️⃣ Registrarme como transportista",
  "3️⃣ Ver cargas o camiones disponibles",
  "4️⃣ Documentos que se piden",
  "5️⃣ Hablar con una persona",
].join("\n");

function truckTypes(): string {
  return EQUIPMENT.map((item) => item.label).join(", ");
}

function listOrEmpty(items: string[], empty: string): string {
  return items.length ? items.map((line) => `• ${line}`).join("\n") : empty;
}

/** Atajos del menú numérico. */
export function menuChoice(text: string): Intent | null {
  const t = normalize(text);
  if (t === "1") return "publicar_carga";
  if (t === "2") return "registro_transportista";
  if (t === "3") return "buscar_carga";
  if (t === "4") return "documentos";
  if (t === "5") return "humano";
  return null;
}

export const HANDOFF_REPLY =
  "Entendido 🙌 Le paso su mensaje a una persona del equipo de Carga 360 Go y le respondemos por aquí a la brevedad. " +
  `Si es urgente, también puede escribir a ${BRAND.email}.`;

export const WEB_HANDOFF_REPLY =
  "Entendido 🙌 Le paso su mensaje a una persona del equipo de Carga 360 Go y le responderemos a la brevedad. " +
  `También puede usar el botón de WhatsApp (pide su nombre y celular antes de abrir la conversación) o escribir a ${BRAND.email}.`;

export const WEB_GREETING =
  "¡Hola! 👋 Soy el asistente virtual de Carga 360 Go. " +
  "Conectamos empresas que necesitan mover carga con transportistas verificados, de Arica a Punta Arenas.\n\n" +
  "¿En qué le ayudo? Puede usar los botones de abajo o escribir su consulta.";

/**
 * Petición de contacto de respaldo mientras la verificación (correo, teléfono o documentos) está pendiente.
 * El bot no recibe el dato por el chat (no pedimos datos personales por aquí): lo guarda la persona en su panel.
 * Punto de integración para el flujo conversacional del bot: ver docs/VERIFICACION-RESPALDO.md.
 */
export const BACKUP_CONTACT_ASK =
  "Si todavía no termina de verificar su correo, su teléfono o sus documentos, deje un teléfono o correo de respaldo (distinto del principal) " +
  `en su panel, sección "Contacto de respaldo": ${LINKS.home}/panel. Así podemos ubicarle si no alcanza a terminar la inscripción.`;

/** Respuesta del motor de reglas. Siempre breve, en español de Chile y con enlace. */
export type ReplyChannel = "whatsapp" | "web";

export function ruleReply(intent: Intent, live: LiveContext, channel: ReplyChannel = "whatsapp"): string {
  const handoffText = channel === "web" ? WEB_HANDOFF_REPLY : HANDOFF_REPLY;
  switch (intent) {
    case "humano":
    case "reclamo":
    case "pago":
    case "legal":
      return handoffText;
    case "saludo":
    case "desconocido":
      if (channel === "web") {
        return (intent === "saludo" ? WEB_GREETING : "No le entendí bien 🙈 " + WEB_GREETING);
      }
      return (
        (intent === "saludo" ? "¡Hola! 👋 Soy el asistente virtual de Carga 360 Go. " : "No le entendí bien 🙈 ") +
        "Conectamos empresas que necesitan mover carga con transportistas verificados, de Arica a Punta Arenas.\n\n" +
        `¿En qué le ayudo? Responda con un número:\n${MENU}`
      );
    case "publicar_carga":
      return (
        "Para publicar su carga 🚚\n" +
        "1. Cree su cuenta de empresa (1 minuto, con su RUT).\n" +
        "2. Indique origen, destino, fecha, tipo de camión y peso.\n" +
        "3. Avisamos a los transportistas con camiones compatibles y ellos lo contactan.\n\n" +
        `Publique aquí: ${LINKS.publicar}`
      );
    case "publicar_camion":
      return (
        "¡Bien! Puede publicar su camión disponible o su viaje de retorno para no volver vacío 🔁\n" +
        `Publíquelo en ${LINKS.publicarCamion} (necesita su cuenta de transportista aprobada).\n` +
        `Si aún no tiene cuenta, regístrese en ${LINKS.registro}`
      );
    case "registro_transportista":
      return (
        "Para sumarse como transportista:\n" +
        `1. Regístrese en ${LINKS.registro}\n` +
        "2. Verifique su correo y su celular.\n" +
        "3. Suba sus 6 documentos: cédula de identidad, licencia profesional, padrón, revisión técnica, SOAP y permiso de circulación.\n" +
        "4. Nuestro equipo los revisa y aprueba su cuenta. Desde ahí ve los datos de contacto de las cargas ✅\n\n" +
        BACKUP_CONTACT_ASK
      );
    case "documentos_rechazo":
      return (
        "Si le rechazaron un documento, el motivo concreto está en la observación de revisión de su panel (hay que iniciar sesión para verlo). " +
        "Desde el chat no inventamos ni adelantamos ese detalle, y no pedimos cédula, RUT ni archivos por aquí.\n" +
        `Entre a su panel: ${LINKS.ingreso}\n` +
        `Si necesita ayuda, escriba a ${BRAND.email}.`
      );
    case "documentos":
      return (
        "Los transportistas suben 6 documentos vigentes 📄\n" +
        "• Cédula de identidad\n• Licencia profesional\n• Padrón del camión\n• Revisión técnica\n• SOAP\n• Permiso de circulación\n\n" +
        `Se suben desde su panel después de registrarse: ${LINKS.registro}. El equipo los revisa antes de aprobar la cuenta.`
      );
    case "precio":
      return (
        `${COST_EXPLANATION} ` +
        "El transportista ve un costo aproximado del viaje y el cliente ve el costo de referencia desglosado del envío. " +
        "Este chat no entrega cifras. Si quiere una cotización de un envío, indique origen, destino y tipo de camión, o use la calculadora.\n" +
        `${LINKS.home}/herramientas/calculadora`
      );
    case "regiones":
      return (
        "Operamos en todo Chile, de Arica y Parinacota a Magallanes 🇨🇱\n" +
        `Al publicar o buscar puede elegir la región de origen y destino. Vea la actividad por región aquí: ${LINKS.regiones}`
      );
    case "tipos_camion":
      return `Tenemos estos tipos de camión 🚛: ${truckTypes()}. También cargas sobredimensionadas en cama baja.\nElija el tipo al publicar o filtre en ${LINKS.camiones}`;
    case "seguimiento_carga":
      return (
        "Este chat no consulta su transporte ni la ubicación de una carga en tiempo real, y no ofrecemos GPS ni estados de viaje por aquí.\n" +
        `Para ver lo que hay en su cuenta, entre al panel: ${LINKS.ingreso}\n` +
        `Si necesita orientación, escríbanos a ${BRAND.email}.`
      );
    case "buscar_carga":
      return (
        `Puede consultar las publicaciones de cargas aquí: ${LINKS.cargas}\n` +
        "Ahí ve origen, destino y requisitos de cada aviso. Para ofertar debe cumplir los requisitos de su cuenta (cuenta aprobada y lo que pida cada carga).\n" +
        "Por este chat no mostramos teléfonos, correos ni WhatsApp de otros usuarios."
      );
    case "buscar_camion":
      return (
        `Hoy hay ${live.activeTrucks} camión(es) disponible(s) 🚚\n` +
        listOrEmpty(live.recentTrucks, "Todavía no hay camiones publicados.") +
        `\n\nVea todos: ${LINKS.camiones}\nO publique su carga y le avisamos a los compatibles: ${LINKS.publicar}`
      );
    case "estado_cuenta":
      return (
        "La aprobación de cuentas de transportista la hace nuestro equipo después de revisar sus documentos. " +
        `Puede ver qué le falta entrando a ${LINKS.ingreso}. Si lleva tiempo esperando, escriba "persona" y le ayudamos.\n\n` +
        BACKUP_CONTACT_ASK
      );
    case "contacto":
      return `Puede escribirnos por aquí o a ${BRAND.email} ✉️\nSitio: ${LINKS.home}\n${BRAND.company}, RUT ${BRAND.rut}.`;
    case "gracias":
      return "¡A usted! 🙌 Cualquier cosa, escríbanos por aquí. Buen viaje 🚛";
    default: {
      const _exhaustive: never = intent;
      void _exhaustive;
      return "No le entendí bien 🙈 ¿Me lo puede decir de otra forma?";
    }
  }
}

export const NON_TEXT_REPLY =
  "Por ahora solo puedo leer mensajes de texto 🙏 ¿Me escribe su consulta? Si prefiere hablar con una persona, escriba *persona*.";
