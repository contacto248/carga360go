# Torre de control de flotas, GPS y QR

Máquina de estados: borrador -> publicada -> postulaciones -> asignada -> retiro_en_ruta -> en_origen -> cargada -> en_transito -> en_destino -> entrega_confirmada -> cerrada; cancelada/incidencia como ramas auditadas.

## Reglas de control
- Exigir transportista/empresa y conductor autorizados, documentación vigente y GPS activo antes de publicar oferta de camión o postular, según rol y reglas de negocio.
- GPS: consentimiento informado, dispositivo asignado, latencia, señal y precisión; geocercas para hitos. No mostrar ubicación precisa a terceros sin autorización; retener mínimos datos necesarios.
- QR retiro y destino: token de un solo uso, caducidad, identidad del firmante, referencia de carga, hora y ubicación; validar en servidor y registrar evidencia. Prevenir replay, suplantación y QR reutilizados.
- Documentos: guía de despacho/CMR cuando aplique, comprobante de retiro, fotos opcionales consentidas, prueba de entrega y firma. No generar documentación legal simulada sin validación.
- Alertas: desvío significativo, GPS inactivo, demora, vehículo no autorizado, cambio de conductor, divergencia de peso, documentación vencida y entrega disputada.
- Manejar zonas sin señal con eventos firmados, reloj local y reconciliación confiable al reconectar; no falsificar localizaciones ausentes.
