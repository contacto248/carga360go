import { getDb } from "./db";

export type EmpresaPublica = {
  nombre: string;
  rut: string;
  direccion: string;
  rubro: string;
};

type FilaEmpresa = EmpresaPublica & {
  email: string;
  telefono: string;
};

/** Contacto que no sale al navegador. Vive solo en este módulo de servidor. */
const contactoEnServidor: { email: string; telefono: string }[] = [];

function marca(valor: string | null | undefined): string {
  const texto = valor?.trim();
  return texto ? texto : "--";
}

/** Mandantes reales. El rubro no está en la base, así que queda en --. */
export function listarEmpresasPublicas(): EmpresaPublica[] {
  const db = getDb();
  const tabla = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get();
  if (!tabla) return [];
  let filas: FilaEmpresa[];
  try {
    filas = db
      .prepare(
        `SELECT razon_social AS nombre, rut, city AS direccion, email, whatsapp AS telefono
         FROM users WHERE role = 'mandante' ORDER BY razon_social`,
      )
      .all() as FilaEmpresa[];
  } catch {
    return [];
  }
  contactoEnServidor.length = 0;
  const publicas: EmpresaPublica[] = [];
  for (const fila of filas) {
    contactoEnServidor.push({ email: fila.email, telefono: fila.telefono });
    publicas.push({
      nombre: marca(fila.nombre),
      rut: marca(fila.rut),
      direccion: marca(fila.direccion),
      rubro: "--",
    });
  }
  return publicas;
}
