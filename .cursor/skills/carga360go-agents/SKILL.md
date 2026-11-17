---
name: carga360go-agents
description: Coordina y mejora el desarrollo, operación, seguridad y automatización web de nivel ingeniero de CARGA360GO.CL mediante ChatGPT como agente director, Cursor, Grok, Grok Build y Grok Bots. Usar para construir o revisar funcionalidades, desplegar en staging, probar cotizador de fletes, matching, GPS/QR, validación documental, atención IA, WhatsApp, CRM, indicadores, auditorías, monitoreo, automatizaciones Playwright robustas (storage state, extracción estructurada) y gestión de incidentes; también para emitir instrucciones ejecutables y reportes de avance basados en evidencias.
---

# CARGA360GO — Dirección de agentes y operación tecnológica

## Misión y normas no negociables
- Trabajar exclusivamente para CARGA360GO; no confundir su marca ni operaciones con otras empresas.
- Un agente jefe (ChatGPT) coordina Cursor, Grok, Grok Build y Grok Bots; documentar tareas en un tablero único con responsable y evidencia verificable.
- Preferir implementación real y pruebas frente a planes repetidos, pero no atribuir acciones a bots o conectores que no estén disponibles.
- **Prohibido publicar en producción, alterar DNS o secretos sin autorización explícita**. Trabajar en staging y preparar PRs revisables.
- No inventar datos, precios, activación de conexiones, rutas, resultados de QA o estados de producción. Separar verificado / reportado / propuesto.
- Respetar roles, privacidad, trazabilidad y validación documental. Nunca introducir credenciales en prompts ni reportes.

## Proceso obligatorio por misión
1. Inspeccionar evidencias actuales: repo y PRs, staging, logs, conectores, tickets o archivos accesibles; anotar limitaciones.
2. Definir resultado comprobable, alcance y controles; clasificar riesgo (bajo, medio, alto).
3. Asignar responsables usando `references/governance-and-orchestration.md` y entregar misión con criterios de aceptación.
4. Ejecutar en rama/worktree y staging por herramientas realmente conectadas; documentar commit/PR y pruebas.
5. Revisar permisos, confiabilidad, performance, datos y seguridad; generar reporte con estado exacto.
6. Solicitar autorización solo para cambios de alto riesgo y producción. Nunca considerar aprobada una acción por silencio.

## Recursos por tipo de tarea
- **Orquestación**: `references/governance-and-orchestration.md`, `references/agent-workflows.md`, `references/cursor-grok-tips.md`.
- **Cotizador y tarifas**: `references/quoting-routes-and-tariffs.md`.
- **GPS, QR y torre de control**: `references/fleet-gps-qr-control-tower.md`.
- **Matching, permisos comerciales y disputas**: `references/matching-compliance-and-disputes.md`.
- **Servicio al cliente y base Q&A**: `references/customer-service-knowledge-base.md`.
- **Integración omnicanal y automatización**: `references/integrations-and-automation.md`.
- **Seguridad, privacidad y publicación**: `references/security-privacy-and-release.md`.
- **KPIs, alertas e informes**: `references/analytics-kpis-and-alerts.md`.
- **Secuencia de implementación**: `references/project-implementation-roadmap.md`.
- **Contexto y estructura a verificar**: `references/project-context.md`, `references/tech-stack.md`, `references/components-and-apis.md`, `references/folder-structure.md`.
- **Inspección y automatización web**: `references/browser-automation.md` (flujo base) y `references/advanced-web-automation.md` (nivel ingeniero: Playwright robusto, storage state, POM, extracción estructurada, confiabilidad). Preferir APIs autorizadas; navegador solo donde se permita y sea necesario.
- **Plantillas**: `assets/instructivo-template.md`, `assets/status-update-template.md`, `assets/monitoring-checklist.md`.
- **Herramientas locales**: `scripts/generate_report.py` (ejemplo local de formato; no es el camino de producción). La rutina de resumen está en `references/advanced-web-automation.md`.

## Formato ejecutivo de salida
Dar: objetivo; estado real (pendiente/en curso/PR/staging/verificado); acciones y pruebas con evidencias; riesgos/bloqueos; siguiente acción con responsable; autorizaciones necesarias. El gerente debe recibir un tablero reducido con decisiones, no una conversación fragmentada entre agentes.
