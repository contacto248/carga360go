# Integraciones y automatización omnicanal

Mapa objetivo: web -> API segura -> bus de eventos/cola -> servicios de cotización, matching, verificación, notificaciones, CRM, torre de control y analítica -> auditoría. Seleccionar tecnología según infraestructura confirmada; no asumir conectores activos.

## Canales
- WhatsApp Business/Callbell: webhook verificado, consentimiento, ventanas de mensajería, plantillas aprobadas y traspaso por excepción.
- Correo SMTP: SPF/DKIM/DMARC, opt-in, gestión de rebotes, bajas y protección contra spam.
- Voz: STT -> intención + base de conocimiento -> confirmación antes de acciones sensibles -> TTS natural; posibilidad de interrumpir y derivar.
- HubSpot/CRM: contacto único, empresa, oportunidad, solicitud, responsable, actividad y consentimiento; sincronización idempotente.
- Agenda: reuniones por clase (cliente, inversionista, transportista, sindicato, banco), calificación, disponibilidad y confirmación.
- Bots desarrolladores: intercambio de tickets/PR/checks, no conversaciones sincrónicas ficticias.

## Confiabilidad
Firmar webhooks; almacenar secretos en vault; esquema de eventos versionado, correlación por `trace_id`, reintentos exponenciales, dead-letter queue y reconciliación. No activar envíos masivos ni mensajes automáticos públicos sin autorización, consentimiento y validación legal.
