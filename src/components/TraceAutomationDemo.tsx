/** Esquema corto de lo que el código registra hoy. No simula un viaje. */

const PASOS = [
  ["01", "Publicar", "Origen, destino, fecha y equipo de la carga o del camión."],
  ["02", "Costo de referencia", "Ruta, peajes por ejes, diésel y operación. Es referencial; el valor lo cierran las partes."],
  ["03", "Match ÓRBITA", "Compara equipo, capacidad, ruta y fechas. No adjudica por sí solo."],
  ["04", "Oferta", "El contacto sigue oculto en el listado hasta que una oferta se adjudica."],
  ["05", "Registro", "Publicación, ofertas, adjudicación y estado quedan con fecha y hora."],
] as const;

export function TraceAutomationDemo() {
  return (
    <div className="tech-demo is-compact" aria-label="Demostración de trazabilidad">
      <div className="tech-demo-head">
        <span className="tech-demo-badge">Demostración</span>
        <strong>Lo que el sistema registra</strong>
        <p>Ejemplo DEMO-SEG. No corresponden a cargas, camiones ni usuarios reales. No hay seguimiento GPS en esta vista.</p>
      </div>
      <ol className="tech-compact">
        {PASOS.map(([n, title, text]) => (
          <li key={n}>
            <span>{n}</span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
