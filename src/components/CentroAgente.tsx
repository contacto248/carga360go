"use client";

const ACCESOS = ["Consultar documentos", "Guía de acreditación", "Estado de la cuenta"] as const;

function abrir() {
  window.dispatchEvent(new Event("c360-abrir-agente"));
}

export function CentroAgente({ estado }: { estado: "Por verificar" }) {
  return (
    <div>
      <p>Estado: {estado}</p>
      <div>
        {ACCESOS.map((etiqueta) => (
          <button key={etiqueta} type="button" onClick={abrir}>
            Agente BASSAM 360 · {etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
