import Link from "next/link";
import styles from "@/components/control/control.module.css";
import { formatClp, formatDateCL } from "@/lib/format";
import type { OpsPanelData, OpsPanelSection } from "@/lib/ops/panel";
import { EnlaceSeguimiento } from "./enlace-seguimiento";

const SECTIONS: { id: OpsPanelSection; label: string; icon: string }[] = [
  { id: "contratos", label: "Contratos y SLA", icon: "☰" },
  { id: "tarifas", label: "Tarifas", icon: "▤" },
  { id: "desempeno", label: "Desempeño", icon: "◈" },
  { id: "asignacion", label: "Asignación", icon: "⇄" },
  { id: "envios", label: "Envíos", icon: "▷" },
];

const STATUS: Record<string, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  vigente: "Vigente",
  vencido: "Vencido",
  vencida: "Vencida",
  terminado: "Terminado",
  anulada: "Anulada",
  propuesta: "Propuesta",
  en_cascada: "En cascada",
  confirmada: "Confirmada",
  agotada: "Agotada",
  cancelada: "Cancelada",
  propuesto: "Propuesto",
  invitado: "Invitado",
  acepto: "Aceptó",
  rechazo: "Rechazó",
  descartado: "Descartado",
  negociacion: "Negociación",
  asignacion: "Asignación",
  ejecucion: "Ejecución",
  pod: "POD",
  auditoria: "Auditoría",
  facturacion: "Facturación",
  pago: "Pago",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

const KIND: Record<string, string> = {
  contrato_marco: "Contrato marco",
  licitacion: "Licitación",
  spot: "Spot",
  por_viaje: "Por viaje",
  por_tonelada: "Por tonelada",
  por_km: "Por km",
  directa: "Directa",
  por_tarifa: "Por tarifa",
  por_desempeno: "Por desempeño",
  cascada: "Cascada",
};

const SLA: Record<string, string> = {
  retiro_a_tiempo: "Retiro a tiempo",
  entrega_a_tiempo: "Entrega a tiempo",
  tiempo_aceptacion: "Tiempo de aceptación",
  pod_en_plazo: "POD en plazo",
  documentos_al_dia: "Documentos al día",
};

function label(map: Record<string, string>, value: string) {
  return map[value] ?? value;
}

function tone(status: string) {
  if (["vigente", "confirmada", "acepto", "cerrado"].includes(status)) return "terminada";
  if (["borrador", "en_revision", "propuesta", "en_cascada", "propuesto", "invitado", "negociacion", "asignacion", "ejecucion", "pod", "auditoria", "facturacion", "pago"].includes(status)) return "en_curso";
  if (["cancelado", "cancelada", "agotada", "rechazo", "vencido", "vencida", "anulada", "terminado", "descartado"].includes(status)) return "cancelado";
  return status;
}

function when(value: string | null) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateCL(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
}

function money(value: number | null | undefined) {
  return value == null ? "—" : `$${formatClp(value)}`;
}

function short(value: string) {
  return value.slice(0, 8);
}

export function OpsBoard({ data, section }: { data: OpsPanelData; section: OpsPanelSection }) {
  const orgName = new Map(data.orgs.map((org) => [org.id, org.razonSocial]));
  const nameOf = (id: string | null | undefined) => (id ? (orgName.get(id) ?? data.names[id] ?? short(id)) : "—");
  const person = (id: string) => data.names[id] ?? short(id);
  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];
  const openRuns = data.runs.filter((run) => run.status === "propuesta" || run.status === "en_cascada").length;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Panel de operación">
        <Link className={styles.brand} href="/admin/ops">
          <span className={styles.mark}>
            O<span>PS</span>
          </span>
          <span>
            CARGA <b>360</b>
            <small>OPERACIÓN</small>
          </span>
        </Link>
        <div className={styles.companyLabel}>PANEL INTERNO</div>
        <div className={styles.companies} aria-label="Espacio">
          <Link aria-current="page" className={styles.companyActive} href="/admin/ops">
            CARGA360GO <span>↗</span>
          </Link>
        </div>
        <nav className={styles.navigation} aria-label="Secciones de operación">
          {SECTIONS.map((item) => (
            <Link key={item.id} href={`/admin/ops?seccion=${item.id}`} aria-current={section === item.id ? "page" : undefined} className={section === item.id ? styles.active : ""}>
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <span className={styles.dot} /> Sesión de administración
          <small>Solo administración de plataforma</small>
          <Link href="/admin">Volver a administración ↗</Link>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              CARGA360GO <span>/</span> {current.label}
            </p>
            <h1>Panel de operación</h1>
            <p className={styles.subtitle}>Contratos, tarifas, desempeño, propuestas de asignación y envíos. Los montos no salen a la web pública.</p>
          </div>
          <div className={styles.headerActions}>
            <span>
              Última lectura
              <br />
              <b>{when(data.generatedAt)} · Chile</b>
            </span>
            <Link className={styles.secondary} href={`/admin/ops?seccion=${section}`}>
              ↻ Actualizar
            </Link>
          </div>
        </header>

        <div className={styles.metrics}>
          <article className={styles.metric}>
            <div>
              <span>Contratos</span>
              <span className={styles.metricIcon} aria-hidden="true">☰</span>
            </div>
            <strong>{data.contracts.length.toLocaleString("es-CL")}</strong>
            <small>{data.contracts.filter((item) => item.status === "vigente").length.toLocaleString("es-CL")} vigentes</small>
          </article>
          <article className={styles.metric}>
            <div>
              <span>Tarifarios</span>
              <span className={styles.metricIcon} aria-hidden="true">▤</span>
            </div>
            <strong>{data.rateCards.length.toLocaleString("es-CL")}</strong>
            <small>{data.rateCards.filter((item) => item.status === "vigente").length.toLocaleString("es-CL")} vigentes</small>
          </article>
          <article className={styles.metric}>
            <div>
              <span>Puntajes</span>
              <span className={styles.metricIcon} aria-hidden="true">◈</span>
            </div>
            <strong>{data.scores.length.toLocaleString("es-CL")}</strong>
            <small>Privados de este panel</small>
          </article>
          <article className={styles.metric}>
            <div>
              <span>Propuestas</span>
              <span className={styles.metricIcon} aria-hidden="true">⇄</span>
            </div>
            <strong>{openRuns.toLocaleString("es-CL")}</strong>
            <small>{data.shipments.length.toLocaleString("es-CL")} envíos</small>
          </article>
        </div>

        {section === "contratos" ? (
          <>
            <div className={styles.sectionTitle}>
              <div>
                <h2>Contratos y SLA</h2>
                <p>Vigencia, versión y metas de servicio. El texto legal del contrato no lo redacta la plataforma.</p>
              </div>
            </div>
            {data.contracts.length === 0 ? (
              <div className={`${styles.panel} ${styles.empty}`}>
                <h3>Sin contratos</h3>
                <p>Cuando un mandante cargue un contrato, aparece aquí.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <caption>{data.contracts.length.toLocaleString("es-CL")} contratos</caption>
                  <thead>
                    <tr>
                      <th>Contrato</th>
                      <th>Mandante</th>
                      <th>Tipo</th>
                      <th>Vigencia</th>
                      <th>Estado</th>
                      <th>SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.contracts.map((contract) => (
                      <tr key={contract.id}>
                        <td>
                          <b>{contract.title}</b>
                          <small>Versión {contract.version}</small>
                        </td>
                        <td>
                          {nameOf(contract.shipperOrgId)}
                          <small>{nameOf(contract.carrierOrgId)}</small>
                        </td>
                        <td>{label(KIND, contract.kind)}</td>
                        <td>
                          {when(contract.validFrom)}
                          <small>hasta {when(contract.validTo)}</small>
                        </td>
                        <td>
                          <span className={styles.badge} data-state={tone(contract.status)}>
                            {label(STATUS, contract.status)}
                          </span>
                        </td>
                        <td>
                          {contract.slas.length === 0
                            ? "Sin SLA"
                            : contract.slas.map((sla) => (
                                <small key={sla.id}>
                                  {label(SLA, sla.metric)}: {sla.target} {sla.unit}
                                </small>
                              ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {section === "tarifas" ? (
          <>
            <div className={styles.sectionTitle}>
              <div>
                <h2>Tarifas</h2>
                <p>Montos en pesos chilenos, solo en este panel.</p>
              </div>
            </div>
            <p className={styles.notice}>Estos valores no se muestran en páginas públicas.</p>
            {data.rateCards.length === 0 ? (
              <div className={`${styles.panel} ${styles.empty}`}>
                <h3>Sin tarifarios</h3>
                <p>Los tarifarios vigentes y en borrador del mandante se listan aquí.</p>
              </div>
            ) : (
              data.rateCards.map((card) => (
                <section className={styles.panel} key={card.id} style={{ marginBottom: 16 }}>
                  <div className={styles.panelHead}>
                    <h2>{card.name}</h2>
                    <span className={styles.badge} data-state={tone(card.status)}>
                      {label(STATUS, card.status)}
                    </span>
                  </div>
                  <p className={styles.muted}>
                    {nameOf(card.shipperOrgId)} · versión {card.version} · {when(card.validFrom)} a {when(card.validTo)}
                  </p>
                  {card.lines.length === 0 ? (
                    <p className={styles.empty}>Sin líneas.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table>
                        <caption>Líneas de {card.name}</caption>
                        <thead>
                          <tr>
                            <th>Equipo</th>
                            <th>Clase</th>
                            <th>Tipo</th>
                            <th>Monto</th>
                            <th>Mínimo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {card.lines.map((line) => (
                            <tr key={line.id}>
                              <td>{line.equipment}</td>
                              <td>{line.vehicleClass ?? "—"}</td>
                              <td>{label(KIND, line.rateKind)}</td>
                              <td>{money(line.amountClp)}</td>
                              <td>{money(line.minChargeClp)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))
            )}
          </>
        ) : null}

        {section === "desempeno" ? (
          <>
            <div className={styles.sectionTitle}>
              <div>
                <h2>Desempeño</h2>
                <p>Puntaje privado. No se publica en la ficha del transportista.</p>
              </div>
            </div>
            {data.scores.length === 0 ? (
              <div className={`${styles.panel} ${styles.empty}`}>
                <h3>Sin puntajes</h3>
                <p>El cálculo bajo demanda deja aquí el período y la evidencia.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <caption>{data.scores.length.toLocaleString("es-CL")} puntajes</caption>
                  <thead>
                    <tr>
                      <th>Transportista</th>
                      <th>Período</th>
                      <th>Viajes</th>
                      <th>A tiempo</th>
                      <th>Cancelaciones</th>
                      <th>Puntaje</th>
                      <th>Nivel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scores.map((score) => (
                      <tr key={score.id}>
                        <td>
                          <b>{person(score.carrierUserId)}</b>
                          <small>{score.rulesVersion}</small>
                        </td>
                        <td>
                          {when(score.periodStart)}
                          <small>hasta {when(score.periodEnd)}</small>
                        </td>
                        <td>{score.tripsDone.toLocaleString("es-CL")}</td>
                        <td>{score.onTimePct == null ? "—" : `${score.onTimePct} %`}</td>
                        <td>{score.cancelCount.toLocaleString("es-CL")}</td>
                        <td>{Math.round(score.score).toLocaleString("es-CL")}</td>
                        <td>{score.level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {section === "asignacion" ? (
          <>
            <div className={styles.sectionTitle}>
              <div>
                <h2>Asignación</h2>
                <p>Propuestas y bitácora de cada paso. Confirmar sigue en manos de una persona.</p>
              </div>
            </div>
            {data.runs.length === 0 ? (
              <div className={`${styles.panel} ${styles.empty}`}>
                <h3>Sin propuestas</h3>
                <p>Cuando el motor deje una propuesta, la bitácora queda en esta pestaña.</p>
              </div>
            ) : (
              data.runs.map((run) => (
                <section className={styles.panel} key={run.id} style={{ marginBottom: 16 }}>
                  <div className={styles.panelHead}>
                    <h2>
                      {label(STATUS, run.status)} · {label(KIND, run.mode)}
                    </h2>
                    <span className={styles.tag}>{run.dryRun ? "Modo propuesta" : "Confirmada en el flujo"}</span>
                  </div>
                  <p className={styles.muted}>
                    Envío {short(run.shipmentId)} · {when(run.createdAt)} · {run.candidates.length.toLocaleString("es-CL")} candidatos
                  </p>
                  {run.candidates.length === 0 ? (
                    <p className={styles.empty}>Sin candidatos.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table>
                        <caption>Candidatos</caption>
                        <thead>
                          <tr>
                            <th>Orden</th>
                            <th>Transportista</th>
                            <th>Estado</th>
                            <th>Tarifa</th>
                            <th>Puntaje</th>
                            <th>Disponibilidad</th>
                            <th>Motivos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.candidates.map((candidate) => (
                            <tr key={candidate.id}>
                              <td>{candidate.rank}</td>
                              <td>{person(candidate.carrierUserId)}</td>
                              <td>
                                <span className={styles.badge} data-state={tone(candidate.status)}>
                                  {label(STATUS, candidate.status)}
                                </span>
                              </td>
                              <td>{money(candidate.rateClp)}</td>
                              <td>{candidate.score == null ? "—" : Math.round(candidate.score).toLocaleString("es-CL")}</td>
                              <td>{candidate.availability ?? "—"}</td>
                              <td>{candidate.reasons.join(" · ") || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <h3 style={{ marginTop: 18, fontSize: 16, fontWeight: 500 }}>Bitácora</h3>
                  {run.decisions.length === 0 ? (
                    <p className={styles.empty}>Sin pasos registrados.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table>
                        <caption>Decisiones del motor</caption>
                        <thead>
                          <tr>
                            <th>Paso</th>
                            <th>Acción</th>
                            <th>Quién</th>
                            <th>Resultado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.decisions.map((decision) => (
                            <tr key={decision.id}>
                              <td>{decision.seq}</td>
                              <td>{decision.step}</td>
                              <td>
                                {decision.decidedBy === "motor" ? "Motor" : person(decision.decidedBy)}
                                <small>{when(decision.createdAt)}</small>
                              </td>
                              <td>{summarize(decision.output)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))
            )}
          </>
        ) : null}

        {section === "envios" ? (
          <>
            <div className={styles.sectionTitle}>
              <div>
                <h2>Envíos</h2>
                <p>Etapa del viaje. La bitácora encadenada se consulta en la API de lectura.</p>
              </div>
            </div>
            {data.shipments.length === 0 ? (
              <div className={`${styles.panel} ${styles.empty}`}>
                <h3>Sin envíos</h3>
                <p>Cada carga con el módulo operativo deja un envío en esta lista.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <caption>{data.shipments.length.toLocaleString("es-CL")} envíos</caption>
                  <thead>
                    <tr>
                      <th>Envío</th>
                      <th>Mandante</th>
                      <th>Transportista</th>
                      <th>Etapa</th>
                      <th>Retiro</th>
                      <th>Entrega</th>
                      <th>Enlace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shipments.map((shipment) => (
                      <tr key={shipment.id}>
                        <td>
                          <b>{short(shipment.id)}</b>
                          <small>{shipment.loadId ? `Carga ${short(shipment.loadId)}` : "Sin carga"}</small>
                        </td>
                        <td>{nameOf(shipment.shipperOrgId)}</td>
                        <td>{nameOf(shipment.carrierOrgId)}</td>
                        <td>
                          <span className={styles.badge} data-state={tone(shipment.stage)}>
                            {label(STATUS, shipment.stage)}
                          </span>
                        </td>
                        <td>{when(shipment.plannedPickupAt)}</td>
                        <td>{when(shipment.plannedDeliveryAt)}</td>
                        <td>
                          <EnlaceSeguimiento shipmentId={shipment.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        <footer className={styles.footer}>
          <span>
            Operación <b>·</b> CARGA360GO
          </span>
          <span>Acceso privado · administración de plataforma</span>
        </footer>
      </div>
    </div>
  );
}

function summarize(value: unknown) {
  if (!value || typeof value !== "object") return "—";
  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}
