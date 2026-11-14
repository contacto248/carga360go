# Contacto de respaldo y verificación manual (solo lectura 30 días)

Rama `feature/verificacion-respaldo`. Migración 14 (`src/lib/db.ts`, copia legible en `docs/migrations/014-verificacion-respaldo.sql`).

## 1. Contacto de respaldo

- Columnas nuevas en `users`: `backup_contact`, `backup_contact_type` (`telefono` | `email`), `backup_contact_at`.
- Lógica: `src/lib/backup-contact.ts`.
  - `parseBackupContact(valor, principal)`: acepta celular chileno (+56 9 XXXX XXXX), fijo chileno (+56 2 XXXX XXXX y otros
    códigos de área, 9 dígitos) o correo válido. Debe ser distinto del correo y del WhatsApp principales.
  - `verificationPending(userId)`: correo sin confirmar, teléfono sin confirmar (transportistas, o todas con KYC activo),
    documentos obligatorios sin aprobar (transportistas) o cuenta no aprobada.
  - `needsBackupContact(userId)`: verificación pendiente y sin respaldo guardado.
- Dónde se pide:
  - Registro web (`/registro` → `POST /api/auth/registro`): campo obligatorio, validado en el servidor.
  - App móvil (`POST /api/auth/register`): campo `backupContact` opcional (para no romper versiones publicadas de la app).
    El `gate` de la sesión móvil expone `backupContactRequired: true` mientras falte.
  - `/panel` y `/cuenta-en-revision`: tarjeta «Contacto de respaldo» mientras la verificación esté pendiente.
  - Correos de bienvenida y recordatorio (`src/lib/onboarding/messages.ts`) y texto de WhatsApp de onboarding: agregan
    la línea `BACKUP_CONTACT_LINE` cuando `status.backupContactMissing`.
  - Bot de WhatsApp y chat web (motor de reglas `src/lib/whatsapp/intents.ts`): `BACKUP_CONTACT_ASK` en las respuestas
    `estado_cuenta` y `registro_transportista`. El prompt del asistente IA (`src/lib/assistant/prompt.ts`) tiene la misma regla.
- Guardar o cambiar: `PATCH /api/cuenta` con `{ "backupContact": "..." }` (el propio usuario, sesión web) o
  `PATCH /api/admin/usuarios/:id` con `{ "backupContact": "..." }` (administrador). Ambos quedan en `audit_log`
  (`usuario.respaldo`).
- Privacidad: no forma parte de `PublicUser`; solo lo ven el propio usuario y los administradores (`/admin/transportistas`).

### Punto de integración para el flujo del bot (lo diseña otro asistente)

El bot NO recibe el contacto de respaldo por el chat (regla vigente: no se piden datos personales por WhatsApp). Si el
nuevo flujo quiere capturarlo en la conversación, el punto de integración es:

1. Identificar la cuenta (hoy `wa_conversations.user_id` puede venir vacío; el bot no sabe con certeza quién escribe).
2. Si `needsBackupContact(userId)` es `true`, pedirlo con el texto `BACKUP_CONTACT_ASK` o uno equivalente.
3. Guardarlo con `setBackupContact(userId, valor)` (valida formato y que sea distinto del principal) y auditar
   `audit(null, "usuario.respaldo", { type: "usuario", id: userId }, { origen: "whatsapp" })`.

Mientras no exista una identificación confiable del usuario en el chat, se mantiene el envío al panel.

## 2. Verificación manual del administrador (solo lectura, 30 días)

- Columnas nuevas en `users`: `manual_readonly_until`, `manual_readonly_at`, `manual_readonly_by`, `manual_readonly_by_email`.
  No se cambió el `CHECK` de `verification_status` (en SQLite exigiría reconstruir la tabla): el estado
  `manual_readonly` es **efectivo**: `verification_status = 'pendiente'` + `manual_readonly_until > ahora`.
- Lógica: `src/lib/manual-readonly.ts` (`grantManualReadonly`, `revokeManualReadonly`, `assertNotManualReadonly`,
  `accountStateOf`, `expireManualReadonly`).
- Panel: `/admin/transportistas` (transportistas y mandantes), botón «Verificación manual (solo lectura, 30 días)» con
  confirmación; «Revocar solo lectura»; filtro «Solo lectura (verificación manual)». API:
  `PATCH /api/admin/usuarios/:id` con `{ "manualReadonly": "otorgar" | "revocar" }` (solo `admin`, `requireRoles`).
  Auditoría: `usuario.solo_lectura_otorgada` (con fecha de vencimiento), `usuario.solo_lectura_revocada`,
  `usuario.solo_lectura_vencida`; además quedan en la fila quién (`manual_readonly_by`/`_email`) y cuándo (`manual_readonly_at`).
- Qué permite: ver `/cargas`, `/camiones` y sus detalles (el transportista ya no se redirige a `/cuenta-en-revision`).
- Qué bloquea en el servidor (código de error `solo_lectura`, HTTP 403):
  `assertCanPublish` (web y app), `assertCanOffer`/`submitOffer` (ofertar o tomar), `acceptOffer` (adjudicar),
  `createLoad`, `updateLoad`, `createTruck`, `updateTruck` en `listings.ts` (cubre web, app y cualquier otro llamador),
  y `assertAccredited`.
- Vencimiento: la comparación es por fecha, así que al cumplirse los 30 días la cuenta pierde la solo lectura sola y queda
  pendiente. El job existente `POST /api/onboarding/jobs/recordatorios` además limpia las columnas y audita
  (`readonlyExpired` en la respuesta).
- La aprobación normal (`approveCarrier`) y el rechazo (`rejectCarrier`) limpian el estado. Volver a presionar el botón
  renueva 30 días desde ese momento. No se puede otorgar a cuentas ya verificadas ni a administradores.
