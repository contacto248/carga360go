# Bases de prueba para migraciones

- `produccion-v13.sqlite`: esquema de producción (base 3c0217e = 2f82122, versión 13) creado con `scripts/seed-dev.ts` de esa base. Solo datos DEMO.
- `produccion-v14.sqlite`: mismo seed con el código de la rama de verificación (0899a07, versión 14) y un contacto de respaldo/solo lectura de ejemplo.

Las usa `tests/migraciones.test.ts` para comprobar que 14, 15 y 16 se aplican en orden y sin perder datos.
