# Seguridad, privacidad y despliegues seguros

## Acceso
RBAC/ABAC con aislamiento por tenant, mínimo privilegio y pruebas negativas: visitante, mandante, transportista, conductor y admin. `/admin/bassam360` y `/admin/cotizador-control` deben rechazar no-admin en backend (403), no solo ocultar navegación. MFA para admin recomendado.

## Documentos y datos
Escaneo de archivos, tipos/tamaños permitidos, URLs firmadas breves, cifrado, control de acceso por objeto, evidencia de verificación y vencimientos. Evitar RUT o documentos en logs públicos. Política de retención y borrado conforme normativa aplicable. Política de privacidad y CSP/GTM/GA coherentes con ejecución real, no con permisos de cabecera solamente.

## Infraestructura
VPS AlmaLinux/Nginx: TLS, firewall, backups verificados con restauración, patching, fail2ban y monitoreo de disco/CPU/errores. Nunca guardar credenciales en prompts, repositorios ni archivos de skill.

## Release gates
1. Rama/worktree, cambios limitados y PR.
2. Lint, typecheck, unitarias, integración y E2E; escaneo secretos/dependencias.
3. Revisión independiente de permisos y costos del cotizador.
4. Deploy solo staging; smoke tests HTTPS, login, panel 403, rutas, matching, notificaciones.
5. Evidencia de pruebas, plan rollback y autorización explícita del gerente antes de producción.
6. Verificar versión/hash publicado, healthcheck y telemetría posterior.
No tocar DNS, producción ni tokens sin aprobación específica.
