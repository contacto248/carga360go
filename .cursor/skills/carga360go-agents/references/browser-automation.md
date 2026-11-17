---
description: "Guidelines for authentication, session management, headless browser navigation, data extraction, and report generation on carga360go.cl"
connections: [agent-workflows, project-context, components-and-apis]
---

# Browser Automation & Data Extraction — Carga360go.cl

Capacidades operativas para interactuar con la página (pública o panel privado), extraer datos y generar reportes. Útil para monitoreo, resúmenes diarios, verificación de estados y apoyo a decisiones.

## 1. Autenticación y manejo de sesiones

- Usar login en `/ingreso` (correo + contraseña).
- Roles típicos: mandante, transportista, administrador.
- Mantener sesión activa:
  - Preferir cookies / storage persistente del navegador headless.
  - Reutilizar contexto de navegador entre pasos o ejecuciones.
  - Si la sesión expira, relogin automático antes de continuar.
- Credenciales: nunca hardcodear; usar variables de entorno o secretos del entorno del bot/agente.
- Verificar login exitoso comprobando redirección a `/panel` o presencia de elementos de “Mi cuenta”.

## 2. Navegación web automatizada (Headless Browser)

Herramientas recomendadas: Playwright (preferido) o Puppeteer.

Flujos típicos:
1. Abrir sitio (`https://www.carga360go.cl`).
2. Login si se requiere panel privado.
3. Navegar secciones:
   - Bolsa de cargas (`/cargas`)
   - Camiones (`/camiones`)
   - Calculadora de flete
   - Panel de regiones
   - Mi panel / alertas
4. Interacciones: clics en menús, llenar formularios, expandir detalles, cambiar filtros, paginación.
5. Esperar cargas dinámicas (“Cargando…”).

Patrón recomendado:
- Usar selectores estables (roles, textos, data attributes cuando existan).
- Capturar screenshots en puntos clave para depuración.
- Manejar timeouts y reintentos.

## 3. Extracción de datos (Web Scraping)

Datos útiles a extraer:
- Listados de cargas y camiones (origen, destino, tipo, peso, precio estimado, estado).
- Resultados de calculadora de flete (ruta, peajes por ejes, diésel, costos operacionales).
- Estados de verificación de documentos.
- Alertas y notificaciones del panel.
- Textos dinámicos y tablas.

Técnicas:
- Esperar a que el contenido esté visible.
- Extraer tablas a estructuras (listas de objetos).
- Normalizar números (precios en CLP, toneladas, etc.).
- Guardar snapshot raw + versión limpia.

## 4. Procesamiento y generación de reportes

Transformar datos extraídos en:
- Resúmenes en Markdown (para bots o status updates).
- Tablas.
- Archivos CSV / Excel (xlsx).
- PDF (cuando se requiera entrega formal).

Plantillas disponibles en `assets/`:
- Usar o adaptar `status-update-template.md`.
- Scripts de apoyo en `scripts/` para formateo.

## Flujo integrado recomendado

1. Autenticar y mantener sesión.
2. Navegar a las vistas relevantes.
3. Extraer datos actuales.
4. Comparar con estado anterior (si hay memoria/bot).
5. Generar reporte estructurado.
6. Entregar a usuario / bot / siguiente agente (Cursor para cambios si se detecta problema).

## Consideraciones

- Respetar términos de uso y no sobrecargar el sitio.
- Preferir endpoints API si existen (más estable que scraping).
- Documentar selectores o flujos que cambien.
- Para rutinas recurrentes, encapsular en Grok Bot con este skill.

Ver también: `references/advanced-web-automation.md` para patrones de nivel ingeniero (storage state, Page Object Model, retries, extracción estructurada, observabilidad y checklist de producción).
