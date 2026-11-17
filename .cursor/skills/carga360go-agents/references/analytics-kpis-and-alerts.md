# KPIs, observabilidad y alertas

## Indicadores
Adquisición: visitas -> registros -> verificados -> primera carga o camión; conversión y tiempo a verificar.
Marketplace: cargas activas, cobertura por región, tasa de matching elegible, postulaciones por carga, aceptación, tiempo a asignación, viajes completados, cancelaciones y viajes con GPS activo.
Economía: cotización vs costo real, margen estimado vs realizado, peajes discrepantes, tasa de retorno vacío, comisiones efectivamente cobradas (si existen).
Calidad y confianza: OTP/SMTP, incidentes GPS, discrepancias QR, documentos vencidos, reclamos, tiempo a resolución, tiempo de indisponibilidad y errores API.
IA: contención segura, respuestas sin fuente, derivaciones, tasa de corrección humana, costo por conversación y errores de automatización.

## Alertas y resumen
Definir fuente, fecha de corte, granularidad y denominador para cada KPI; no mezclar pruebas con operación real. Umbrales configurables y alarmas de prioridad P0/P1/P2; alertas deduplicadas con owner, tiempo de respuesta, runbook y seguimiento hasta cierre. Reportar hechos observados, inferencias y bloqueos por separado.
