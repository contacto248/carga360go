"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { COMPANY_NAMES, LABELS, SERVICE_STATES, TASK_STATES, type Service, type Snapshot, type Task } from "@/lib/control/types";
import styles from "./control.module.css";

type Section = "resumen" | "operaciones" | "tareas" | "integraciones" | "actividad";
const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "resumen", label: "Vista general", icon: "◈" }, { id: "operaciones", label: "Operaciones", icon: "⇄" },
  { id: "tareas", label: "Tareas y soporte", icon: "☷" }, { id: "integraciones", label: "Agentes y conexiones", icon: "◇" },
  { id: "actividad", label: "Actividad y auditoría", icon: "◷" },
];
const CARGO_MODULES = [
  ["Usuarios y documentos", "Aprobación de cuentas, documentos y correos.", "/admin"],
  ["Acreditación", "Revisión de transportistas y vencimientos.", "/admin/transportistas"],
  ["Ofertas y adjudicaciones", "Gestión del mercado y sus condiciones.", "/admin/ofertas"],
  ["Cotizador y costos", "Fuentes, parámetros y revisión de cotizaciones.", "/admin/costos"],
  ["Agente comercial", "Conversaciones, solicitudes y herramientas.", "/admin/agente"],
  ["WhatsApp", "Conversaciones, pausas y derivaciones.", "/admin/whatsapp"],
  ["Chat web", "Atención desde la plataforma.", "/admin/chat"],
  ["Auditoría de plataforma", "Registro de las acciones administrativas.", "/admin/auditoria"],
  ["BASSAM 360", "Torre de control, autorizaciones e informe con datos reales.", "/admin/bassam"],
] as const;

function stamp(value: string) { return new Date(value).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }); }
function fieldValue(form: HTMLFormElement, name: string) { return String(new FormData(form).get(name) || ""); }

export function ControlCenter({ initial }: { initial: Snapshot }) {
  const [data, setData] = useState(initial);
  const [section, setSection] = useState<Section>("resumen");
  const [task, setTask] = useState<Task | "new" | null>(null);
  const [service, setService] = useState<Service | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("abiertas");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const cargo = data.company === "carga360go";
  const company = COMPANY_NAMES[data.company];
  const pending = data.tasks.filter(t => !["terminada", "archivada"].includes(t.status));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(new Date());
  const overdue = pending.filter(t => t.due && t.due < today).length;
  const filtered = data.tasks.filter(t => (status === "todas" || (status === "abiertas" ? !["terminada", "archivada"].includes(t.status) : t.status === status)) && `${t.title} ${t.owner}`.toLocaleLowerCase("es-CL").includes(query.toLocaleLowerCase("es-CL")));

  async function load() {
    const response = await fetch(`/api/admin/control?company=${data.company}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo actualizar el centro de control.");
    setData(payload);
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { await load(); setMessage("Datos actualizados desde el servidor."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>, kind: "task" | "service") {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const selected = kind === "task" ? task : service;
    const editing = selected && selected !== "new" ? selected : null;
    const common = { company: data.company, kind, id: editing?.id, revision: editing?.revision, title: fieldValue(form, "title"), owner: fieldValue(form, "owner"), due: fieldValue(form, "due"), status: fieldValue(form, "status") };
    const body = kind === "task" ? { ...common, priority: fieldValue(form, "priority"), evidence: fieldValue(form, "evidence") } : { ...common, customer: fieldValue(form, "customer"), equipment: fieldValue(form, "equipment"), origin: fieldValue(form, "origin"), destination: fieldValue(form, "destination"), notes: fieldValue(form, "notes") };
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/control", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar.");
      setTask(null); setService(null);
      setMessage("Guardado en el servidor y registrado en auditoría.");
      try { await load(); } catch { setError("El cambio se guardó, pero no se pudo actualizar la lista. Pulsa Actualizar datos."); }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { lock.current = false; setBusy(false); }
  }
  function navigate(next: Section) { setSection(next); setTask(null); setService(null); setError(""); setMessage(""); }
  const editing = task && task !== "new" ? task : service && service !== "new" ? service : null;
  const kind = task ? "task" : "service";

  return <div className={styles.shell} data-b360="true">
    <aside className={styles.sidebar} aria-label="Centro de control">
      <Link className={styles.brand} href="/admin/control"><span className={styles.mark}>B<span>360</span></span><span>BASSAM <b>360</b><small>CONTROL INTELIGENTE</small></span></Link>
      <div className={styles.companyLabel}>ESPACIOS DE EMPRESA</div>
      <div className={styles.companies} aria-label="Seleccionar empresa">
        <Link aria-current={!cargo ? "page" : undefined} className={!cargo ? styles.companyActive : ""} href="/admin/control?empresa=bassam">BASSAM SPA <span>↗</span></Link>
        <Link aria-current={cargo ? "page" : undefined} className={cargo ? styles.companyActive : ""} href="/admin/control?empresa=carga360go">CARGA360GO <span>↗</span></Link>
      </div>
      <nav className={styles.navigation} aria-label="Secciones del centro">
        {SECTIONS.map(s => <button type="button" key={s.id} aria-current={section === s.id ? "page" : undefined} className={section === s.id ? styles.active : ""} onClick={() => navigate(s.id)}><span aria-hidden="true">{s.icon}</span>{s.label}</button>)}
      </nav>
      <div className={styles.sidebarFoot}><span className={styles.dot} /> Sesión de administración<small>Datos separados por empresa</small><Link href="/">Volver a CARGA360GO ↗</Link></div>
    </aside>
    <div className={styles.main}>
      <header className={styles.header}><div><p className={styles.eyebrow}>{company} <span>/</span> {SECTIONS.find(s => s.id === section)?.label}</p><h1>Centro de control inteligente</h1><p className={styles.subtitle}>Operaciones, equipo y decisiones en un solo lugar.</p></div><div className={styles.headerActions}><span>Última lectura<br /><b>{stamp(data.generatedAt)} · Chile</b></span><button className={styles.secondary} type="button" disabled={busy} onClick={refresh}>{busy ? "Actualizando…" : "↻ Actualizar datos"}</button></div></header>
      <div aria-live="polite">{message ? <p className={styles.success} role="status">{message}</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}</div>

      {section === "resumen" ? <>
        <div className={styles.metrics}>{data.metrics.map((m, index) => <article className={styles.metric} key={m.label}><div><span>{m.label}</span><span className={styles.metricIcon} aria-hidden="true">{["⇄", "▱", "◇", "☷"][index]}</span></div><strong>{m.value.toLocaleString("es-CL")}</strong><small>{m.detail}</small></article>)}</div>
        <div className={styles.overview}>
          <section className={`${styles.panel} ${styles.routes}`}><div className={styles.panelHead}><h2>{cargo ? "Actividad por corredor" : "Operación BASSAM SPA"}</h2><span className={styles.tag}>{cargo ? "Avisos vigentes" : "Registros propios"}</span></div>
            {cargo ? <><p className={styles.muted}>Publicaciones en ambos sentidos. Estas cifras miden oferta visible; no la demanda total del mercado.</p>{data.corridors.map(c => <div className={styles.corridor} key={c.name}><div><strong>{c.name}</strong><span>{c.loads} cargas · {c.trucks} camiones</span></div><div className={styles.track}><span style={{ width: `${(c.loads + c.trucks) / Math.max(1, ...data.corridors.map(x => x.loads + x.trucks)) * 100}%` }} /></div></div>)}<Link className={styles.textLink} href="/regiones">Consultar cobertura y actividad ↗</Link></> : <><p className={styles.muted}>Registra solicitudes de transporte, arriendo de maquinaria y servicios en terreno.</p><div className={styles.emptyIllustration} aria-hidden="true">⇄</div><p>{data.services.length ? `${data.services.length} servicio(s) registrados en este espacio.` : "Todavía no hay servicios registrados."}</p><button className={styles.primary} onClick={() => navigate("operaciones")}>Gestionar servicios →</button></>}
          </section>
          <section className={styles.panel}><div className={styles.panelHead}><h2>Prioridades del equipo</h2><button className={styles.textButton} onClick={() => navigate("tareas")}>Ver todas →</button></div><p className={styles.muted}>{pending.length} tareas abiertas · {overdue} con fecha vencida</p><div className={styles.taskPreview}>{pending.length ? pending.slice(0, 4).map(t => <button key={t.id} onClick={() => { navigate("tareas"); setTask(t); }}><span><b>{t.title}</b><small>{t.owner || "Sin responsable"} · {t.due || "Sin fecha"}</small></span><span className={styles.badge} data-state={t.status}>{LABELS[t.status]}</span></button>) : <p className={styles.empty}>No hay tareas abiertas. Puedes crear el plan de esta empresa.</p>}</div></section>
          <section className={styles.panel}><div className={styles.panelHead}><h2>Conexiones y agentes</h2><button className={styles.textButton} onClick={() => navigate("integraciones")}>Revisar →</button></div>{data.integrations.slice(0, 4).map(i => <div className={styles.connection} key={i.name}><span>{i.name}</span><span className={styles.tag}>{i.state}</span></div>)}<p className={styles.muted}>El estado muestra la configuración del servidor. Las pruebas de conexión y recepción se validan por separado.</p></section>
          <section className={styles.panel}><div className={styles.panelHead}><h2>Seguimiento de viajes</h2><span className={styles.tag}>Probada en test</span></div><div className={styles.gps}><span aria-hidden="true">◎</span><div><h3>Ubicación desde el teléfono</h3><p>La API guarda latitud, longitud y hora solo de un viaje autorizado. No hay dispositivo en terreno: no está operativa y esta torre no inventa posiciones.</p></div></div><Link className={styles.secondary} href="/admin/bassam">Abrir BASSAM 360</Link></section>
        </div>
      </> : null}

      {section === "operaciones" ? <>
        {cargo ? <><div className={styles.sectionTitle}><div><h2>Administración CARGA360GO</h2><p>Accede a los módulos operativos de la plataforma.</p></div></div><div className={styles.modules}>{CARGO_MODULES.map(([name, description, href]) => <Link className={styles.module} key={href} href={href}><span aria-hidden="true">↗</span><h3>{name}</h3><p>{description}</p><small>Abrir módulo →</small></Link>)}</div></> : <><div className={styles.sectionTitle}><div><h2>Servicios BASSAM SPA</h2><p>Solicitudes, arriendos y transporte. Guardado compartido en el servidor.</p></div><button className={styles.primary} disabled={busy} onClick={() => { setService("new"); setTask(null); setError(""); }}>+ Nuevo servicio</button></div>{data.services.length ? <div className={styles.tableWrap}><table><caption>Servicios registrados de BASSAM SPA</caption><thead><tr><th>Servicio / cliente</th><th>Ruta y equipo</th><th>Responsable / fecha</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.services.map(s => <tr key={s.id}><td><b>{s.title}</b><small>{s.customer}</small></td><td>{s.origin || "—"} → {s.destination || "—"}<small>{s.equipment || "Sin equipo"}</small></td><td>{s.owner || "Sin asignar"}<small>{s.due || "Sin fecha"}</small></td><td><span className={styles.badge} data-state={s.status}>{LABELS[s.status]}</span></td><td><button className={styles.secondary} onClick={() => { setService(s); setTask(null); setError(""); }}>Gestionar</button></td></tr>)}</tbody></table></div> : <div className={`${styles.panel} ${styles.empty}`}><h3>Comienza con tu primer servicio</h3><p>Los servicios BASSAM SPA se registran aquí y no se mezclan con las cargas de CARGA360GO.</p></div>}</>}
      </> : null}

      {section === "tareas" ? <>
        <div className={styles.sectionTitle}><div><h2>Tareas y soporte</h2><p>{company} · Responsables, fechas y evidencia de cierre.</p></div><button className={styles.primary} disabled={busy} onClick={() => { setTask("new"); setService(null); setError(""); }}>+ Nueva tarea</button></div>
        {cargo ? <p className={styles.notice}>Las ocho tareas iniciales tienen responsables por función y fechas propuestas. Confirma las asignaciones con el equipo; no se han enviado notificaciones.</p> : null}
        <div className={styles.filters}><label>Buscar tarea o responsable<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…" /></label><label>Estado<select value={status} onChange={e => setStatus(e.target.value)}><option value="abiertas">Todas las abiertas</option><option value="todas">Todos los estados</option>{TASK_STATES.map(s => <option key={s} value={s}>{LABELS[s]}</option>)}</select></label><a className={styles.secondary} href={`/api/admin/control?company=${data.company}&export=1`}>Descargar respaldo JSON ↓</a></div>
        <div className={styles.tableWrap}><table><caption>{filtered.length} tareas en {company}</caption><thead><tr><th>Tarea</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th><th>Prioridad</th><th>Acción</th></tr></thead><tbody>{filtered.map(t => <tr key={t.id}><td><b>{t.title}</b><small>Actualizada {stamp(t.updatedAt)}</small></td><td>{t.owner || "Sin asignar"}</td><td className={t.due && t.due < today && !["terminada", "archivada"].includes(t.status) ? styles.overdue : ""}>{t.due || "Sin fecha"}</td><td><span className={styles.badge} data-state={t.status}>{LABELS[t.status]}</span></td><td>{t.priority}</td><td><button className={styles.secondary} onClick={() => { setTask(t); setService(null); setError(""); }}>Editar</button></td></tr>)}</tbody></table>{!filtered.length ? <p className={styles.empty}>No hay tareas que coincidan con estos filtros.</p> : null}</div>
      </> : null}

      {section === "integraciones" ? <><div className={styles.sectionTitle}><div><h2>Agentes y conexiones</h2><p>Configuración de {company}, sin exponer claves ni credenciales.</p></div></div><div className={styles.modules}>{data.integrations.map(i => <article key={i.name} className={styles.module}><span className={styles.tag}>{i.state}</span><h3>{i.name}</h3><p>{i.detail}</p>{i.href ? <a className={styles.textLink} href={i.href} {...(i.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Abrir administración ↗</a> : null}</article>)}</div></> : null}

      {section === "actividad" ? <><div className={styles.sectionTitle}><div><h2>Actividad y auditoría</h2><p>Últimos 12 eventos del centro de control para {company}.</p></div><a className={styles.secondary} href={`/api/admin/control?company=${data.company}&export=1`}>Exportar datos ↓</a></div><section className={styles.panel}>{data.activity.length ? data.activity.map((a, index) => <div className={styles.activity} key={`${a.at}-${index}`}><span className={styles.dot} /><div><b>{a.action.replace("control.task.", "Tarea: ").replace("control.service.", "Servicio: ").replace("control.plan_inicial", "Plan inicial registrado")}</b><small>{a.actor} · {stamp(a.at)} Chile</small></div></div>) : <p className={styles.empty}>Todavía no hay acciones registradas para esta empresa.</p>}</section></> : null}

      {task || service ? <section className={styles.editor} aria-labelledby="b360-editor-title" key={editing?.id || kind}>
        <div className={styles.panelHead}><h2 id="b360-editor-title">{editing ? "Editar" : "Crear"} {kind === "task" ? "tarea" : "servicio"} · {company}</h2><button type="button" className={styles.secondary} disabled={busy} onClick={() => { setTask(null); setService(null); }}>Cerrar</button></div>
        <form onSubmit={event => save(event, kind)} className={styles.form}>
          <label className={styles.wide}>Título<input name="title" maxLength={160} required defaultValue={editing?.title || ""} /></label>
          {kind === "service" ? <><label>Cliente / empresa<input name="customer" required maxLength={160} defaultValue={(editing as Service)?.customer || ""} /></label><label>Equipo<input name="equipment" maxLength={100} defaultValue={(editing as Service)?.equipment || ""} /></label><label>Origen<input name="origin" maxLength={160} defaultValue={(editing as Service)?.origin || ""} /></label><label>Destino<input name="destination" maxLength={160} defaultValue={(editing as Service)?.destination || ""} /></label></> : null}
          <label>Responsable<input name="owner" maxLength={100} defaultValue={editing?.owner || ""} placeholder="Nombre o función del equipo" /></label><label>Fecha límite<input name="due" type="date" defaultValue={editing?.due || ""} /></label>
          <label>Estado<select name="status" defaultValue={editing?.status || (kind === "task" ? "pendiente" : "nuevo")}>{(kind === "task" ? TASK_STATES : SERVICE_STATES).map(s => <option key={s} value={s}>{LABELS[s]}</option>)}</select></label>
          {kind === "task" ? <label>Prioridad<select name="priority" defaultValue={(editing as Task)?.priority || "media"}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label> : null}
          <label className={styles.wide}>{kind === "task" ? "Evidencia, resultado y próximos pasos" : "Notas del servicio"}<textarea name={kind === "task" ? "evidence" : "notes"} rows={4} maxLength={3000} defaultValue={kind === "task" ? (editing as Task)?.evidence || "" : (editing as Service)?.notes || ""} /></label>
          <p className={`${styles.muted} ${styles.wide}`}>{kind === "task" ? "Para marcar Terminada se exige responsable y evidencia. Archivar conserva el registro y permite reabrirlo." : "Registrar un servicio no envía una cotización ni contacta al cliente."} No guardes contraseñas ni claves aquí.</p>
          {error ? <p className={`${styles.error} ${styles.wide}`} role="alert">{error}</p> : null}
          <div className={styles.wide}><button type="submit" className={styles.primary} disabled={busy}>{busy ? "Guardando…" : "Guardar en el servidor"}</button></div>
        </form>
      </section> : null}
      <footer className={styles.footer}><span>BASSAM 360 <b>·</b> {company}</span><span>Acceso privado · Fuente: base de datos de este entorno</span></footer>
    </div>
  </div>;
}
