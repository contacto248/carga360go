import type { City, DocAudience, Region, Equipment, EquipmentId, SpecField, Specs } from "./types";

export const BRAND = {
  name: "Carga360go",
  company: "CARGA360GO SpA",
  rut: "78.553.352-6",
  whatsapp: "56958428693",
  whatsappDisplay: "+56 9 5842 8693",
  email: "contacto@carga360go.cl",
  address: "Colón 352, oficina 318, La Serena, Región de Coquimbo",
  manager: "Bastián Andrés Salas Moraleda",
  infoMessage: "Hola Carga 360 Go, quiero información",
  whatsappChannel: "https://whatsapp.com/channel/0029Vb8rA9T6xCSJPzzp1z2k",
};

/** Las 16 regiones de Chile, de norte a sur (Arica y Parinacota → Magallanes). */
export const REGIONS: Region[] = [
  { id: "arica-y-parinacota", numeral: "XV", name: "Arica y Parinacota", zone: "norte" },
  { id: "tarapaca", numeral: "I", name: "Tarapacá", zone: "norte" },
  { id: "antofagasta", numeral: "II", name: "Antofagasta", zone: "norte" },
  { id: "atacama", numeral: "III", name: "Atacama", zone: "norte" },
  { id: "coquimbo", numeral: "IV", name: "Coquimbo", zone: "norte" },
  { id: "valparaiso", numeral: "V", name: "Valparaíso", zone: "centro" },
  { id: "metropolitana", numeral: "RM", name: "Metropolitana de Santiago", zone: "centro" },
  { id: "ohiggins", numeral: "VI", name: "Libertador General Bernardo O'Higgins", zone: "centro" },
  { id: "maule", numeral: "VII", name: "Maule", zone: "centro" },
  { id: "nuble", numeral: "XVI", name: "Ñuble", zone: "centro" },
  { id: "biobio", numeral: "VIII", name: "Biobío", zone: "sur" },
  { id: "araucania", numeral: "IX", name: "La Araucanía", zone: "sur" },
  { id: "los-rios", numeral: "XIV", name: "Los Ríos", zone: "sur" },
  { id: "los-lagos", numeral: "X", name: "Los Lagos", zone: "sur" },
  { id: "aysen", numeral: "XI", name: "Aysén del General Carlos Ibáñez del Campo", zone: "sur" },
  { id: "magallanes", numeral: "XII", name: "Magallanes y de la Antártica Chilena", zone: "sur" },
];

/** Ciudades y comunas con movimiento de carga, agrupadas por región y en orden norte → sur. */
export const CITIES: City[] = [
  { name: "Arica", region: "Arica y Parinacota", regionId: "arica-y-parinacota", zone: "norte" },
  { name: "Putre", region: "Arica y Parinacota", regionId: "arica-y-parinacota", zone: "norte" },
  { name: "Iquique", region: "Tarapacá", regionId: "tarapaca", zone: "norte" },
  { name: "Alto Hospicio", region: "Tarapacá", regionId: "tarapaca", zone: "norte" },
  { name: "Pozo Almonte", region: "Tarapacá", regionId: "tarapaca", zone: "norte" },
  { name: "Pica", region: "Tarapacá", regionId: "tarapaca", zone: "norte" },
  { name: "Antofagasta", region: "Antofagasta", regionId: "antofagasta", zone: "norte" },
  { name: "Calama", region: "Antofagasta", regionId: "antofagasta", zone: "norte" },
  { name: "Mejillones", region: "Antofagasta", regionId: "antofagasta", zone: "norte" },
  { name: "Tocopilla", region: "Antofagasta", regionId: "antofagasta", zone: "norte" },
  { name: "Taltal", region: "Antofagasta", regionId: "antofagasta", zone: "norte" },
  { name: "San Pedro de Atacama", region: "Antofagasta", regionId: "antofagasta", zone: "norte" },
  { name: "Copiapó", region: "Atacama", regionId: "atacama", zone: "norte" },
  { name: "Caldera", region: "Atacama", regionId: "atacama", zone: "norte" },
  { name: "Vallenar", region: "Atacama", regionId: "atacama", zone: "norte" },
  { name: "Chañaral", region: "Atacama", regionId: "atacama", zone: "norte" },
  { name: "Diego de Almagro", region: "Atacama", regionId: "atacama", zone: "norte" },
  { name: "La Serena", region: "Coquimbo", regionId: "coquimbo", zone: "norte" },
  { name: "Coquimbo", region: "Coquimbo", regionId: "coquimbo", zone: "norte" },
  { name: "Ovalle", region: "Coquimbo", regionId: "coquimbo", zone: "norte" },
  { name: "Illapel", region: "Coquimbo", regionId: "coquimbo", zone: "norte" },
  { name: "Los Vilos", region: "Coquimbo", regionId: "coquimbo", zone: "norte" },
  { name: "Vicuña", region: "Coquimbo", regionId: "coquimbo", zone: "norte" },
  { name: "Salamanca", region: "Coquimbo", regionId: "coquimbo", zone: "norte" },
  { name: "Valparaíso", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "Viña del Mar", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "San Antonio", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "Quillota", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "La Calera", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "Quilpué", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "Casablanca", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "Los Andes", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "San Felipe", region: "Valparaíso", regionId: "valparaiso", zone: "centro" },
  { name: "Santiago", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Pudahuel", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Quilicura", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Lampa", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Colina", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Maipú", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "San Bernardo", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Puente Alto", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Buin", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Talagante", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Melipilla", region: "Metropolitana de Santiago", regionId: "metropolitana", zone: "centro" },
  { name: "Rancagua", region: "Libertador General Bernardo O'Higgins", regionId: "ohiggins", zone: "centro" },
  { name: "Rengo", region: "Libertador General Bernardo O'Higgins", regionId: "ohiggins", zone: "centro" },
  { name: "San Fernando", region: "Libertador General Bernardo O'Higgins", regionId: "ohiggins", zone: "centro" },
  { name: "Santa Cruz", region: "Libertador General Bernardo O'Higgins", regionId: "ohiggins", zone: "centro" },
  { name: "Pichilemu", region: "Libertador General Bernardo O'Higgins", regionId: "ohiggins", zone: "centro" },
  { name: "Talca", region: "Maule", regionId: "maule", zone: "centro" },
  { name: "Curicó", region: "Maule", regionId: "maule", zone: "centro" },
  { name: "Linares", region: "Maule", regionId: "maule", zone: "centro" },
  { name: "Constitución", region: "Maule", regionId: "maule", zone: "centro" },
  { name: "Parral", region: "Maule", regionId: "maule", zone: "centro" },
  { name: "Cauquenes", region: "Maule", regionId: "maule", zone: "centro" },
  { name: "Chillán", region: "Ñuble", regionId: "nuble", zone: "centro" },
  { name: "San Carlos", region: "Ñuble", regionId: "nuble", zone: "centro" },
  { name: "Bulnes", region: "Ñuble", regionId: "nuble", zone: "centro" },
  { name: "Quirihue", region: "Ñuble", regionId: "nuble", zone: "centro" },
  { name: "Concepción", region: "Biobío", regionId: "biobio", zone: "sur" },
  { name: "Talcahuano", region: "Biobío", regionId: "biobio", zone: "sur" },
  { name: "San Pedro de la Paz", region: "Biobío", regionId: "biobio", zone: "sur" },
  { name: "Coronel", region: "Biobío", regionId: "biobio", zone: "sur" },
  { name: "Lota", region: "Biobío", regionId: "biobio", zone: "sur" },
  { name: "Los Ángeles", region: "Biobío", regionId: "biobio", zone: "sur" },
  { name: "Arauco", region: "Biobío", regionId: "biobio", zone: "sur" },
  { name: "Cabrero", region: "Biobío", regionId: "biobio", zone: "sur" },
  { name: "Temuco", region: "La Araucanía", regionId: "araucania", zone: "sur" },
  { name: "Padre Las Casas", region: "La Araucanía", regionId: "araucania", zone: "sur" },
  { name: "Lautaro", region: "La Araucanía", regionId: "araucania", zone: "sur" },
  { name: "Victoria", region: "La Araucanía", regionId: "araucania", zone: "sur" },
  { name: "Angol", region: "La Araucanía", regionId: "araucania", zone: "sur" },
  { name: "Villarrica", region: "La Araucanía", regionId: "araucania", zone: "sur" },
  { name: "Pucón", region: "La Araucanía", regionId: "araucania", zone: "sur" },
  { name: "Valdivia", region: "Los Ríos", regionId: "los-rios", zone: "sur" },
  { name: "La Unión", region: "Los Ríos", regionId: "los-rios", zone: "sur" },
  { name: "Río Bueno", region: "Los Ríos", regionId: "los-rios", zone: "sur" },
  { name: "Panguipulli", region: "Los Ríos", regionId: "los-rios", zone: "sur" },
  { name: "Osorno", region: "Los Lagos", regionId: "los-lagos", zone: "sur" },
  { name: "Puerto Montt", region: "Los Lagos", regionId: "los-lagos", zone: "sur" },
  { name: "Puerto Varas", region: "Los Lagos", regionId: "los-lagos", zone: "sur" },
  { name: "Calbuco", region: "Los Lagos", regionId: "los-lagos", zone: "sur" },
  { name: "Ancud", region: "Los Lagos", regionId: "los-lagos", zone: "sur" },
  { name: "Castro", region: "Los Lagos", regionId: "los-lagos", zone: "sur" },
  { name: "Quellón", region: "Los Lagos", regionId: "los-lagos", zone: "sur" },
  { name: "Coyhaique", region: "Aysén del General Carlos Ibáñez del Campo", regionId: "aysen", zone: "sur" },
  { name: "Puerto Aysén", region: "Aysén del General Carlos Ibáñez del Campo", regionId: "aysen", zone: "sur" },
  { name: "Chile Chico", region: "Aysén del General Carlos Ibáñez del Campo", regionId: "aysen", zone: "sur" },
  { name: "Cochrane", region: "Aysén del General Carlos Ibáñez del Campo", regionId: "aysen", zone: "sur" },
  { name: "Punta Arenas", region: "Magallanes y de la Antártica Chilena", regionId: "magallanes", zone: "sur" },
  { name: "Puerto Natales", region: "Magallanes y de la Antártica Chilena", regionId: "magallanes", zone: "sur" },
  { name: "Porvenir", region: "Magallanes y de la Antártica Chilena", regionId: "magallanes", zone: "sur" },
  { name: "Puerto Williams", region: "Magallanes y de la Antártica Chilena", regionId: "magallanes", zone: "sur" },
];

export function cityByName(name: string): City | undefined {
  return CITIES.find((city) => city.name === name);
}

export function regionById(id: string): Region | undefined {
  return REGIONS.find((region) => region.id === id);
}

export function regionOfCity(name: string): Region | undefined {
  const city = cityByName(name);
  return city ? regionById(city.regionId) : undefined;
}

export function citiesInRegion(regionId: string): City[] {
  return CITIES.filter((city) => city.regionId === regionId);
}

/** Etiqueta corta para tarjetas y filtros: "Región de Antofagasta", "Región Metropolitana". */
export function regionLabel(region: Region | undefined): string {
  if (!region) return "";
  if (region.id === "metropolitana") return "Región Metropolitana";
  if (region.id === "ohiggins") return "Región de O'Higgins";
  if (region.id === "aysen") return "Región de Aysén";
  if (region.id === "magallanes") return "Región de Magallanes";
  if (region.id === "biobio") return "Región del Biobío";
  if (region.id === "maule") return "Región del Maule";
  return `Región de ${region.name}`;
}

function dims(side: "truck" | "load"): SpecField[] {
  if (side === "truck") {
    return [
      { key: "largoM", label: "Largo útil", kind: "number", unit: "m", step: 0.1 },
      { key: "anchoM", label: "Ancho útil", kind: "number", unit: "m", step: 0.05 },
      { key: "altoM", label: "Alto útil", kind: "number", unit: "m", step: 0.05 },
    ];
  }
  return [
    { key: "largoM", label: "Largo de la carga", kind: "number", unit: "m", step: 0.1 },
    { key: "anchoM", label: "Ancho de la carga", kind: "number", unit: "m", step: 0.05 },
    { key: "altoM", label: "Alto de la carga", kind: "number", unit: "m", step: 0.05 },
  ];
}

export const EQUIPMENT: Equipment[] = [
  {
    id: "rampla_plana",
    label: "Rampla plana",
    icon: "🚛",
    desc: "Carga general, estructuras, fierro, maquinaria liviana.",
    home: true,
    truckFields: [
      ...dims("truck").slice(0, 2),
      { key: "ejes", label: "Ejes", kind: "number", step: 1 },
      { key: "carpa", label: "Incluye carpa/amarras", kind: "bool" },
    ],
    loadFields: [...dims("load"), { key: "requiereCarpa", label: "Requiere carpa", kind: "bool" }],
  },
  {
    id: "sider",
    label: "Sider / lona",
    icon: "📦",
    desc: "Carga paletizada con acceso lateral y protección de lona.",
    home: true,
    truckFields: [
      ...dims("truck"),
      { key: "pallets", label: "Capacidad pallets", kind: "number", step: 1 },
      { key: "volumenM3", label: "Volumen", kind: "number", unit: "m³", step: 1 },
    ],
    loadFields: [
      { key: "pallets", label: "Pallets", kind: "number", step: 1 },
      { key: "volumenM3", label: "Volumen", kind: "number", unit: "m³", step: 1 },
      { key: "cargaLateral", label: "Requiere carga lateral", kind: "bool" },
    ],
  },
  {
    id: "furgon_seco",
    label: "Furgón seco",
    icon: "🚚",
    desc: "Carga cerrada y protegida, bultos y mercadería.",
    home: true,
    truckFields: [
      ...dims("truck"),
      { key: "pallets", label: "Capacidad pallets", kind: "number", step: 1 },
      { key: "volumenM3", label: "Volumen", kind: "number", unit: "m³", step: 1 },
    ],
    loadFields: [
      { key: "pallets", label: "Pallets", kind: "number", step: 1 },
      { key: "volumenM3", label: "Volumen", kind: "number", unit: "m³", step: 1 },
    ],
  },
  {
    id: "refrigerado",
    label: "Refrigerado",
    icon: "❄️",
    desc: "Cadena de frío: alimentos, farmacia, insumos sensibles.",
    home: true,
    truckFields: [
      { key: "tempMin", label: "Temperatura mínima", kind: "number", unit: "°C", step: 1, required: true },
      { key: "tempMax", label: "Temperatura máxima", kind: "number", unit: "°C", step: 1, required: true },
      { key: "pallets", label: "Capacidad pallets", kind: "number", step: 1 },
      { key: "grupoFrio", label: "Equipo de frío", kind: "select", options: ["Thermo King", "Carrier", "Otro"] },
      { key: "resSanitaria", label: "Resolución sanitaria vigente", kind: "bool" },
    ],
    loadFields: [
      { key: "tempReq", label: "Temperatura requerida", kind: "number", unit: "°C", step: 1, required: true },
      { key: "pallets", label: "Pallets", kind: "number", step: 1 },
      { key: "producto", label: "Producto", kind: "text", placeholder: "Ej: fruta, lácteos, fármacos" },
    ],
  },
  {
    id: "cama_baja",
    label: "Cama baja",
    icon: "🏗️",
    desc: "Maquinaria pesada y carga sobredimensionada: construcción, industria, energía y agro.",
    home: true,
    highlight: true,
    truckFields: [
      { key: "ejes", label: "Ejes", kind: "number", step: 1, required: true },
      { key: "largoM", label: "Largo de cama", kind: "number", unit: "m", step: 0.1, required: true },
      { key: "anchoM", label: "Ancho base", kind: "number", unit: "m", step: 0.05, required: true },
      { key: "anchoExtM", label: "Ancho extensible (máx.)", kind: "number", unit: "m", step: 0.05 },
      { key: "alturaCamaCm", label: "Altura de cama", kind: "number", unit: "cm", step: 1 },
      { key: "rampas", label: "Rampas de carga", kind: "bool" },
      { key: "winche", label: "Winche", kind: "bool" },
    ],
    loadFields: [
      {
        key: "maquina",
        label: "Tipo de equipo a transportar",
        kind: "select",
        options: [
          "Excavadora",
          "Cargador frontal",
          "Bulldozer",
          "Motoniveladora",
          "Grúa",
          "Camión tolva / camión pesado",
          "Generador / equipo industrial",
          "Otro",
        ],
      },
      { key: "largoM", label: "Largo", kind: "number", unit: "m", step: 0.1 },
      { key: "anchoM", label: "Ancho", kind: "number", unit: "m", step: 0.05 },
      { key: "altoM", label: "Alto", kind: "number", unit: "m", step: 0.05 },
      { key: "ejesMin", label: "Ejes mínimos requeridos", kind: "number", step: 1 },
      { key: "requiereRampas", label: "Requiere rampas", kind: "bool" },
      { key: "requiereWinche", label: "Requiere winche", kind: "bool" },
      { key: "requiereAcreditacion", label: "Ingreso a recinto con acreditación (planta, puerto, obra)", kind: "bool" },
    ],
  },
  {
    id: "tolva",
    label: "Tolva / granel",
    icon: "🪨",
    desc: "Carga masiva a granel: áridos, granos, sal, fertilizantes y concentrados.",
    home: true,
    truckFields: [
      { key: "volumenM3", label: "Capacidad", kind: "number", unit: "m³", step: 1, required: true },
      {
        key: "material",
        label: "Material habitual",
        kind: "select",
        options: ["Áridos", "Granos", "Sal", "Fertilizantes", "Concentrados", "Cualquier granel"],
      },
      { key: "volcable", label: "Volcable", kind: "bool" },
    ],
    loadFields: [
      { key: "volumenM3", label: "Volumen", kind: "number", unit: "m³", step: 1, required: true },
      {
        key: "material",
        label: "Material",
        kind: "select",
        options: ["Áridos", "Granos", "Sal", "Fertilizantes", "Concentrados", "Otro granel"],
      },
    ],
  },
  {
    id: "estanque",
    label: "Estanque",
    icon: "🛢️",
    desc: "Combustibles, agua, químicos y líquidos.",
    home: true,
    truckFields: [
      { key: "volumenM3", label: "Capacidad", kind: "number", unit: "m³", step: 1, required: true },
      {
        key: "producto",
        label: "Producto autorizado",
        kind: "select",
        options: ["Combustible", "Agua", "Químicos", "Alimentos líquidos", "Multiproducto"],
        required: true,
      },
      { key: "compartimentos", label: "Compartimentos", kind: "number", step: 1 },
      { key: "bomba", label: "Con bomba de descarga", kind: "bool" },
    ],
    loadFields: [
      { key: "volumenM3", label: "Volumen", kind: "number", unit: "m³", step: 1, required: true },
      {
        key: "producto",
        label: "Producto",
        kind: "select",
        options: ["Combustible", "Agua", "Químicos", "Alimentos líquidos"],
        required: true,
      },
      { key: "requiereBomba", label: "Requiere bomba de descarga", kind: "bool" },
    ],
  },
  {
    id: "portacontenedor",
    label: "Portacontenedor",
    icon: "🚢",
    desc: "Contenedores 20' y 40' desde y hacia puertos.",
    home: true,
    truckFields: [
      {
        key: "tamano",
        label: "Contenedores que carga",
        kind: "select",
        options: ["20'", "40'", "20' y 40'"],
        required: true,
      },
      { key: "twistlocks", label: "Con twist-locks", kind: "bool" },
    ],
    loadFields: [
      { key: "tamano", label: "Tamaño del contenedor", kind: "select", options: ["20'", "40'"], required: true },
      { key: "cantidad", label: "Cantidad de contenedores", kind: "number", step: 1 },
    ],
  },
  {
    id: "camion_34",
    label: "Camión 3/4 y liviano",
    icon: "🛻",
    desc: "Reparto, mudanzas y cargas livianas.",
    home: true,
    truckFields: [
      { key: "carroceria", label: "Carrocería", kind: "select", options: ["Barandas", "Furgón", "Plano", "Otra"] },
      { key: "largoM", label: "Largo útil", kind: "number", unit: "m", step: 0.1 },
      { key: "volumenM3", label: "Volumen", kind: "number", unit: "m³", step: 1 },
    ],
    loadFields: [
      { key: "volumenM3", label: "Volumen aprox.", kind: "number", unit: "m³", step: 1 },
      { key: "bultos", label: "Cantidad de bultos", kind: "number", step: 1 },
    ],
  },
  {
    id: "portaautos",
    label: "Niñera / portaautos",
    icon: "🚗",
    desc: "Traslado de vehículos, camionetas y maquinaria menor.",
    home: true,
    truckFields: [{ key: "vehiculos", label: "Vehículos por viaje", kind: "number", step: 1, required: true }],
    loadFields: [
      { key: "vehiculos", label: "Cantidad de vehículos", kind: "number", step: 1, required: true },
      {
        key: "tipoVehiculo",
        label: "Tipo",
        kind: "select",
        options: ["Auto / SUV", "Camioneta", "Furgón", "Moto / ATV", "Otro"],
      },
    ],
  },
  {
    id: "peligrosa",
    label: "Carga peligrosa",
    icon: "☣️",
    desc: "Sustancias peligrosas con autorización y clases habilitadas.",
    home: true,
    truckFields: [
      {
        key: "clases",
        label: "Clases habilitadas (separadas por coma)",
        kind: "text",
        placeholder: "Ej: 3, 8",
        required: true,
      },
      { key: "autorizacion", label: "Autorización de transporte vigente", kind: "bool" },
      {
        key: "formato",
        label: "Formato",
        kind: "select",
        options: ["Estanque", "Furgón / bultos", "Rampla / contenedor"],
      },
    ],
    loadFields: [
      { key: "clase", label: "Clase de peligro (1 a 9)", kind: "number", step: 1, required: true },
      { key: "onu", label: "Número ONU", kind: "text", placeholder: "Ej: 1202" },
    ],
  },
  {
    id: "otro",
    label: "Otro",
    icon: "🧩",
    desc: "Equipo especial no listado.",
    home: false,
    truckFields: [{ key: "detalle", label: "Detalle del equipo", kind: "text", placeholder: "Describe el equipo" }],
    loadFields: [
      { key: "detalle", label: "Detalle del requerimiento", kind: "text", placeholder: "Describe qué necesitas" },
    ],
  },
];

export function equipmentById(id: string): Equipment {
  return EQUIPMENT.find((item) => item.id === id) ?? EQUIPMENT[EQUIPMENT.length - 1];
}

export function isEquipmentId(id: string): id is EquipmentId {
  return EQUIPMENT.some((item) => item.id === id);
}

export type DocTypeDef = {
  id: string;
  label: string;
  audience: DocAudience;
  details?: string[];
  /** El detalle es opcional (ej. cara de la cédula); si viene, debe ser uno de `details`. */
  detailsOptional?: boolean;
  detailLabel?: string;
};

export const DOC_CATALOG: DocTypeDef[] = [
  { id: "padron", label: "Padrón", audience: "camion" },
  { id: "revision", label: "Revisión técnica", audience: "camion" },
  { id: "permiso", label: "Permiso de circulación", audience: "camion" },
  { id: "soap", label: "SOAP", audience: "camion" },
  { id: "seguro_carga", label: "Seguro de carga", audience: "camion" },
  { id: "gases", label: "Certificado de gases", audience: "camion" },
  { id: "licencia", label: "Licencia profesional", audience: "personal", details: ["A2", "A4", "A5"], detailLabel: "Clase de licencia" },
  { id: "cedula", label: "Cédula de identidad", audience: "personal", details: ["Frontal", "Reverso"], detailsOptional: true, detailLabel: "Cara de la cédula" },
  { id: "hoja_vida", label: "Hoja de vida del conductor", audience: "personal" },
  { id: "antecedentes", label: "Certificado de antecedentes", audience: "personal" },
  { id: "manejo_defensivo", label: "Curso de manejo a la defensiva", audience: "personal" },
  { id: "induccion", label: "Inducción de seguridad / acreditación", audience: "personal" },
];

const LEGACY_DOC_LABELS: Record<string, string> = {
  acred_ingreso: "Acreditación de ingreso a recintos",
  res_sanitaria: "Resolución sanitaria (refrigerado/alimentos)",
  aut_peligrosa: "Autorización transporte de sustancias peligrosas",
  permiso_sobredim: "Permiso de carga sobredimensionada (MOP/Vialidad)",
};

export const DOC_TYPES = DOC_CATALOG;

export function docsFor(audience: DocAudience): DocTypeDef[] {
  return DOC_CATALOG.filter((item) => item.audience === audience);
}

export function docTypeById(id: string): DocTypeDef | undefined {
  return DOC_CATALOG.find((item) => item.id === id);
}

export function docTypeLabel(id: string): string {
  return docTypeById(id)?.label ?? LEGACY_DOC_LABELS[id] ?? id;
}

export function specLines(equipment: string, specs: Specs, side: "truck" | "load"): string[] {
  const def = equipmentById(equipment);
  const fields = side === "truck" ? def.truckFields : def.loadFields;
  return fields
    .map((field) => {
      const value = specs[field.key];
      if (value === undefined || value === "" || value === false) return null;
      if (field.kind === "bool") return field.label;
      return `${field.label}: ${value}${field.unit ? ` ${field.unit}` : ""}`;
    })
    .filter((line): line is string => Boolean(line));
}

export function isKnownCity(name: string): boolean {
  return CITIES.some((city) => city.name === name);
}
