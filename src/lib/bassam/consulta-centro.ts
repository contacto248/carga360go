import { vistaCentro, type VistaCentro } from "./centro";

const PEDIDO_SQL = /\b(select|insert|update|delete|drop|alter|pragma|attach)\b/i;
const PEDIDO_HUMANO = /aprob|aprueb|rechaz/i;

/** Respuesta de reglas. No ejecuta la pregunta como SQL, no aprueba y no lee secretos. */
export function consultaCentro(pregunta: string): { texto: string; indicadores: VistaCentro } {
  const indicadores = vistaCentro();
  const marcas = `Viajes: ${indicadores.viajes}. Camiones: ${indicadores.camiones}. Clientes: ${indicadores.clientes}. Documentos: ${indicadores.docs}.`;
  if (PEDIDO_SQL.test(pregunta)) return { texto: `No ejecuto SQL. ${marcas}`, indicadores };
  if (PEDIDO_HUMANO.test(pregunta)) return { texto: "No apruebo solo. El admin confirma con el botón del panel.", indicadores };
  return { texto: marcas, indicadores };
}

export function csvIndicadores(indicadores: VistaCentro = vistaCentro()): string {
  const filas: [string, string][] = [
    ["Viajes", indicadores.viajes],
    ["Camiones", indicadores.camiones],
    ["Clientes", indicadores.clientes],
    ["Documentos", indicadores.docs],
    ["GPS", "--"],
    ["Agentes", "--"],
    ["WhatsApp", "--"],
  ];
  const celda = (valor: string) => `"${valor.replace(/"/g, '""')}"`;
  return ["indicador,valor", ...filas.map(([nombre, valor]) => `${celda(nombre)},${celda(valor)}`)].join("\n");
}
