"use client";

import { useState } from "react";
import "./paneles.css";

/**
 * Vista conceptual en rama aislada. No consulta datos reales ni permite ejecutar
 * operaciones. Los paneles productivos y sus integraciones permanecen intactos.
 */
const views = [
  {
    label: "Acceso público", eyebrow: "01 / Atención general",
    title: "La logística entra en una nueva dimensión.",
    intro: "Una puerta de entrada clara para conocer Carga360go, resolver dudas y comenzar el proceso de registro.",
    metrics: [["Orientación", "General"], ["Datos de contacto", "Con consentimiento"], ["Acceso", "Público"]],
    items: [["Conocer la plataforma", "Información y preguntas frecuentes"], ["Registro inicial", "Nombre, RUT, teléfono y correo"], ["Solicitar transporte", "Ingreso al flujo existente"]],
    agent: "Asistente de atención general", detail: "Orienta a nuevos visitantes, responde consultas y guía al formulario de contacto existente."
  },
  {
    label: "Empresas", eyebrow: "02 / Clientes verificados",
    title: "Cada carga. Una operación más simple.",
    intro: "Experiencia para mandantes: publicaciones, propuestas, calces y seguimiento desde su propia cuenta.",
    metrics: [["Cargas", "Mi actividad"], ["Ofertas", "Mi historial"], ["Verificación", "Según cuenta"]],
    items: [["Publicar una carga", "Formulario actual"], ["Consultar ofertas", "Historial de adjudicaciones"], ["Consultar estado", "Eventos disponibles"]],
    agent: "Asistente comercial IA", detail: "Apoya la gestión comercial, explica el estado de las publicaciones y orienta sobre próximos pasos."
  },
  {
    label: "Transportistas", eyebrow: "03 / Operación logística",
    title: "Tu flota, conectada a oportunidades.",
    intro: "Una vista ordenada de camiones, retornos, postulaciones y acreditación documental, respetando las reglas vigentes.",
    metrics: [["Camiones", "Mi flota"], ["Postulaciones", "Mis ofertas"], ["Documentos", "Mi acreditación"]],
    items: [["Publicar disponibilidad", "Camión o retorno"], ["Buscar cargas", "Según equipo y ruta"], ["Revisar documentación", "Vigencia y pendientes"]],
    agent: "Asistente operativo IA", detail: "Guía al transportista en publicaciones, documentos y ofertas, sin saltarse controles de verificación."
  },
  {
    label: "Centro de control", eyebrow: "04 / Administración",
    title: "Visión total. Decisiones bajo control.",
    intro: "Centro ejecutivo para seguimiento operacional, revisión de alertas y supervisión de módulos existentes, exclusivamente para administradores.",
    metrics: [["Operaciones", "Datos disponibles"], ["Alertas", "Por verificar"], ["Integraciones", "Según estado real"]],
    items: [["Operaciones y viajes", "Consulta y seguimiento"], ["Cuentas y documentación", "Revisión administrativa"], ["Agentes y comunicaciones", "Estado por comprobar"]],
    agent: "Agente supervisor IA", detail: "Consolida observaciones, propone acciones y solicita aprobación para cambios sensibles. No ejecuta decisiones no autorizadas."
  }
] as const;

export default function VistaConceptual() {
  const [active, setActive] = useState(0);
  const view = views[active];
  return (
    <div className="c360-concept">
      <div className="p-header">
        <div className="p-brand">Carga360go<span style={{fontWeight:400,color:"#aaa"}}> / UI</span></div>
        <span className="p-sub">Concepto visual · Blanco y negro</span>
      </div>
      <div className="p-shell">
        <nav className="p-nav" aria-label="Cambiar vista conceptual">
          <div className="p-nav-label">4 experiencias</div>
          {views.map((v, i) => <button key={v.label} type="button" role="tab"
            className="p-nav-btn" aria-selected={active === i}
            onClick={() => setActive(i)}>{String(i + 1).padStart(2,"0")} &nbsp; {v.label}</button>)}
        </nav>
        <main className="p-content">
          <p className="p-eyebrow">{view.eyebrow}</p>
          <h1>{view.title}</h1>
          <p className="p-intro">{view.intro}</p>
          <div className="p-image" aria-label="Ilustración conceptual de logística terrestre">
            <span className="p-image-copy">CARGA360GO<br/>INTELIGENCIA LOGÍSTICA<br/>CHILE · OPERACIÓN NACIONAL</span>
            <svg className="p-truck" aria-hidden="true" viewBox="0 0 320 125" width="320" height="125" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 91H184V20H22V91H14ZM184 44H255L300 75V91H184V44Z" stroke="currentColor" strokeWidth="2.5"/><path d="M203 53H247L275 73H203V53ZM10 91H307M38 24H165" stroke="currentColor" strokeWidth="1.3"/><circle cx="67" cy="94" r="19" fill="#0d0f11" stroke="currentColor" strokeWidth="2.5"/><circle cx="67" cy="94" r="8" stroke="currentColor" strokeWidth="1.5"/><circle cx="235" cy="94" r="19" fill="#0d0f11" stroke="currentColor" strokeWidth="2.5"/><circle cx="235" cy="94" r="8" stroke="currentColor" strokeWidth="1.5"/><path d="M30 36H160M30 44H160M30 52H160" stroke="currentColor" strokeWidth=".7" opacity=".45"/></svg>
          </div>
          <div className="p-grid">
            {view.metrics.map(([name, value]) => <div key={name} className="p-metric"><span>{name}</span><strong>{value}</strong></div>)}
          </div>
          <div className="p-cols">
            <section className="p-block" aria-label="Funciones existentes representadas">
              <h2 className="p-block-title">Funciones del panel <span className="p-pill">Vista conceptual</span></h2>
              {view.items.map(([name, detail]) => <div className="p-item" key={name}><span>{name}</span><small>{detail}</small></div>)}
            </section>
            <section className="p-block" aria-label="Asistente especializado propuesto">
              <h2 className="p-block-title">{view.agent} <span className="p-pill">Diseño</span></h2>
              <p className="p-agent">{view.detail}</p>
              <span className="p-agent-note">Interacción ilustrativa, sin conexión a servicios.</span>
              <div className="p-fake-input" aria-hidden="true">¿En qué te puedo ayudar? &nbsp; →</div>
            </section>
          </div>
          <p className="p-footer">Prototipo visual aislado · Sin datos reales · Sin cambios de autenticación, pagos ni automatizaciones · No publicado en producción.</p>
        </main>
      </div>
    </div>
  );
}
