# PROVENANCE — Copia de trabajo de producción

| Campo | Valor |
|---|---|
| Fecha de copia | 2026-11-13T07:06 UTC |
| Servidor de origen | 192.141.168.203 (Carga360, Puerto 60000) |
| Ruta en origen | /opt/carga360go |
| Usuario de acceso SSH | irprgxxh |
| Método de copia | SSH + tar pipe (`ssh ... "tar czf - ..."  \| tar xzf - -C ...`) |
| Destino local | /tmp/carga360go-workingcopy/ |
| Total de archivos copiados | 6288 |
| Excluidos | .env, node_modules/, .next/, *.sqlite, *.sqlite-wal, *.sqlite-shm, uploads/, backups/, mail-outbox/, deploy/backups/, *.log |

## SHA-256 de archivos clave (en origen)

| Archivo | SHA-256 |
|---|---|
| package.json | `a573d48d762ac97b50ae1f8f065ab53fc905a8db14a6f0da45269745389203a1` |
| tsconfig.json | `83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9` |
| next.config.ts | `96a89fbc81944e85b802f88808f3a27213ab5c34573656b4fc84387a4e80f4bf` |

## Advertencia

Esta copia es de solo lectura con fines de análisis. No contiene:
- Datos sensibles (.env con contraseñas y claves API)
- Base de datos de producción (*.sqlite)
- Archivos adjuntos de usuarios (uploads/)
- Respaldos cifrados (backups/)

La copia reproduce el código fuente tal como corre en producción.
No está sincronizada con el repositorio GitHub `bastian-del/carga-retorno-360`
(que usa un stack diferente: Neon/Postgres, Drizzle ORM, NextAuth, Resend).
