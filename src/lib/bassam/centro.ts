import { getDb } from "../db";
import { conteosControl } from "./acreditacion";

export type Marca = string;

/** Un número mayor que cero es un conteo real. Cero o una tabla ausente no es un dato que mostrar. */
export function marcaConteo(valor: string): Marca {
  if (!/^\d+$/.test(valor) || valor === "0") return "--";
  return valor;
}

function conteoSiExiste(tabla: string, where?: string): Marca {
  const db = getDb();
  const existe = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tabla);
  if (!existe) return "--";
  try {
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}${where ? ` WHERE ${where}` : ""}`).get() as { n: number }).n;
    if (!Number.isInteger(n) || n < 0) return "--";
    return marcaConteo(String(n));
  } catch {
    return "--";
  }
}

export type VistaCentro = {
  cargas: Marca;
  camiones: Marca;
  documentos: Marca;
  agente: Marca;
  clientes: Marca;
  cotizador: Marca;
  tareas: Marca;
  agenteEstado: "Por verificar";
};

/** Lectura para el centro. No escribe y no mira el token de WhatsApp. */
export function vistaCentro(): VistaCentro {
  const base = conteosControl();
  return {
    cargas: marcaConteo(base.cargas),
    camiones: marcaConteo(base.camiones),
    documentos: marcaConteo(base.documentos),
    agente: marcaConteo(base.agente),
    clientes: conteoSiExiste("users", "role IN ('transportista', 'mandante')"),
    cotizador: conteoSiExiste("cost_quotes"),
    tareas: "--",
    agenteEstado: "Por verificar",
  };
}
