# Construcción desde hoy

El repositorio arranca ya con Docker Compose. Para llevarlo a producción real faltan únicamente datos/credenciales que no deben inventarse: dominio/DNS, proveedor cloud o VPS, identidad/OIDC, proveedor GPS, mapas, mensajería, almacenamiento, facturación y proveedor(es) LLM.

## Definition of Done de producción
- TLS y DNS activos.
- OIDC+MFA y RBAC multi-tenant probados.
- Migraciones y backup/restore probados.
- Integraciones reales con secretos en vault.
- Pruebas unitarias/integración/e2e y seguridad.
- Alertas, métricas y trazas.
- Runbooks de incidentes.
- Aprobaciones humanas en herramientas de riesgo.
- Pruebas de carga y plan de rollback.
