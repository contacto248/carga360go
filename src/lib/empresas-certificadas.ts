import { readFileSync } from "node:fs";
import path from "node:path";
import { assertPayloadPublico, parseEmpresaInterna, toEmpresaPublica, type EmpresaPublica } from "./empresas-publicas";

export { vistaEmpresa } from "./empresas-publicas";
export type { EmpresaPublica, EstadoEmpresa, VistaEmpresa } from "./empresas-publicas";

// /data está en .gitignore (sqlite, uploads y backups) y public/ se descarga tal cual.
// El padrón versionado vive en src/data. Este módulo lo lee solo en el servidor.
const ARCHIVO = path.join(process.cwd(), "src/data/empresasCertificadasCarga360.json");

export function listEmpresasPublicas(): EmpresaPublica[] {
  const raw: unknown = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  if (!Array.isArray(raw)) throw new Error("el padrón de empresas debe ser un arreglo");
  const internas = raw.map((item, index) => parseEmpresaInterna(item, index));
  const ids = new Set<number>();
  for (const empresa of internas) {
    if (ids.has(empresa.id)) throw new Error(`id duplicado: ${empresa.id}`);
    ids.add(empresa.id);
  }
  const secretos = internas.flatMap((empresa) => [empresa.mail, empresa.telefono]);
  const publicas = internas.map(toEmpresaPublica);
  assertPayloadPublico(publicas, secretos);
  return publicas;
}
