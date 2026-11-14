export type LandingCta = { href: string; label: string };

export type SeoLandingContent = {
  slug: string;
  titleTag: string;
  meta: string;
  h1: string;
  body: string[];
  ctas: LandingCta[];
};

/** Seis landings con URL limpia. Sin cifras, logotipos ni testimonios inventados. */
export const SEO_LANDINGS: SeoLandingContent[] = [
  {
    slug: "/transporte-minero-chile",
    titleTag: "Transporte minero en Chile | Carga360go",
    meta: "Publica o encuentra transporte para faenas y proveedores mineros en Chile: cargas, retornos y equipos aptos. Conexión directa, sin comisión por el flete.",
    h1: "Transporte minero en Chile: carga, retornos y equipos aptos",
    body: [
      "Carga360go conecta a empresas generadoras —contratistas, proveedores y faenas— con transportistas que publican camiones y retornos en Chile. El foco de esta página es el transporte ligado a la minería: carga general o masiva hacia y desde zonas de operación, equipos compatibles y viajes de vuelta.",
      "Puedes publicar una carga con origen, destino, fecha, peso, tipo de equipo y medidas, o publicar tus camiones y corredores libres. El sistema sugiere coincidencias según esos datos. El acuerdo, el precio y el pago del flete los cierran las partes; Carga360go no es transportista, no cobra comisión por el flete y no garantiza la ejecución del viaje.",
      "Hoy priorizamos corredores piloto en el norte: Calama–Antofagasta, Calama–Copiapó y Antofagasta–Copiapó. La cobertura del sitio es nacional, de Arica a Punta Arenas, y se publica solo actividad real y vigente.",
    ],
    ctas: [
      { href: "/cargas/nueva", label: "Soy empresa: publica una carga" },
      { href: "/cargas", label: "Soy transportista: encuentra cargas" },
      { href: "/camiones/nuevo", label: "Publica tu retorno" },
    ],
  },
  {
    slug: "/cama-baja-y-maquinaria",
    titleTag: "Camiones cama baja y maquinaria pesada | Carga360go",
    meta: "Encuentra o publica cama baja, ramplas y transporte de maquinaria pesada en Chile. Indica ejes, ancho y medidas antes de coordinar el viaje.",
    h1: "Cama baja y transporte de maquinaria pesada",
    body: [
      "Mover maquinaria, equipos sobredimensionados o carga de gran peso exige un equipo compatible, no cualquier camión. En Carga360go la ficha de cama baja pide los datos que importan: ejes, ancho, capacidad y medidas de la carga, para sugerir coincidencias útiles y no solo un listado genérico.",
      "Si eres empresa, publica la carga con largo, ancho, alto, peso y fecha de retiro. Si eres transportista, publica tu cama baja o rampla con su ficha técnica y tus corredores disponibles. La coincidencia es una recomendación automática: no reemplaza permisos especiales, escoltas ni la revisión que cada parte debe hacer antes de contratar.",
      "Este servicio sirve a construcción, industria, energía, agro y minería. El contacto se entrega solo cuando el mandante elige una oferta. El flete se acuerda y se paga en directo, sin comisión de la plataforma.",
    ],
    ctas: [
      { href: "/cargas?equipo=cama_baja", label: "Buscar cargas que pidan cama baja" },
      { href: "/camiones/nuevo", label: "Publicar una cama baja" },
      { href: "/cargas/nueva", label: "Publicar transporte de maquinaria" },
    ],
  },
  {
    slug: "/cargas-de-retorno-mineras",
    titleTag: "Cargas de retorno mineras | Carga360go",
    meta: "Reduce viajes en vacío: publica tu retorno o encuentra cargas de vuelta en corredores mineros del norte de Chile. Alertas por correo cuando aparezca un calce.",
    h1: "Cargas de retorno mineras: aprovecha el viaje de vuelta",
    body: [
      "Un camión que ya cumplió un viaje hacia la faena o el puerto no tiene por qué volver vacío. Carga360go permite al transportista publicar su retorno —corredor, fechas libres y equipo— y al mandante publicar cargas que pueden aprovechar esa vuelta.",
      "El motor de coincidencias cruza origen, destino, ventana de fechas, tipo de equipo y capacidad. Si no hay un aviso hoy, puedes guardar una alerta y te avisamos por correo cuando aparezca uno compatible. Las alertas por WhatsApp se habilitarán solo con tu consentimiento, cuando esa función esté activa.",
      "Empezamos por los corredores piloto Calama–Antofagasta, Calama–Copiapó y Antofagasta–Copiapó, sin cerrar el resto del país. Carga360go no garantiza que exista retorno en cada fecha ni que una coincidencia se concrete: es una recomendación para que las partes coordinen.",
    ],
    ctas: [
      { href: "/camiones/nuevo", label: "Publicar mi retorno" },
      { href: "/cargas", label: "Buscar cargas en mi corredor" },
      { href: "/registro", label: "Crear cuenta y guardar alertas" },
    ],
  },
  {
    slug: "/transporte-calama",
    titleTag: "Transporte de carga en Calama | Carga360go",
    meta: "Cargas y camiones en Calama y los corredores hacia Antofagasta y Copiapó. Publica tu aviso o guarda una alerta en Carga360go.",
    h1: "Transporte de carga en Calama",
    body: [
      "Calama es un nodo del transporte ligado a la minería del norte. En Carga360go puedes publicar cargas con origen o destino en Calama, o un camión y un retorno disponibles en esa zona y en los corredores hacia Antofagasta y Copiapó.",
      "Filtra por equipo —rampla, tolva, cama baja, estanque u otro— y por fecha. Si no hay avisos vigentes, no te dejamos en un callejón sin salida: guarda una alerta o publica tú el aviso contrario (tu carga o tu camión).",
      "La plataforma opera en las 16 regiones, pero este corredor es uno de los tres pilotos para concentrar actividad real antes de escalar campañas. Solo se muestran publicaciones vigentes. El contacto se abre cuando se adjudica una oferta.",
    ],
    ctas: [
      { href: "/cargas?regionOrigen=antofagasta", label: "Ver cargas desde o hacia la Región de Antofagasta" },
      { href: "/registro", label: "Publicar carga o camión" },
      { href: "/cargas", label: "Soy transportista: encuentra cargas" },
    ],
  },
  {
    slug: "/transporte-antofagasta",
    titleTag: "Transporte de carga en Antofagasta | Carga360go",
    meta: "Publica o encuentra cargas y camiones en Antofagasta y sus corredores a Calama y Copiapó. Coincidencias por equipo, fecha y ruta.",
    h1: "Transporte de carga en Antofagasta",
    body: [
      "Antofagasta concentra carga industrial, portuaria y minera. Carga360go permite a empresas publicar transportes con origen o destino en la ciudad o la región, y a transportistas ofrecer camiones o retornos en esos corredores.",
      "Las coincidencias consideran equipo, capacidad, fechas y ruta. Un precio referencial puede aparecer como rango orientativo; no es una cotización de Carga360go. El valor final lo acuerdan las partes, y la plataforma no cobra ni retiene el flete.",
      "Este es uno de los corredores piloto, junto con Calama y Copiapó. Si hoy no hay resultados para tu filtro, guarda una alerta por correo y te avisamos cuando se publique un aviso compatible.",
    ],
    ctas: [
      { href: "/camiones", label: "Soy empresa: encuentra camiones" },
      { href: "/cargas", label: "Soy transportista: encuentra cargas" },
      { href: "/registro", label: "Crear cuenta, 30 días gratis" },
    ],
  },
  {
    slug: "/transporte-copiapo",
    titleTag: "Transporte de carga en Copiapó | Carga360go",
    meta: "Cargas y camiones en Copiapó y Atacama, con corredores a Calama y Antofagasta. Publica o activa una alerta si aún no hay avisos.",
    h1: "Transporte de carga en Copiapó",
    body: [
      "Copiapó y la Región de Atacama son parte del corredor piloto junto a Calama y Antofagasta. En Carga360go puedes publicar una carga, un camión o un retorno con origen o destino en Copiapó, y recibir sugerencias de calce por equipo, fechas y ruta.",
      "La plataforma es nacional, de Arica a Punta Arenas. Esta página existe para quien busca transporte concreto en Atacama, no solo para llegar a la portada. Los avisos que se muestran son reales y vigentes; si el listado está vacío, puedes guardar una alerta o publicar tú el primer aviso del corredor.",
      "«Verificado» en un perfil significa que se revisaron contacto y documentos según se explica en Cómo verificamos. No acredita solvencia, seguridad operacional ni el cumplimiento del viaje.",
    ],
    ctas: [
      { href: "/cargas?regionOrigen=atacama", label: "Ver cargas desde Atacama" },
      { href: "/camiones/nuevo", label: "Publicar un camión o retorno" },
      { href: "/como-verificamos", label: "Leer cómo verificamos" },
    ],
  },
];

export function landingBySlug(slug: string): SeoLandingContent | undefined {
  return SEO_LANDINGS.find((item) => item.slug === slug);
}

export const LANDING_SLUGS = SEO_LANDINGS.map((item) => item.slug);
