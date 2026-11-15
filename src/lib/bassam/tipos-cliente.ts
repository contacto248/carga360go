export const TIPOS_CLIENTE = ["transportista", "mandante"] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];

export const DOCUMENTOS_POR_CLIENTE = {
  transportista: [
    { id: "licencia", label: "Licencia" },
    { id: "padron", label: "Padrón" },
    { id: "soap", label: "SOAP" },
    { id: "seguro_obligatorio", label: "Seguro obligatorio" },
    { id: "seguro_carga", label: "Seguro de carga" },
  ],
  mandante: [
    { id: "rut_empresa", label: "RUT empresa" },
    { id: "erut_sii", label: "e-RUT SII" },
    { id: "escritura_representante", label: "Escritura del representante legal" },
    { id: "certificado_cuenta_bancaria", label: "Certificado de cuenta bancaria a nombre de la empresa" },
  ],
} as const;

export function tiposDe(cliente: TipoCliente): readonly string[] {
  return DOCUMENTOS_POR_CLIENTE[cliente].map((item) => item.id);
}

export function prefijoRevision(cliente: TipoCliente): "Revisión IA" | "Revisión IA Empresa" {
  return cliente === "mandante" ? "Revisión IA Empresa" : "Revisión IA";
}
