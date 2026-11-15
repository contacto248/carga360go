# BASSAM 360 — Centro de control inteligente

## Uso

La entrada es `/admin/control`, con la misma cuenta administradora y segundo factor de CARGA360GO. El enlace aparece en la cabecera, el menú móvil, la navegación administrativa y la portada de administración. No se crea un usuario ni una contraseña nuevos.

Los botones **BASSAM SPA** y **CARGA360GO** cambian de espacio. Cada registro del centro está asociado a su empresa. Los administradores existentes pueden administrar ambos espacios; los transportistas, mandantes y visitantes no tienen acceso. Esto no crea sesiones ni permisos en los portales externos de BASSAM.

### CARGA360GO

- Indicadores calculados desde la base de este entorno: cargas y camiones vigentes, empresas registradas y tareas abiertas. No son métricas de GPS.
- Actividad visible de los corredores Calama–Antofagasta, Calama–Copiapó y Antofagasta–Copiapó, sumando ambos sentidos y excluyendo avisos de demostración. No representa toda la demanda del mercado ni tráfico histórico.
- Accesos a usuarios y documentos, acreditación, ofertas, costos, agente comercial, WhatsApp, chat y auditoría existentes.
- Las ocho tareas solicitadas se registran una sola vez al primer acceso autorizado, como pendientes y con responsables por función y fechas propuestas relativas al día de instalación. El administrador puede confirmar y editar el plan. La siembra no envía mensajes.

### BASSAM SPA

- Gestión persistente de servicios: cliente/empresa, equipo, origen, destino, responsable, fecha, notas y estado.
- Estados: nuevo, cotizado, confirmado, en curso, finalizado y cancelado. Registrar un servicio no envía una cotización ni contacta al cliente.
- Indicadores calculados a partir de sus servicios propios; comienza vacío, sin actividad inventada.
- Tareas independientes y accesos al sitio BASSAM y a horómetros. Esos enlaces no importan datos ni abren una sesión automáticamente.

### En ambos espacios

- Alta y edición de tareas con prioridad, responsable, fecha, estado y evidencia. Terminar exige responsable y evidencia. Archivar es reversible y no borra datos.
- Guardado en SQLite compartido por el servidor, no en localStorage.
- Exportación JSON privada por empresa y actualización manual desde el servidor.
- Auditoría transaccional de todas las escrituras, con el administrador y la fecha.
- Revisión optimista: una edición obsoleta devuelve HTTP 409 en lugar de sobrescribir cambios ajenos.

## Integraciones y límites

El tablero diferencia la configuración local de una conexión comprobada. No expone claves, no realiza llamadas de prueba ni activa servicios de pago. La existencia de un contrato telefónico del usuario no acredita la configuración del adaptador Twilio que ya utiliza este código.

**GPS:** la API guarda latitud, longitud y hora solo de un viaje autorizado. Está probada en test. Sin un dispositivo emisor en terreno no está operativa y no se muestran posiciones simuladas. El panel privado es `/admin/bassam`. Tampoco conecta automáticamente Gmail, HubSpot, Grok o el portal externo de horómetros. Manychat no se integra.

## Datos y compatibilidad

Tablas nuevas: `b360_records` y `b360_meta`. Creación aditiva e idempotente, tras comprobar acceso administrativo. Se utiliza un esquema independiente para evitar colisiones con las migraciones numeradas del motor de costos o del cotizador en otras ramas. No se altera ni se elimina ninguna tabla operacional existente.

El usuario de sistema de CARGA360GO debe poder escribir en su base SQLite y directorio, como ya requiere la aplicación. La copia de trabajo se preparó desde `bc8b2086c95e382cc7b9ebe39465026663df939f`. No debe reemplazarse una versión posterior por esta base completa: integrar solamente el parche del módulo y revisar sus conflictos.

## Validación y publicación

1. Respaldar código, configuración, base y adjuntos del entorno de destino siguiendo el procedimiento existente, y comprobar el respaldo.
2. Sobre una copia de la versión que está realmente desplegada, ejecutar `git apply --ignore-space-change --check modulo-bassam360.patch`. Ante conflictos, detenerse y resolverlos; no forzar la aplicación ni sustituir cabeceras completas de una versión posterior.
3. Aplicar el parche con `git apply --ignore-space-change modulo-bassam360.patch` (compatibilidad de finales de línea Windows/Linux), ejecutar `npm run test:control`, comprobación de tipos y compilación. Ejecutar la suite existente en Linux antes de promover a producción.
4. Probar en staging con las cuentas de QA: ingreso con segundo factor, rechazo anónimo/no administrador, cambio de empresa, alta/edición de tarea, concurrencia, alta/cambio de estado de servicio, actualización, exportación, persistencia tras reinicio y acceso móvil.
5. Publicar únicamente la versión exacta validada. Conservar el archivo de entorno, los datos, los adjuntos, los permisos y las credenciales actuales. No reemplazar la base por una base de pruebas.
6. Comprobar `/api/salud`, portada, ingreso y `/admin/control` en producción. Una respuesta 200 sin sesión no acredita acceso administrativo: comprobar la sesión autorizada y el rechazo de las API sin credenciales.
7. Si falla, restaurar código/compilación previos y reiniciar el servicio. Las tablas nuevas son independientes y pueden conservarse para evitar perder registros; no eliminarlas. Si se restaura una base completa, congelar escrituras y preservar primero los cambios posteriores al respaldo.

## Evidencia de esta entrega

- Nueve pruebas nuevas del módulo: aprobadas, incluyendo API, MFA, CSRF, aislamiento, persistencia, validación, concurrencia y atomicidad de auditoría.
- Compilación de producción, TypeScript y lint: correctos; permanecen advertencias preexistentes de imágenes y un import no utilizado en pagos.
- Suite completa en Windows: 198/202 aprobadas. Las cuatro pruebas restantes pertenecen a procesos secundarios de IA y al cron Bash/Linux, fuera del módulo; no se consideran aprobadas ni sustituyen la suite de Linux.
- La ejecución solicitada para levantar el servidor local de QA fue rechazada por el entorno. La prueba visual automatizada queda pendiente y no se presenta la imagen generada anteriormente como captura del módulo.
- La conexión SSH al destino respondió `Permission denied`; el intento de acceso ampliado fue rechazado automáticamente por la política de esta sesión. La publicación está autorizada por Gerencia, pero **no se ha ejecutado**.
