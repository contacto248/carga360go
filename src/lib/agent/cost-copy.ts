/** Textos del agente sobre costos (sin dependencias de servidor: también los usan componentes de cliente). */
/** Lo que el agente explica cuando preguntan por costos. Sin comisiones, modelos de cobro ni estrategia de precios. */
export const COST_EXPLANATION =
  "El costo de referencia desglosado del flete se calcula automáticamente con la ruta, los peajes según los ejes del camión, el diésel y los costos operacionales.";

/** Cuando aún no hay una cotización completa: no se dan cifras. */
export const COST_PENDING_NOTE =
  "Para darle una cifra necesito los datos completos del transporte (origen, destino, tipo de camión y peso); si algún dato oficial queda pendiente, no le daré un monto y un ejecutivo le responderá.";

/** Cuando el motor no pudo completar el cálculo (ruta o fuente oficial pendiente o vencida). */
export const COST_INCOMPLETE_NOTE =
  "El cálculo automático quedó con datos pendientes, así que no le daré una cifra: un ejecutivo le confirmará el costo.";
