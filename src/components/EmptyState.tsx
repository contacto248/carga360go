import Link from "next/link";
import { PILOT_EMPTY_MESSAGE } from "@/lib/nearby";

export function EmptyState({
  kind,
  filtered,
  alert,
  pilot = false,
  nearby,
}: {
  kind: "cargas" | "camiones";
  filtered: boolean;
  alert: React.ReactNode;
  pilot?: boolean;
  nearby?: React.ReactNode;
}) {
  const isLoads = kind === "cargas";
  return (
    <div className="empty-state card">
      <div className="es-ic">{isLoads ? "📦" : "🚛"}</div>
      <h3>{filtered ? "No hay avisos con esos filtros por ahora" : isLoads ? "Todavía no hay cargas publicadas" : "Todavía no hay camiones publicados"}</h3>
      <p className="meta">
        Déjanos tu alerta y te avisamos por correo cuando aparezca una carga o un camión que calce. Si tú tienes el aviso
        contrario, publícalo: así empieza a haber oferta en esta ruta.
      </p>
      {pilot ? <p className="notice">{PILOT_EMPTY_MESSAGE}</p> : null}
      <div className="row" style={{ justifyContent: "center" }}>
        {alert}
        <Link className="btn sm" href={isLoads ? "/camiones/nuevo" : "/cargas/nueva"}>
          {isLoads ? "Publicar mi camión" : "Publicar mi carga"}
        </Link>
        {filtered ? (
          <Link className="btn sec sm" href={`/${kind}`}>
            {isLoads ? "Ver todas las cargas" : "Ver todos los camiones"}
          </Link>
        ) : null}
      </div>
      {nearby}
    </div>
  );
}
