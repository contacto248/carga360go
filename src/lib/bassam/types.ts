/** Clasificación del GPS: la API se prueba con un punto, sin dispositivo en terreno. */
export const GPS_CLASIFICACION = "Probada en test" as const;

export const AUTH_ACTIONS = ["autorizar", "rechazar", "solicitar_revision"] as const;
export type AuthAction = (typeof AUTH_ACTIONS)[number];

export type CountText = string;

export type TripEventView = {
  status: string;
  label: string;
  at: string;
  authorLabel: string;
};

export type GpsPointView = { lat: number; lng: number; recordedAt: string };

export type Severity = "baja" | "media" | "alta" | "muy_alta";

export type QualityView = {
  id: string;
  loadId: string;
  at: string;
  severity: Severity;
  ruleId: string;
  decision: "resuelto" | "solicitar_revision" | "sin_datos" | "pendiente_gerente" | "aprobado";
  result: string;
  actor: "agente_calidad" | "gerente";
  route: string;
};

export type TorreViaje = {
  id: string;
  origin: string;
  destination: string;
  tripLabel: string;
  autorizacion: "pendiente" | "autorizada" | "rechazada" | "en_revision";
  historial: TripEventView[];
  gps: GpsPointView[];
  severidad: Severity | "sin datos";
  regla: string;
  necesitaGerente: boolean;
};

export type BassamSnapshot = {
  marca: "CARGA360GO";
  titulo: "BASSAM 360";
  generado: string;
  conteos: { viajes: CountText; eventos: CountText; gps: CountText; autorizaciones: CountText; revisiones: CountText };
  torre: TorreViaje[];
  informe: { texto: "sin datos" } | { texto: "datos reales"; viajes: TorreViaje[] };
  calidad: QualityView[] | "sin datos";
  gpsClasificacion: typeof GPS_CLASIFICACION;
};

export type QrSide = { point: "origen" | "destino"; url: string; svg: string };

export type PendingDocument = {
  id: string;
  tipo: string;
  vencimiento: string | null;
  comentarioIa: string | null;
  estadoIa: string | null;
  estadoAdmin: string;
  tipoCliente: "transportista" | "mandante";
  transportistaId: string | null;
  transportistaNombre: string;
  transportistaEstado: string;
};

export type PublicCheckpoint = {
  point: "origen" | "destino";
  pointLabel: "Origen" | "Destino";
  origin: string;
  destination: string;
  tripLabel: string;
};
