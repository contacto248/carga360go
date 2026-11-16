import fs from "fs";
import path from "path";

export type EmpresaPublica = {
  nombre: string;
  rut: string;
  direccion: string;
  rubro: string;
  estado: "en_acreditacion";
  rol: "mandante";
};

type FilaPublica = {
  nombre?: unknown;
  rut?: unknown;
  direccion?: unknown;
  rubro?: unknown;
  estado?: unknown;
};

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** Solo nombre, RUT, dirección y rubro. El archivo no trae correo ni teléfono. */
export function listarEmpresasPublicas(): EmpresaPublica[] {
  const archivo = path.join(process.cwd(), "src/lib/empresas-gerencia.json");
  const filas = JSON.parse(fs.readFileSync(archivo, "utf8")) as FilaPublica[];
  if (!Array.isArray(filas)) return [];
  return filas.map((fila) => {
    const claves = Object.keys(fila);
    if (claves.some((clave) => clave === "mail" || clave === "telefono" || clave === "cargas_mes" || clave === "cert")) {
      throw new Error("El directorio público no admite contacto ni volumen.");
    }
    const nombre = texto(fila.nombre);
    const rut = texto(fila.rut);
    const direccion = texto(fila.direccion);
    const rubro = texto(fila.rubro);
    if (!nombre || !rut || !direccion || !rubro || fila.estado !== "en_acreditacion") {
      throw new Error("Falta un dato público de la empresa.");
    }
    return { nombre, rut, direccion, rubro, estado: "en_acreditacion", rol: "mandante" };
  });
}
