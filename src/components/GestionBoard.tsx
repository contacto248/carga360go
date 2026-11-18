import React from "react";
import { dato, SIN_DATOS, type GestionSnapshot } from "@/lib/gestion/types";

function Valor({ n, hay }: { n: number; hay: boolean }) {
  const text = dato(n, hay);
  return <strong className={text === SIN_DATOS ? "gestion-sin" : undefined}>{text}</strong>;
}

/** Tablero interno. Si el grupo no tiene filas muestra [sin datos]. */
export function GestionBoard({ snap }: { snap: GestionSnapshot }) {
  const alertasHay = snap.alertasEnviadas + snap.alertasGuardadas + snap.alertasOps + snap.documentosPorVencer > 0;
  return (
    <div className="gestion" aria-label="Control de gestión">
      <p className="meta">Calculado de la base · {snap.generatedAt.slice(0, 16).replace("T", " ")} UTC</p>
      <div className="gestion-grid">
        <article className="card gestion-card">
          <h2>Cargas por estado</h2>
          {snap.cargasTotal === 0 ? (
            <Valor n={0} hay={false} />
          ) : (
            <ul>
              {snap.cargasPorEstado.map((row) => (
                <li key={row.estado}>
                  {row.label}: <Valor n={row.n} hay />
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="card gestion-card">
          <h2>Viajes</h2>
          {snap.viajesTotal === 0 ? (
            <Valor n={0} hay={false} />
          ) : (
            <ul>
              {snap.viajes.map((row) => (
                <li key={row.estado}>
                  {row.label}: <Valor n={row.n} hay />
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="card gestion-card">
          <h2>Transportistas activos</h2>
          <p className="meta">Cuenta verificada y sin bloqueo.</p>
          <Valor n={snap.transportistasActivos} hay={snap.transportistasActivos > 0} />
        </article>
        <article className="card gestion-card">
          <h2>Camiones activos</h2>
          <p className="meta">Disponibles hoy o después, sin avisos de demostración.</p>
          <Valor n={snap.camionesActivos} hay={snap.camionesActivos > 0} />
        </article>
        <article className="card gestion-card">
          <h2>Leads del agente</h2>
          {snap.leadsTotal === 0 ? (
            <Valor n={0} hay={false} />
          ) : (
            <ul>
              {snap.leads.map((row) => (
                <li key={row.estado}>
                  {row.label}: <Valor n={row.n} hay />
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="card gestion-card">
          <h2>Cargas de retorno</h2>
          <Valor n={snap.retornos} hay={snap.retornos > 0} />
          {snap.retornoMuestras.length > 0 ? (
            <ul>
              {snap.retornoMuestras.map((row) => (
                <li key={row.loadId}>
                  {row.route} · {row.camiones} {row.camiones === 1 ? "camión" : "camiones"}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
        <article className="card gestion-card">
          <h2>Sugerencias compatibles</h2>
          <Valor n={snap.compatibles} hay={snap.compatibles > 0} />
        </article>
        <article className="card gestion-card">
          <h2>Alertas</h2>
          {alertasHay ? (
            <ul>
              <li>
                Enviadas: <Valor n={snap.alertasEnviadas} hay />
              </li>
              <li>
                Guardadas: <Valor n={snap.alertasGuardadas} hay />
              </li>
              <li>
                OPS abiertas: <Valor n={snap.alertasOps} hay />
              </li>
              <li>
                Documentos por vencer: <Valor n={snap.documentosPorVencer} hay />
              </li>
            </ul>
          ) : (
            <Valor n={0} hay={false} />
          )}
        </article>
      </div>
    </div>
  );
}

