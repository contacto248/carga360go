---
description: "Technical observations and placeholders for the Carga360go.cl stack, based on public site features and common patterns. Fill with real project details."
connections: [project-context, components-and-apis, folder-structure]
---

# Tech Stack — Carga360go.cl

## Observed from public site (carga360go.cl)

- Plataforma web de bolsa de carga y camiones para las 16 regiones de Chile.
- Funcionalidades clave: publicar cargas/camiones, calculadora de flete (ruta + peajes por ejes + diésel + costos operacionales), trazabilidad, verificación documental de cuentas, panel de regiones, alertas por correo, cotizador, Mi panel.
- Menciones de "Agente BASSAM 360" y automatización.
- Carga dinámica ("Cargando…") sugiere frontend moderno con datos asíncronos.
- Empresa: CARGA360GO SpA, RUT 78.553.352-6, La Serena.

## Stack recomendado / placeholders (completar con realidad del proyecto)

| Capa | Tecnología sugerida (común) | Notas / real |
|------|-----------------------------|--------------|
| Frontend | Next.js (App Router) + React + TypeScript | Ideal para SEO, SSR y velocidad de desarrollo con Cursor/Grok |
| Estilos | Tailwind CSS + shadcn/ui o componentes propios | Consistencia visual |
| Backend / DB | Supabase (Postgres + Auth + Storage + RLS) o API propia | Auth de usuarios (mandante/transportista/admin), documentos |
| Cálculos | Lógica en server actions o edge functions | Calculadora de flete, peajes, costos |
| Auth & Docs | Verificación de RUT, documentos (cédula, licencia, SOAP, etc.) | Flujo de "Cómo verificamos" |
| Hosting | Vercel o similar | Despliegue continuo desde Cursor |
| Agentes | Grok + Grok Bots + Cursor | Coordinación de desarrollo y rutinas |

**Acción**: Reemplazar las sugerencias con el stack real del repositorio. Documentar variables de entorno y servicios externos (WhatsApp, correo, peajes, etc.).

## Principios técnicos para el proyecto

- Preferir progreso visible en la página sobre drafts largos.
- Cambios incrementales y testeables.
- Documentar decisiones en referencias o memoria de bots.
- Mantener trazabilidad entre código y funcionalidades de negocio (calculadora, verificación, publicación).
