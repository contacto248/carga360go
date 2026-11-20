# Carga360go · Propuesta de portada
Prototipo privado, estático y aislado de carga360go.cl y del trabajo de Cursor.

## Incluye
- Portada responsive blanco/negro/gris; naranja solo para AGENTE.
- Visual SVG original conceptual, no fotografía ni GPS.
- Dos perfiles, selección de ruta/equipo, intercambio de ruta y resumen.
- Validación de ruta, navegación por etapas y diálogo conceptual del agente.
- Sin backend, IA conectada, analytics, almacenamiento ni envío de datos.
- Ciudades y tipos son opciones de demostración, no catálogo nacional completo.
- Wordmark tipográfico de propuesta; integración final debe conservar el logo oficial.

## QA
- node --check dist/app.js: aprobado.
- Navegador escritorio: render y formulario carga La Serena/Santiago/Carga general aprobado.
- Cambio transportista y rechazo origen=destino aprobado.
- Frame 390 px: render móvil y formulario Santiago/Concepción/Tolva aprobado.
- Diálogo AGENTE y cambio etapa: aprobados.
- No se prueba ni afirma funcionalidad del sitio productivo.

## Integración futura
No reemplazar producción ni repositorio. Extraer y adaptar únicamente tras autorización, con logo oficial y APIs verificadas; preservar cuatro paneles y trabajo concurrente. No habilitar publicación real, datos o integraciones en este prototipo.

## Versión 2 · Órbita
Dirección visual original: negro absoluto, tipografía monumental, geometría orbital CSS sin dependencias. Inspiración tecnológica, no reproducción de identidad xAI.
Mejora funcional: guía contextual por carga/equipo. Reglas locales transparentes, sin IA conectada, transmisión ni persistencia.
QA: sintaxis JS, resumen refrigerada La Serena–Santiago; transportista Tolva Santiago–Concepción; rechazo ciudades iguales; móvil 390 px y escritorio inspeccionados.
Versión anterior recuperable: commit d24455b7fe97fb21d4ace358b0eaa282e3b2aee8; versión Sites 1. Copia hermana carga-portada-v1-backup.
Sin cambios en carga360go.cl, Cursor ni permisos.

## Versión 3 · Panel comercial para revisión
Seis mejoras: propuesta clara; perfiles comerciales; pantalla interactiva de producto; proceso por cinco hitos; seguridad propuesta sin certificaciones ficticias; automatización local diferenciada de futuras integraciones IA. Menú móvil y FAQ. Sin GPS real, publicación de cargas ni operaciones. Conserva versiones anteriores y acceso privado.
