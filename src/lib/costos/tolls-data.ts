/**
 * Plazas de peaje y pórticos cargados en la base, SOLO con tarifas verificadas en fuente oficial.
 *
 * Tarifas: documentos "PEAJES TARIFAS 2026" de la Dirección General de Concesiones del MOP
 * (https://concesiones.mop.gob.cl/peajes-y-porticos/), descargados y leídos el 14-11-2026, más la publicación
 * de cada concesionaria cuando existe. Vigencia 01-01-2026 a 31-12-2026 (reajuste anual de enero según contrato).
 * Montos en CLP tal como se publican (incluyen IVA).
 *
 * Ubicación: nodo de OpenStreetMap de la plaza (barrier=toll_booth / highway=toll_gantry) sobre la Ruta 5,
 * obtenido el 14-11-2026 (© OpenStreetMap contributors, ODbL). "osm_nombre": el nodo trae el nombre de la plaza.
 * "osm_cercano": el nodo no trae nombre y se identificó por su posición sobre la ruta y el kilómetro o la oficina
 * de la concesionaria (se marca como estimado hasta confirmarlo).
 *
 * No cargados (quedan fuera hasta verificarlos): plazas laterales de Ruta del Elqui (Combarbalá, Socos, Tongoy,
 * Guanaqueros), plaza Troncal Ruta 5 de la Autopista de la Región de Antofagasta (no se pudo ubicar con certeza),
 * pórticos de Autopista Central y Costanera Norte distintos de los indicados, y Vespucio Norte.
 *
 * Ruta 68 (17-11-2026): PDF MOP «PEAJES TARIFAS 2026» y el informe ejecutivo de la concesión nombran
 * Troncal Zapata, Troncal Lo Prado y Troncal Sur. Las laterales comparten tarifa con el Troncal Sur,
 * pero el PDF no lista cada plaza lateral: no se cargan. Ubicación: nodos OSM con nombre, consultados
 * el 17-11-2026 (un punto por plaza, al medio de los dos sentidos).
 * Ruta 5 Sur: solo Peaje Angostura, columna «TRONCAL RUTA 5» del PDF Santiago–Talca (abril 2026) y nodo OSM.
 * El resto de la Ruta 5 Sur no se carga: el PDF da una tarifa de tramo, no la ubicación de cada plaza.
 * Ruta 1: los PDF de Acceso Iquique y Autopista de Antofagasta traen tarifas de «TRONCAL RUTA 1», pero
 * no se pudo verificar la coordenada de cada plaza. Esas plazas no se incluyen.
 */
export type SeedRate = { category: string; rateType: "unica" | "TBFP" | "TBP"; amount: number };
export type SeedPlaza = {
  id: string;
  name: string;
  concession: string;
  route: string;
  km: string | null;
  lat: number;
  lon: number;
  direction: "ambos" | "norte" | "sur";
  scheme: "ejes" | "remolque";
  kind: "troncal" | "portico";
  locationSource: "osm_nombre" | "osm_cercano";
  locationNote: string;
  sourceId: string;
  rates: SeedRate[];
  note?: string;
};

export type SeedSource = { id: string; name: string; url: string; sha256: string; validFrom: string; validTo: string; checkedAt?: string };

export const TOLL_SOURCES: SeedSource[] = [
  { id: "mop_vallenar_caldera", name: "MOP DGC – Tarifas 2026 Ruta 5 Vallenar–Caldera (Valles del Desierto)", url: "https://concesiones.mop.gob.cl/uploads/sites/4/2026/03/VALLENAR-CALDERA.pdf", sha256: "3c858eda544ffa2b81f4b655dfd2b3c389db1a22c5d5c792277e2c1eb465ffd9", validFrom: "2026-01-01", validTo: "2026-12-31" },
  { id: "mop_la_serena_vallenar", name: "MOP DGC – Tarifas 2026 Ruta 5 La Serena–Vallenar (Ruta del Algarrobo)", url: "https://concesiones.mop.gob.cl/uploads/sites/4/2026/01/LA-SERENA-VALLENAR.pdf", sha256: "21cf134e7712f10c5b2d389f1a9c2843389c4fdbb783146c855b0231aa702ee0", validFrom: "2026-01-01", validTo: "2026-12-31" },
  { id: "mop_los_vilos_la_serena", name: "MOP DGC – Tarifas 2026 Ruta 5 Los Vilos–La Serena (Ruta del Elqui)", url: "https://concesiones.mop.gob.cl/uploads/sites/4/2026/01/LOS-VILOS-LA-SERENA.pdf", sha256: "e9cd50ba5c40de0ac44d88b517610bd197cbc964b183b7ed3153a2824ca77850", validFrom: "2026-01-01", validTo: "2026-12-31" },
  { id: "mop_santiago_los_vilos", name: "MOP DGC – Tarifas 2026 Ruta 5 Santiago–Los Vilos (Nueva Aconcagua)", url: "https://concesiones.mop.gob.cl/uploads/sites/4/2026/05/STGO-LOS-VILOS.pdf", sha256: "741e8ef11806fc02a94c734993aff8e32949eecc4e4e36702d11fd93efa9e38d", validFrom: "2026-01-01", validTo: "2026-12-31" },
  { id: "mop_autopista_central", name: "MOP DGC – Tarifas 2026 Autopista Central", url: "https://concesiones.mop.gob.cl/uploads/sites/4/2026/03/AUTOPISTA-CENTRAL.pdf", sha256: "5ba54ad1e4b7d3da50d6486bb827dd32067c413d219abd16c888bb4765e736ee", validFrom: "2026-01-01", validTo: "2026-12-31" },
  { id: "mop_costanera_norte", name: "MOP DGC – Tarifas 2026 Costanera Norte", url: "https://concesiones.mop.gob.cl/uploads/sites/4/2026/07/COSTANERA-NORTE.pdf", sha256: "7e5b2269ad355c3ebca607338a5e9f0ffdd81600396339cf4565a75bdc92cf15", validFrom: "2026-01-01", validTo: "2026-12-31" },
  { id: "mop_ruta_68", name: "MOP DGC – Tarifas 2026 Ruta 68 Santiago–Valparaíso–Viña", url: "https://concesiones.mop.gob.cl/uploads/sites/4/2026/01/RUTA-68.pdf", sha256: "78632ff3ceeeeb25407823060ffe3b05cbfa71ddc46f5602f2dbe2059ac2ee46", validFrom: "2026-01-01", validTo: "2026-12-31", checkedAt: "2026-11-17T15:00:00.000Z" },
  { id: "mop_santiago_talca", name: "MOP DGC – Tarifas 2026 Ruta 5 Santiago–Talca", url: "https://concesiones.mop.gob.cl/uploads/sites/4/2026/04/SANTIAGO-TALCA.pdf", sha256: "3f2a4822f1b84b63830c3dd06b899c85b71c4b088b8c1d7214b545df3b4c6ce7", validFrom: "2026-01-01", validTo: "2026-12-31", checkedAt: "2026-11-17T15:00:00.000Z" },
];

const E = (two: number, more: number): SeedRate[] => [
  { category: "camion_2_ejes", rateType: "unica", amount: two },
  { category: "camion_mas_2_ejes", rateType: "unica", amount: more },
];
const P = (simpleFp: number, trailerFp: number, simpleP: number, trailerP: number): SeedRate[] => [
  { category: "camion_sin_remolque", rateType: "TBFP", amount: simpleFp },
  { category: "camion_con_remolque", rateType: "TBFP", amount: trailerFp },
  { category: "camion_sin_remolque", rateType: "TBP", amount: simpleP },
  { category: "camion_con_remolque", rateType: "TBP", amount: trailerP },
];

export const TOLL_PLAZAS: SeedPlaza[] = [
  { id: "puerto_viejo", name: "Puerto Viejo (troncal)", concession: "Valles del Desierto", route: "Ruta 5 Norte", km: "841", lat: -27.3482936, lon: -70.6363335, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_nombre", locationNote: "OSM nodo 1938951646 «Peaje Puerto Viejo»", sourceId: "mop_vallenar_caldera", rates: E(5200, 6900) },
  { id: "totoral", name: "Totoral (troncal)", concession: "Valles del Desierto", route: "Ruta 5 Norte", km: "731", lat: -27.9970728, lon: -70.5659163, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_nombre", locationNote: "OSM nodo 1949636338 «Peaje Totoral»", sourceId: "mop_vallenar_caldera", rates: E(8650, 11550) },
  { id: "cachiyuyo", name: "Cachiyuyo (troncal)", concession: "Ruta del Algarrobo", route: "Ruta 5 Norte", km: "598,2", lat: -29.0867108, lon: -70.917138, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_cercano", locationNote: "OSM nodo 3359418518 (sin nombre), a metros de la oficina «Autopista del Algarrobo – Peaje Cachiyuyo»", sourceId: "mop_la_serena_vallenar", rates: [...E(9400, 12500), { category: "sobredimension", rateType: "unica", amount: 25000 }] },
  { id: "punta_colorada", name: "Punta Colorada (troncal)", concession: "Ruta del Algarrobo", route: "Ruta 5 Norte", km: "554,7", lat: -29.3710086, lon: -71.073152, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_nombre", locationNote: "OSM nodo 4291821777 «Peaje Punta Colorada»", sourceId: "mop_la_serena_vallenar", rates: [...E(9400, 12500), { category: "sobredimension", rateType: "unica", amount: 25000 }] },
  { id: "elqui_troncal_norte", name: "Troncal Norte", concession: "Ruta del Elqui", route: "Ruta 5 Norte", km: null, lat: -30.4081909, lon: -71.4455377, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_cercano", locationNote: "OSM nodo 1970134247 (sin nombre), junto a la oficina «Autopista del Elqui – Peaje Troncal Norte»", sourceId: "mop_los_vilos_la_serena", rates: E(7600, 13550) },
  { id: "elqui_troncal_sur", name: "Troncal Sur (Puerto Oscuro)", concession: "Ruta del Elqui", route: "Ruta 5 Norte", km: null, lat: -31.4201993, lon: -71.5708345, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_nombre", locationNote: "OSM nodo 1450353534 «Peaje Puerto Oscuro»", sourceId: "mop_los_vilos_la_serena", rates: E(7600, 13550) },
  { id: "pichidangui", name: "Pichidangui (troncal)", concession: "Nueva Aconcagua", route: "Ruta 5 Norte", km: null, lat: -32.1749622, lon: -71.5206745, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_nombre", locationNote: "OSM nodo 1502159436 «Peaje Pichidangui»", sourceId: "mop_santiago_los_vilos", rates: E(5300, 9400) },
  { id: "tunel_el_melon", name: "Túnel El Melón (troncal)", concession: "Nueva Aconcagua", route: "Ruta 5 Norte", km: null, lat: -32.629614, lon: -71.2308575, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_nombre", locationNote: "OSM nodo 289394039 «Peaje Tunel el Melon»", sourceId: "mop_santiago_los_vilos", rates: E(5300, 9400), note: "Solo si la ruta usa el túnel (no la cuesta El Melón)." },
  { id: "las_vegas", name: "Las Vegas (troncal)", concession: "Nueva Aconcagua", route: "Ruta 5 Norte", km: null, lat: -32.8437879, lon: -70.9892279, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_cercano", locationNote: "OSM nodos 14115251545/6 «Peaje Llay Llay», en el sector Las Vegas (Llay-Llay); Nominatim ubica «Peaje Las Vegas» a 60 m", sourceId: "mop_santiago_los_vilos", rates: E(5300, 9400) },
  { id: "lampa", name: "Lampa (troncal)", concession: "Nueva Aconcagua", route: "Ruta 5 Norte", km: null, lat: -33.2355983, lon: -70.7590362, direction: "ambos", scheme: "ejes", kind: "troncal", locationSource: "osm_nombre", locationNote: "OSM nodo 6223443638 «Peaje Lampa»", sourceId: "mop_santiago_los_vilos", rates: E(1600, 2900) },
  { id: "lo_pinto", name: "Enlace Lo Pinto (pórtico free flow)", concession: "Nueva Aconcagua", route: "Ruta 5 Norte", km: null, lat: -33.2799197, lon: -70.7390951, direction: "ambos", scheme: "remolque", kind: "portico", locationSource: "osm_nombre", locationNote: "OSM nodo 6615396115 «Pórtico 8 – Enlace Lo Pinto»", sourceId: "mop_santiago_los_vilos", rates: P(875, 1555, 1750, 3110) },
  { id: "la_montana", name: "Paso Superior La Montaña (pórtico free flow)", concession: "Nueva Aconcagua", route: "Ruta 5 Norte", km: null, lat: -33.3170776, lon: -70.7224191, direction: "ambos", scheme: "remolque", kind: "portico", locationSource: "osm_nombre", locationNote: "OSM nodo 6615396126 «Pórtico 6 – Paso Superior La Montaña»", sourceId: "mop_santiago_los_vilos", rates: P(715, 1270, 1429, 2541) },
  { id: "buenaventura", name: "Enlace Buenaventura (pórtico free flow)", concession: "Nueva Aconcagua", route: "Ruta 5 Norte", km: null, lat: -33.3398151, lon: -70.7122122, direction: "ambos", scheme: "remolque", kind: "portico", locationSource: "osm_cercano", locationNote: "OSM nodo 6548809057 (operador Nueva Aconcagua, sin nombre); identificado por el orden de los pórticos hacia Santiago", sourceId: "mop_santiago_los_vilos", rates: P(392, 698, 785, 1395) },
  { id: "lo_marcoleta", name: "Paso Superior Lo Marcoleta (pórtico free flow)", concession: "Nueva Aconcagua", route: "Ruta 5 Norte", km: null, lat: -33.357992, lon: -70.7040905, direction: "ambos", scheme: "remolque", kind: "portico", locationSource: "osm_cercano", locationNote: "OSM nodo 6548823501 (operador Nueva Aconcagua, sin nombre); identificado por el orden de los pórticos hacia Santiago", sourceId: "mop_santiago_los_vilos", rates: P(326, 579, 652, 1158) },
  { id: "ac_pa18", name: "Autopista Central PA18 (A. Vespucio Norte – 14 de la Fama)", concession: "Autopista Central", route: "Eje Norte-Sur", km: null, lat: -33.3682982, lon: -70.6994258, direction: "sur", scheme: "remolque", kind: "portico", locationSource: "osm_nombre", locationNote: "OSM nodo 6114138859 «PA18 – Américo Vespucio Norte – 14 de la Fama»", sourceId: "mop_autopista_central", rates: P(924.92, 1387.38, 1849.85, 2774.78), note: "Sentido norte-sur. Tarifa de saturación (TS) en horarios publicados no incluida." },
  { id: "ac_pa15", name: "Autopista Central PA15 (14 de la Fama – Río Mapocho)", concession: "Autopista Central", route: "Eje Norte-Sur", km: null, lat: -33.4265149, lon: -70.6688947, direction: "sur", scheme: "remolque", kind: "portico", locationSource: "osm_nombre", locationNote: "OSM nodo 6116236799 «PA15 – 14 de la Fama – Río Mapocho»", sourceId: "mop_autopista_central", rates: P(850.09, 1275.14, 1700.2, 2550.3), note: "Sentido norte-sur." },
  { id: "cn_p04_vivaceta", name: "Pórtico «P04 Vivaceta – Torres Tajamar» (Costanera Norte)", concession: "Costanera Norte", route: "Costanera Norte", km: null, lat: -33.4302245, lon: -70.6579611, direction: "ambos", scheme: "remolque", kind: "portico", locationSource: "osm_nombre", locationNote: "OSM nodo 6116236797; el nombre no coincide con los pórticos del documento MOP 2026", sourceId: "mop_costanera_norte", rates: [], note: "Tarifa PENDIENTE: el pórtico de OSM no se pudo emparejar con certeza con la tabla oficial." },
  {
    id: "r68_lo_prado",
    name: "Lo Prado (troncal)",
    concession: "Ruta 68",
    route: "Ruta 68",
    km: null,
    lat: -33.4568855,
    lon: -70.8985265,
    direction: "ambos",
    scheme: "ejes",
    kind: "troncal",
    locationSource: "osm_nombre",
    locationNote: "Punto medio de los nodos OSM 243646585 y 5508725661 «Peaje Troncal Lo Prado» (17-11-2026)",
    sourceId: "mop_ruta_68",
    rates: [
      { category: "camion_2_ejes", rateType: "TBFP", amount: 4800 },
      { category: "camion_mas_2_ejes", rateType: "TBFP", amount: 8600 },
      { category: "camion_2_ejes", rateType: "TBP", amount: 7200 },
      { category: "camion_mas_2_ejes", rateType: "TBP", amount: 12900 },
    ],
    note: "Tarifa normal de Troncal Zapata y Lo Prado. Punta: viernes 17:00 hasta lunes 00:00, y fines de semana largos (PDF MOP 2026 e informe ejecutivo de la concesión).",
  },
  {
    id: "r68_zapata",
    name: "Zapata (troncal)",
    concession: "Ruta 68",
    route: "Ruta 68",
    km: null,
    lat: -33.3710995,
    lon: -71.299765,
    direction: "ambos",
    scheme: "ejes",
    kind: "troncal",
    locationSource: "osm_nombre",
    locationNote: "Punto medio de los nodos OSM 6613063427 y 6613063432 «Peaje Zapata Rutas del Pacífico» (17-11-2026)",
    sourceId: "mop_ruta_68",
    rates: [
      { category: "camion_2_ejes", rateType: "TBFP", amount: 4800 },
      { category: "camion_mas_2_ejes", rateType: "TBFP", amount: 8600 },
      { category: "camion_2_ejes", rateType: "TBP", amount: 7200 },
      { category: "camion_mas_2_ejes", rateType: "TBP", amount: 12900 },
    ],
    note: "Misma tarifa troncal que Lo Prado (PDF MOP Ruta 68, 2026).",
  },
  {
    id: "r68_troncal_sur",
    name: "Troncal Sur",
    concession: "Ruta 68",
    route: "Ruta 68",
    km: null,
    lat: -33.063187,
    lon: -71.4340835,
    direction: "ambos",
    scheme: "ejes",
    kind: "troncal",
    locationSource: "osm_nombre",
    locationNote: "Punto medio de los nodos OSM 276093010 y 294489553 «Peaje Troncal Sur Rutas del Pacífico» (17-11-2026)",
    sourceId: "mop_ruta_68",
    rates: E(1900, 3500),
    note: "Columna «Lateral y Troncal Sur» del PDF MOP 2026: tarifa normal todo el día. Las plazas laterales no se cargan porque el PDF no las nombra.",
  },
  {
    id: "r5s_angostura",
    name: "Angostura (troncal)",
    concession: "Ruta 5 Santiago–Talca",
    route: "Ruta 5 Sur",
    km: null,
    lat: -33.9075996,
    lon: -70.7310618,
    direction: "ambos",
    scheme: "ejes",
    kind: "troncal",
    locationSource: "osm_nombre",
    locationNote: "OSM nodo 5008518144 «Peaje Angostura» (Nominatim, 17-11-2026)",
    sourceId: "mop_santiago_talca",
    rates: E(6900, 12200),
    note: "Columna «TRONCAL RUTA 5» del PDF MOP Santiago–Talca 2026. Otras plazas de ese tramo no se cargan: el PDF no trae su ubicación.",
  },
];

/** Horario punta (TBP) de los pórticos Lo Marcoleta, Buenaventura, La Montaña y Lo Pinto, según la publicación 2026 de Nueva Aconcagua. */
export const NUEVA_ACONCAGUA_TBP =
  "Lun 7:15–10:00 y 17:15–20:00; mar a jue 7:15–9:00 y 17:45–20:00; vie 7:15–10:00 y 16:45–20:45; sáb y festivos 9:15–15:45; dom 17:15–22:00.";
