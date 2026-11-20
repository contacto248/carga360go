# Órbita / Carga360go — Continuidad de trabajo
Fecha de corte: 20-11-2026 (UTC). Respaldo privado de fuentes y decisiones, no imagen del servidor ni copia completa de la plataforma.

## Resultado y artefactos
- Propuesta Site activa, versión 3, comprobada con Sites. URL: https://carga360go-portada-concepto.carga360go-7265.chatgpt.site
- Fuentes locales v3: commit 1a6f878871bf36edd5cb63b94afe3ca1a5079a9b, árbol sin cambios. Incluye dist/index.html, dist/style.css, dist/app.js y README original. El README conserva menciones históricas a privado: el usuario posteriormente autorizó hacer público el Site para otro agente.
- Se conservan también fuentes históricas v1/v2. No desplegar automáticamente ninguna versión histórica.
- Paquete de integración ya respaldado en Drive (no duplicado aquí): https://drive.google.com/file/d/1hzvG8o5HzNDtzrPD15gWBREx1qgpdlwB/view?usp=drivesdk
  Nombre: orbita-entrega.tar.gz; tamaño verificado 8925 bytes; incluye parche orbita-visual-2e4ce45.patch y revisión/pruebas. Propietario el correo de contacto publicado en el sitio. Al comprobarlo solo tenía permiso del propietario; no se logró habilitar acceso público mediante conector/navegador. No confundir permisos del Site con permisos de Drive.

## Decisiones de Bastián
- Prioridad Carga360go, no BASSAM. Dirección Órbita: tecnológica, original y de alto impacto; negro/blanco/gris; naranja reservado al agente.
- Portada pública comercial: explicar y generar confianza, mostrar tecnología, automatización, trazabilidad, calidad y seguridad. No debe parecer panel operativo.
- Dos accesos principales por perfil: quien necesita transportar y transportista; herramientas operativas en paneles respectivos.
- No presentar como activas funciones inexistentes. Distinguir demostración, propuesta y funcionalidad real.
- Publicar primero capa visual; módulos y botones se activarán gradualmente. Usuario autorizó esa integración y subida. Preservar trabajo concurrente, contenido, rutas y cuatro paneles.
- Ahora solicita respaldar todo en Drive para continuar mañana. Esta ejecución solo respalda, no cambia producción.

## Estado productivo: hechos y límites
Verificación comunicada por el coordinador el 20-11-2026:
- Dominio productivo respondió HTTP 200 y contiene CSS orbita_surface.
- /api/health respondió ok, database true y commit base 2e4ce45.
- Observación escritorio: capa parcial CSS sobre estructura anterior. Títulos “Cómo funciona” y “A quién sirve” oscuros sobre negro, con contraste deficiente; botones del perfil transportista tienen menos énfasis.
- Otro ChatGPT fue quien desplegó. Reportó commit visual 7951ea... y respaldo VPS. El SHA completo y ese respaldo de servidor NO fueron verificados por nosotros. La salida health con SHA base no demuestra el commit visual informado.
- No se probaron flujos autenticados. No afirmar que todos los módulos, seguridad, GPS, IA o automatizaciones estén operativos.
- El parche inicial aplica estilos encapsulados sobre página real conservando estructura/lógica; NO equivale a integración completa de la maqueta Site v3.

## Pruebas del paquete inicial
Según integration-review/README.md: preservación de código al quitar wrapper/import, diff --check, typecheck, build y 29/29 pruebas ampliadas en entorno aislado; reversión git apply --reverse --check aprobada. Base del parche: 2e4ce454dc51526787e04a443a53067860729f24. Es evidencia de preparación local, no prueba del despliegue posterior. QA visual de esa integración quedó pendiente en el paquete inicial.

## Próxima sesión
1. Identificar checkout/commit realmente servido y cambios del otro ChatGPT antes de editar. No sobrescribir ni revertir trabajo ajeno.
2. Corregir contraste de títulos sobre negro y jerarquía de CTA transportista; QA escritorio y móvil.
3. Comparar producción con Site v3 y acordar qué diferencias se integran, preservando contenido/lógica real y cuatro paneles.
4. Revisar botones/módulos y distinguir activos, demostración y pendientes; no simular capacidades reales.
5. Verificar existencia y restaurabilidad del respaldo del VPS con quien tiene acceso; este ZIP NO sustituye ese respaldo.
6. Mantener cambios mínimos, pruebas y comprobación del resultado; nada de DNS, credenciales, pagos, datos o textos legales dentro de este respaldo.

## Privacidad y recuperación
Fuentes estáticas solamente. Excluidos .git, credenciales, .env, bases de datos, uploads, datos personales, capturas de conversaciones y configuraciones sensibles. No contiene acceso al servidor. Recuperar fuentes Site desde fuentes-site-v3/dist; para integración usar paquete Drive enlazado, verificar base antes de aplicar y nunca ejecutar git reset ni restaurar DB por este cambio visual.
