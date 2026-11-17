---
description: "Key components, pages, and API patterns for Carga360go based on public features."
connections: [tech-stack, folder-structure, project-context]
---

# Components & APIs — Carga360go

## Páginas / Rutas principales (observadas)

| Ruta | Propósito | Prioridad de desarrollo |
|------|-----------|-------------------------|
| `/` | Home + agente | Alta |
| `/cargas` / `/cargas/nueva` | Bolsa y publicar carga | Alta |
| `/camiones` / `/camiones/nuevo` | Camiones y retornos | Alta |
| `/herramientas/calculadora` | Calculadora de flete | Alta (diferenciador) |
| `/panel` | Mi panel + alertas | Media-Alta |
| `/como-verificamos` | Flujo de verificación | Alta |
| `/contacto` | Contacto | Media |
| `/ingreso` / registro | Auth | Alta |

## Componentes base sugeridos

- `FreightCalculator` — inputs de ruta, ejes, tipo de carga → costo estimado.
- `LoadCard` / `TruckCard` — listados de bolsa.
- `VerificationStatus` — semáforo de documentos.
- `ProtectedContact` — contacto solo tras adjudicación.
- `RegionPanel` — panel de regiones.
- `StatusUpdate` — para reportes internos.

## APIs / Lógica clave

- Cálculo de flete: ruta + peajes por ejes + diésel + costos operacionales.
- Publicación de carga/camión (con validación de cuenta verificada).
- Flujo de verificación documental (upload + revisión admin).
- Alertas por correo.
- Auth por roles: mandante, transportista, administrador.

## Patrones de implementación

1. Empezar por la calculadora (valor claro y medible).
2. Luego listados + publicación.
3. Verificación y panel.
4. Integrar agente (BASSAM 360 o Grok) donde aporte.

Documentar cualquier decisión de API o esquema de datos en esta referencia o en memoria de bots.
