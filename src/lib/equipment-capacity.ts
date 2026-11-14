/** Capacidad típica de referencia por equipo (orientativa, la real la declara cada transportista). */
export const EQUIPMENT_CAPACITY: Record<string, string> = {
  rampla_plana: "hasta 28 t",
  sider: "hasta 28 t · ~30 pallets",
  furgon_seco: "hasta 28 t · carga cerrada",
  refrigerado: "hasta 26 t · frío/congelado",
  cama_baja: "40 t o más · sobredimensión",
  tolva: "25–30 m³ a granel",
  estanque: "hasta ~30.000 L",
  portacontenedor: "contenedor 20' o 40'",
  camion_34: "hasta 5 t · reparto",
  portaautos: "hasta 8–10 vehículos",
  peligrosa: "según clase autorizada",
  otro: "a convenir",
};
