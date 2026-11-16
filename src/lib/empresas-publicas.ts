export const ESTADOS_EMPRESA = ["en_acreditacion", "certificada"] as const;

export type EstadoEmpresa = (typeof ESTADOS_EMPRESA)[number];

export type EmpresaInterna = {
  id: number;
  nombre: string;
  rut: string;
  direccion: string;
  telefono: string;
  mail: string;
  rubro: string;
  cargas_mes: string;
  estado: EstadoEmpresa;
};

type EmpresaPublicaBase = {
  id: number;
  nombre: string;
  rut: string;
  direccion: string;
  rubro: string;
};

export type EmpresaPublica =
  | (EmpresaPublicaBase & { estado: "en_acreditacion" })
  | (EmpresaPublicaBase & { estado: "certificada"; cargasMes: string });

export type VistaEmpresa = {
  id: number;
  nombre: string;
  rut: string;
  direccion: string;
  rubro: string;
  estado: EstadoEmpresa;
  badge: string;
  badgeClass: "pill ok" | "pill warn";
  sello: "4 documentos verificados" | null;
  cargasMes: string | null;
};

const CAMPOS_INTERNOS = new Set(["mail", "telefono", "email", "phone", "cert", "cargas_mes"]);

function esRegistro(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function texto(row: Record<string, unknown>, key: string, index: number): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`empresa ${index + 1}: ${key} inválido`);
  }
  return value;
}

function esEstado(value: unknown): value is EstadoEmpresa {
  return value === "en_acreditacion" || value === "certificada";
}

export function parseEmpresaInterna(value: unknown, index: number): EmpresaInterna {
  if (!esRegistro(value)) throw new Error(`empresa ${index + 1} inválida`);
  if ("cert" in value) throw new Error(`empresa ${index + 1}: usa cert; el campo vigente es estado`);
  const id = value.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    throw new Error(`empresa ${index + 1}: id inválido`);
  }
  if (!esEstado(value.estado)) throw new Error(`empresa ${index + 1}: estado inválido`);
  const mail = texto(value, "mail", index);
  if (!mail.includes("@")) throw new Error(`empresa ${index + 1}: mail inválido`);
  const estado = value.estado;
  const empresa: EmpresaInterna = {
    id,
    nombre: texto(value, "nombre", index),
    rut: texto(value, "rut", index),
    direccion: texto(value, "direccion", index),
    telefono: texto(value, "telefono", index),
    mail,
    rubro: texto(value, "rubro", index),
    cargas_mes: texto(value, "cargas_mes", index),
    estado,
  };
  switch (empresa.estado) {
    case "en_acreditacion":
    case "certificada":
      return empresa;
    default: {
      const unexpected: never = empresa.estado;
      throw new Error(`estado no soportado: ${String(unexpected)}`);
    }
  }
}

export function toEmpresaPublica(empresa: EmpresaInterna): EmpresaPublica {
  const base: EmpresaPublicaBase = {
    id: empresa.id,
    nombre: empresa.nombre,
    rut: empresa.rut,
    direccion: empresa.direccion,
    rubro: empresa.rubro,
  };
  switch (empresa.estado) {
    case "certificada":
      return { ...base, estado: "certificada", cargasMes: empresa.cargas_mes };
    case "en_acreditacion":
      return { ...base, estado: "en_acreditacion" };
    default: {
      const unexpected: never = empresa.estado;
      throw new Error(`estado no soportado: ${String(unexpected)}`);
    }
  }
}

function rechazarClavesInternas(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rechazarClavesInternas(item);
    return;
  }
  if (!esRegistro(value)) return;
  for (const key of Object.keys(value)) {
    if (CAMPOS_INTERNOS.has(key)) throw new Error(`campo interno expuesto: ${key}`);
    const child = value[key];
    if (typeof child === "string" && child.includes("@")) {
      throw new Error("el payload público contiene un correo");
    }
    rechazarClavesInternas(child);
  }
}

export function assertPayloadPublico(payload: unknown, secretos: readonly string[]): void {
  rechazarClavesInternas(payload);
  const blob = JSON.stringify(payload);
  for (const secreto of secretos) {
    if (secreto && blob.includes(secreto)) {
      throw new Error("un dato interno de contacto quedó en el payload público");
    }
  }
}

export function vistaEmpresa(empresa: EmpresaPublica): VistaEmpresa {
  const base = {
    id: empresa.id,
    nombre: empresa.nombre,
    rut: empresa.rut,
    direccion: empresa.direccion,
    rubro: empresa.rubro,
    estado: empresa.estado,
  };
  switch (empresa.estado) {
    case "certificada":
      return {
        ...base,
        estado: "certificada",
        badge: "EMPRESA CERTIFICADA BASSAM 360",
        badgeClass: "pill ok",
        sello: "4 documentos verificados",
        cargasMes: empresa.cargasMes,
      };
    case "en_acreditacion":
      return {
        ...base,
        estado: "en_acreditacion",
        badge: "EN PROCESO DE ACREDITACIÓN BASSAM 360",
        badgeClass: "pill warn",
        sello: null,
        cargasMes: null,
      };
    default: {
      const unexpected: never = empresa;
      throw new Error(`estado no soportado: ${String(unexpected)}`);
    }
  }
}
