# Carga360go — API para las apps móviles (Android / iPhone)

Versión desplegada el 9-nov-2026 (commit `0684ab4`). Es la misma plataforma, la misma base SQLite y las mismas cuentas
y publicaciones que https://www.carga360go.cl. No hay otra base de datos: **no uses Netlify ni Postgres**.

## 1. Base y autenticación

- `EXPO_PUBLIC_API_URL=https://www.carga360go.cl` (sin `/` final; usa siempre `www`, el dominio sin `www` redirige).
- Todo es JSON (`content-type: application/json`), salvo la subida multipart y la descarga de archivos.
- Autenticación: `Authorization: Bearer <token>`. El token lo entregan `/api/auth/login` y `/api/auth/register`.
  - Es opaco (43 caracteres base64url). En el servidor solo se guarda su hash SHA-256 en la tabla `sessions`, la misma de la web.
  - **Dura 14 días** desde el ingreso (`expiresAt`, ISO UTC). No se renueva solo: al recibir `401` borra la sesión guardada y pide ingresar de nuevo.
  - `POST /api/auth/logout` revoca el token en el servidor. Cambiar la contraseña ("recuperar contraseña" en la web) revoca todas las sesiones.
  - Si llega un encabezado `Authorization`, la cookie se ignora. Con token no se exige `Origin`.
- Todas las rutas web existentes (`/api/cargas`, `/api/camiones`, `/api/documentos`, `/api/verificacion/*`, etc.) también aceptan el token Bearer con exactamente las mismas reglas.
- CORS: `Access-Control-Allow-Origin: *` y se aceptan los encabezados `authorization` y `content-type` (solo lo necesita Expo web; nativo no lo usa). No se usan cookies entre orígenes.

## 2. Errores

Toda respuesta de error es `{"error": "<mensaje en español listo para mostrar>"}`.

| Código | Cuándo | Qué hace la app |
|---|---|---|
| 400 | Datos inválidos (RUT, ciudad, fecha, archivo, JSON mal formado) | Mostrar `error` junto al formulario |
| 401 | Sin token, token vencido, revocado o de una cuenta borrada; también "Correo o contraseña incorrectos." | Borrar la sesión local e ir a Ingresar (en el login, solo mostrar el mensaje) |
| 403 | **Cuenta de transportista en revisión** ("Tu cuenta está en revisión…"), rol sin permiso (p. ej. un transportista publicando una carga) o recurso ajeno | Si `gate.locked` es true, mostrar la pantalla "Cuenta en revisión"; si no, mostrar el mensaje |
| 404 | Publicación o documento inexistente | Volver a la lista |
| 409 | Correo o RUT ya registrado | Mostrar el mensaje |
| 413 | Archivo demasiado grande | Mostrar el mensaje |
| 429 | Demasiados intentos (límite por IP: 10 ingresos cada 10 min y 10 registros por hora; además la cuenta se bloquea 15 min tras 8 claves malas, y nginx limita a 10 solicitudes por minuto con ráfaga de 5) | Mostrar el mensaje y no reintentar en bucle |
| 501 | `/api/import` (no existe en Carga360go) | Ocultar el botón "Copiar publicaciones locales" |
| 500 | Error interno | "Inténtalo más tarde" |

## 3. Cuentas

### Tipos de cuenta
Cada cuenta es **transportista** o **mandante**. La app usa `kind`:
- `"transportista"` → transportista
- `"generador"` (o `"mandante"`) → mandante, es decir, la empresa con carga
- `"ambos"` **no existe**: responde 400. Quita esa opción de la app.

### `POST /api/auth/register` → 201
```json
{
  "kind": "transportista",
  "razonSocial": "Transportes Ejemplo SpA",
  "rut": "76.123.456-7",
  "contactName": "Juan Pérez",
  "email": "juan@ejemplo.cl",
  "password": "mínimo 8 caracteres",
  "whatsapp": "+56 9 1234 5678",
  "city": "Antofagasta"
}
```
- `rut`: se valida el dígito verificador y es único. `whatsapp`: celular chileno. `city`: debe ser un nombre exacto de `GET /api/catalog` → `cities[].name` (hay unas 100 ciudades en 16 regiones; la lista local de la app, de 28 ciudades, sirve, pero conviene leer el catálogo).
- Al registrarse un transportista, se le envía un correo para confirmar su dirección (desde contacto@carga360go.cl).

Respuesta (igual para login):
```json
{
  "token": "…43 caracteres…",
  "tokenType": "Bearer",
  "expiresAt": "2026-11-23T10:35:12.267Z",
  "profile": {
    "id": "uuid", "kind": "transportista", "role": "transportista",
    "razonSocial": "Transportes Ejemplo SpA", "rut": "76.123.456-7", "contactName": "Juan Pérez",
    "email": "juan@ejemplo.cl", "whatsapp": "56912345678", "city": "Antofagasta",
    "verificationStatus": "pendiente", "verificationNote": null,
    "emailVerified": false, "phoneVerified": false, "createdAt": "…"
  },
  "gate": { "…": "ver sección 4" }
}
```
`AccountResponse` de la app es compatible: `token`, `expiresAt` y `profile` traen los mismos campos, y hay campos nuevos.

### `POST /api/auth/login` → 200
Cuerpo `{"email": "...", "password": "..."}`. Responde igual que el registro.

### `POST /api/auth/logout` → 200 `{"ok": true}`
Con `Authorization: Bearer`. Revoca ese token.

### `GET /api/me` → 200
Devuelve el perfil plano (los mismos campos de `profile`) y además `profile` y `gate`:
`{ "id": …, "kind": …, …, "profile": {…}, "gate": {…} }`. Llámalo al abrir la app y al volver a primer plano para refrescar el estado de revisión.

### `DELETE /api/me` → 204
Elimina la cuenta en el servidor con sus sesiones, publicaciones, documentos (también los archivos), alertas y códigos. Es irreversible: pide confirmación en la app. Las cuentas administradoras no se pueden borrar así (403). Cumple el requisito de borrado de cuenta de Google Play y App Store.

## 4. Estado de acceso (`gate`) — el bloqueo de transportistas

```json
"gate": {
  "state": "pendiente",
  "locked": true,
  "verificationStatus": "pendiente",
  "note": null,
  "canSeeMarketplace": false,
  "canSeeContact": false,
  "canPublishLoads": false,
  "canPublishTrucks": false,
  "reviewUrl": "https://www.carga360go.cl/cuenta-en-revision",
  "checklist": {
    "emailVerified": false,
    "phoneVerified": false,
    "docs": [
      {"type": "cedula", "label": "Cédula de identidad", "status": "falta"},
      {"type": "licencia", "label": "Licencia profesional", "status": "pendiente"},
      {"type": "padron", "label": "Padrón", "status": "verificado"},
      {"type": "revision", "label": "Revisión técnica", "status": "rechazado"},
      {"type": "soap", "label": "SOAP", "status": "falta"},
      {"type": "permiso", "label": "Permiso de circulación", "status": "falta"}
    ],
    "docsReady": false,
    "ready": false
  }
}
```

| `gate.state` | Quién | Qué ve la app |
|---|---|---|
| `aprobado` | Mandantes (desde el registro), administradores y transportistas aprobados por un administrador (`verificationStatus: "verificado"`) | Todo: bolsa de cargas y camiones con contacto (WhatsApp y empresa) y publicar según su rol |
| `pendiente` | Transportista recién registrado o con documentos en revisión | **Solo** la pantalla "Cuenta en revisión": checklist (correo, teléfono, 6 documentos con su estado), botón para subir documentos y enlace a `reviewUrl`. No debe mostrar la bolsa: `/api/loads`, `/api/trucks` y sus detalles responden 403 |
| `rechazado` | Transportista rechazado por el administrador | Igual que pendiente y además `gate.note` con el motivo. Al subir un documento nuevo vuelve a `pendiente` |

`checklist` solo existe para transportistas (`null` para mandantes). `docs[].status` puede ser `falta`, `pendiente`, `verificado` o `rechazado`.

Para pasar a `aprobado` hacen falta:
1. Correo verificado, con el enlace que llega por correo.
2. Teléfono verificado: `POST /api/verificacion/telefono` envía el código y `POST /api/verificacion/telefono/confirmar` con `{"code":"123456"}` lo confirma. Mientras no esté listo el canal de WhatsApp o SMS, el administrador lo marca a mano.
3. Los **6 documentos obligatorios aprobados**: `cedula`, `licencia`, `padron`, `revision`, `soap` y `permiso`.
4. Aprobación de un administrador en la web.

La aprobación no es automática, así que la app solo debe refrescar `/api/me`.

**Visitante sin sesión:** puede listar cargas y camiones, pero con `contactHidden: true`, `ownerName: ""`, `whatsapp: ""` y sin `notes`. No se envía `ownerId` ni otros identificadores internos de usuario. Muestra "Ingresa para ver el contacto". El dueño y el administrador sí reciben `ownerId` en su propia publicación (o en todas, el administrador).

## 5. Publicaciones

### `GET /api/loads` → 200 `Load[]` (máx. 200, sin sesión o con sesión aprobada)
Filtros opcionales (query): `equipment`, `origin`, `destination` (ciudad exacta), `originRegion`, `destinationRegion` (id de región, p. ej. `antofagasta`), `from` (AAAA-MM-DD, retiro desde), `minWeight`, `query` (texto), `verifiedOnly=1`, `sort`. También se aceptan los nombres de la web (`equipo`, `origen`, `destino`, `regionOrigen`, `desde`, `pesoMin`, `q`).
```json
{
  "id": "uuid", "createdAt": "…", "updatedAt": "…",
  "ownerId": "uuid", "ownerName": "Empresa SpA", "whatsapp": "56912345678", "contactHidden": false,
  "ownerVerification": "verificado", "ownerDocsOk": true,
  "origin": "Santiago", "destination": "Punta Arenas", "pickupDate": "2026-11-12",
  "equipment": "rampla_plana", "description": "Pallets", "weightT": 20, "specs": {},
  "budgetClp": 1500000, "notes": "…", "soloVerificados": false,
  "url": "https://www.carga360go.cl/cargas/uuid"
}
```
`demo: true` aparece solo en publicaciones de ejemplo. `budgetClp` y `notes` se omiten si están vacíos. `ownerId` solo aparece cuando quien consulta es el dueño o un administrador; en la consulta anónima o de un tercero el campo no se envía.

### `GET /api/loads/:id` → 200 `Load` | 404

### `POST /api/loads` → 201 `Load` (solo **mandante** o admin aprobado)
```json
{
  "origin": "Santiago", "destination": "Punta Arenas", "pickupDate": "2026-11-12",
  "equipment": "rampla_plana", "description": "Pallets", "weightT": 20,
  "specs": {}, "budgetClp": 1500000, "notes": "opcional", "soloVerificados": false
}
```
Se aceptan `weight` y `budget` como sinónimos. La fecha no puede ser anterior a hoy (hora de Chile) y `budgetClp` va en pesos enteros. Al publicar se avisa por correo a los camiones que calzan.

### `DELETE /api/loads/:id` → 204 (solo el dueño)

### `GET /api/trucks` → 200 `Truck[]`
Filtros: `equipment`, `origin`, `destination`, `originRegion`, `destinationRegion`, `onDate` (AAAA-MM-DD dentro de la disponibilidad), `minTonnage`, `verifiedOnly`, `sort`.
```json
{
  "id": "uuid", "createdAt": "…", "updatedAt": "…", "ownerId": "uuid", "ownerName": "…", "whatsapp": "…",
  "contactHidden": false, "ownerVerification": "verificado", "ownerDocsOk": true,
  "origin": "Concepción", "destination": "Santiago", "availableFrom": "2026-11-10", "availableTo": "2026-11-14",
  "equipment": "rampla_plana", "tonnage": 28, "specs": {}, "notes": "…",
  "url": "https://www.carga360go.cl/camiones/uuid"
}
```

### `GET /api/trucks/:id`, `POST /api/trucks` (solo **transportista** aprobado o admin), `DELETE /api/trucks/:id` (solo el dueño)
Cuerpo del POST: `{origin, destination, availableFrom, availableTo, equipment, tonnage, specs, notes}`.

**Equipos** (`equipment`), los mismos ids que ya usa la app: `rampla_plana`, `sider`, `furgon_seco`, `refrigerado`, `cama_baja`, `tolva`, `estanque`, `portacontenedor`, `camion_34`, `portaautos`, `peligrosa` y `otro`. Los campos de `specs` de cada equipo están en `GET /api/catalog` → `equipment[].truckFields` y `loadFields`.

## 6. Documentos (privados: solo los ve su dueño y el administrador)

Un transportista **pendiente sí puede** listar, subir y borrar sus documentos.

### `GET /api/documents` → 200
```json
[{ "id": "uuid", "type": "cedula", "label": "Cédula de identidad", "audience": "personal",
   "expiry": "2030-01-01", "holderName": "Juan Pérez", "detail": "A5", "truckId": "uuid",
   "fileName": "cedula.png", "contentType": "image/png", "sizeBytes": 12345, "hasFile": true,
   "verificationStatus": "pendiente", "verificationNote": "motivo si fue rechazado", "createdAt": "…" }]
```

### `POST /api/documents` → 201 (el mismo objeto)
**El archivo es obligatorio**: PDF, JPG, PNG o WEBP, de hasta 10 MB. Hay dos formas de enviarlo:
- **JSON con base64**, el formato que ya usa la app:
  `{"type":"cedula","expiry":"2030-01-01","contentType":"image/jpeg","fileName":"cedula.jpg","dataBase64":"…"}`.
  Por el aumento del base64, el archivo real puede pesar hasta unos **8 MB**.
- **multipart/form-data**, recomendado con `expo-image-picker` o `expo-document-picker`: los campos `type`, `expiry`, `holderName`, `detail` y `truckId`, más `file`. Admite hasta 10 MB.

Reglas por tipo:
- **Documentos del camión** (`padron`, `revision`, `permiso`, `soap`, `seguro_carga`, `gases`): envía `truckId` (un camión propio) **o** `holderName` con la **patente** (5 a 8 letras y números, p. ej. `ABCD12`).
- **Documentos personales** (`cedula`, `licencia`, `hoja_vida`, `antecedentes`, `manejo_defensivo`, `induccion`): `holderName` es el nombre del conductor. Si no lo envías, se usa `contactName`.
- **`licencia`** exige `detail` igual a `A2`, `A4` o `A5`.
- **`expiry`** es la fecha de vencimiento, en formato AAAA-MM-DD.

Cada documento queda `pendiente` hasta que el administrador lo revisa. Si un transportista rechazado sube uno nuevo, su cuenta vuelve a revisión.

**Cambio en la app:** la lista `DOC_TYPES` de la app es distinta. Reemplázala por `GET /api/catalog` → `documentTypes` (tiene `id`, `label`, `audience`, `details` y `requiredForCarrier`). Ya no existen `acred_minera`, `res_sanitaria`, `aut_peligrosa` ni `permiso_sobredim`, y hay que agregar `cedula` y `padron`.

### `GET /api/documents/:id` → el archivo (`content-type` real, `cache-control: private, no-store`) | 403 | 404
### `DELETE /api/documents/:id` → 204

## 7. Otros

- `GET /api/health` → `{"ok":true,"database":true,"documents":"private","auth":"bearer"}`
- `GET /api/catalog` → `{ company: {name, rut, privacyUrl, termsUrl}, regions[16]: {id, numeral, name, zone}, cities[]: {name, regionId, region, zone}, equipment[], documentTypes[], requiredCarrierDocs[6] }`. Úsalo para los selectores de región y ciudad, de equipo y de documento.
- `POST /api/import` → 501. No se importan publicaciones de la demo local.
- Recuperar contraseña: abre `https://www.carga360go.cl/recuperar` en el navegador. También existe `POST /api/auth/recuperar {"email"}`.

## 8. Textos legales y marca (obligatorio en la app y en las fichas de las tiendas)

- El titular es **CARGA360GO SpA, RUT 78.553.352-6**. Contacto: contacto@carga360go.cl.
- Quita toda mención a "BASSAM LOGISTICS & SOLUTIONS SpA", al RUT 78.390.218-4, a contacto@bassamspa.com y a "Carga Retorno 360" (`PLATFORM` en `shared/src/data.ts` y en `shared/src/legal.ts`).
- La política de privacidad es **https://www.carga360go.cl/privacidad** y los términos son **https://www.carga360go.cl/terminos**. Enlázalos desde la app (Inicio y Cuenta) y úsalos como "URL de política de privacidad" en Play Console y App Store Connect. No mantengas un texto propio distinto dentro de la app: muestra un resumen y enlaza la versión web.
- **Aceptación obligatoria (Política de Privacidad 1.2 y Términos de uso 1.0):** el registro (`POST /api/mobile/v1/auth/register`) exige `acceptPrivacy: true` y `acceptTerms: true` (si falta alguno responde 400 con `code` `privacidad_requerida` o `terminos_requeridos`). Las versiones vigentes vienen en `catalog.company.privacyVersion` y `catalog.company.termsVersion`. Si `gate.privacyRequired` es `true`, la app debe mostrar ambos textos (enlaces a /privacidad y /terminos) y enviar `POST /api/cuenta/privacidad` con `{"acceptPrivacy": true, "acceptTerms": true}` y el Bearer token; hasta entonces la cuenta no queda acreditada.
- **Periodo gratis por cuenta:** `user.freeUntil` y `gate.freeUntil` traen el último día gratis (YYYY-MM-DD, 30 días desde la inscripción). Muéstralo como «Tu periodo gratis termina el DD-MM-AAAA». No hay pagos en la app: después se cobrará una membresía con valores por definir, avisando antes y solo con aceptación del usuario.
- El enfoque es transportistas y mandantes con carga general y masiva a nivel nacional, de Arica a Punta Arenas. **No** menciones minería ni "faenas mineras".
- El borrado de cuenta usa `DELETE /api/me`. También puede pedirse por correo a contacto@carga360go.cl.
- `PrivacyInfo.xcprivacy` y la ficha de seguridad de datos de Play deben declarar que se recolectan los datos de la cuenta (nombre, correo, teléfono, RUT), las publicaciones y los documentos subidos. Todo eso se envía al servidor por https y no se usa para seguimiento.

## 9. Lista de cambios para la app (repo carga-retorno-360, PR #1)

1. `EXPO_PUBLIC_API_URL=https://www.carga360go.cl` en `eas.json` y `.env`. Ya no se necesita `netlify/` ni `server/` para la app.
2. `AccountResponse.profile.kind`: deja solo `transportista` y `generador`. Quita `ambos` del registro.
3. Guarda `gate` en la sesión y refréscalo con `GET /api/me`. Si `gate.locked` es true, muestra la pantalla "Cuenta en revisión" en lugar de las pestañas Cargas y Camiones, y trata el 403 como esa pantalla.
4. Publicar cargas solo si `gate.canPublishLoads`, y camiones solo si `gate.canPublishTrucks`.
5. Muestra `contactHidden` como "Ingresa para ver el contacto", sin botón de WhatsApp.
6. Documentos: sube el archivo real (es obligatorio) con multipart o base64, envía `holderName` (patente o nombre) y `detail` para la licencia, muestra `verificationStatus` y `verificationNote`, y usa el `documentTypes` del catálogo.
7. Usa ciudades y regiones de `/api/catalog`. La ciudad debe coincidir exactamente.
8. Contraseña: el servidor exige mínimo 8 caracteres. Puedes mantener 10 en la app.
9. Al hacer `logout`, llama a `POST /api/auth/logout` antes de `clearSession()`. Hoy el botón solo borra la sesión local.
10. Oculta "Copiar mis publicaciones locales al servidor", que responde 501.
11. Ajusta los textos legales y la marca según la sección 8.
