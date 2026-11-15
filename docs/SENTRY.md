# Sentry (opcional, plan gratis)

Apagado por defecto. Si `SENTRY_DSN` está vacío no se inicializa `@sentry/nextjs` y no hay llamadas a Sentry. El build no pide `SENTRY_AUTH_TOKEN` y no sube source maps.

Solo se capturan errores. No hay session replay. Las trazas van al 5% (`tracesSampleRate` 0.05). No se envían cookies, headers de autenticación ni tokens. El SDK 11 ya no lee `sendDefaultPii`; el proyecto lo deja en `false` y, además, `dataCollection` corta usuario, cookies, headers, cuerpos y query.

## Activar en staging

1. Crear un proyecto de Next.js en Sentry, plan gratis, y copiar el DSN público.
2. En el entorno de staging, sin commitear nada, definir `SENTRY_DSN` y `SENTRY_ENVIRONMENT=staging`.
3. Volver a construir y reiniciar el proceso de staging. El navegador solo recibe el DSN si estaba presente durante `npm run build`. El servidor lo lee al arrancar.
4. Dejar producción sin `SENTRY_DSN` hasta una decisión aparte. No hace falta token de autenticación de Sentry.
