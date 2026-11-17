# Changelog

## 2026-11-17 — Copia al repositorio
- Skill copiado desde el zip autorizado por Gerencia. Solo entradas con deflate y CRC válidos.
- Los scripts cuyo stream quedó truncado no se inventaron y SKILL.md no los lista.
- Rutina de resumen para Grok Bots documentada en `references/advanced-web-automation.md` (sin cron y sin xAI).

## 2026-11-17 — Automatización web nivel ingeniero
- Añadido `references/advanced-web-automation.md` con patrones de producción: Playwright (storage state, POM, locators estables), extracción estructurada, retries, observabilidad, API-first, integración con Grok Bots y checklist de confiabilidad.
- Actualizado SKILL.md para referenciar el nuevo manual.
- Preservadas todas las referencias y scripts previos.

## 2026-11-17 — Ampliación de habilidades
- Agregados nueve manuales especializados, arquitectura de agentes y controles de autorización.
- Incorporados GPS/QR, cotizador auditable, matching, atención IA, integraciones, seguridad, KPIs y roadmap.
- Añadida validación de JSONL de preguntas y respuestas y metadatos ChatGPT.
- Se preservaron referencias, plantillas y scripts previos.

# Changelog

## 2026-11-17
- Initial skill creation for coordinating Cursor, Grok, and Grok Bots on the Carga360go.cl project
- Added core workflows, project context, and references structure
- Expanded with technical observations from public site (features, pages, calculadora, verificación)
- Added assets: status-update-template.md, instructivo-template.md
- Added script: scripts/generate_status.py (histórico del skill; no está en esta copia porque el zip se truncó al inflarlo)
- Added references: tech-stack.md, folder-structure.md, components-and-apis.md
- Aligned flows with observed working style (destrabar, construir en la página, multi-agente, decisiones del dueño)
- Added browser automation capabilities: authentication/sessions, headless navigation (Playwright), data extraction, and report generation
- New files: references/browser-automation.md, scripts/generate_report.py, assets/monitoring-checklist.md
