import React from "react";

/** Destino aún no confirmado: el botón no navega. */
export function DestinoOff({ children }: { children: string }) {
  return (
    <button type="button" className="btn sec" disabled>
      {children}
    </button>
  );
}
