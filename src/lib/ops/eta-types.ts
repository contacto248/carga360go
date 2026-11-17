export type GeofencePoint = "origen" | "destino";

export type GeofenceHit = {
  point: GeofencePoint;
  inside: boolean;
  distanceM: number;
  radiusM: number;
};

export type EtaView = {
  id: string;
  shipmentId: string;
  gpsPointId: string | null;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  recordedAt: string;
  distanceM: number;
  durationS: number;
  durationTruckS: number;
  factorDuracionCamion: number;
  etaAt: string;
  provider: "osrm";
  profile: string;
  truckAware: false;
  aviso: string;
  evaluacion: GeofenceHit[];
  createdAt: string;
  recalculado: boolean;
};
