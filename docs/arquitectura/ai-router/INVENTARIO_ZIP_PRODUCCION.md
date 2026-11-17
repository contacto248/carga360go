# Inventario exacto — CARGA360GO-PRODUCTION-FINAL.zip

| Campo | Valor |
| --- | --- |
| Zip vigente | `internal/CARGA360GO-PRODUCTION-FINAL.zip` del store del proyecto |
| Fecha dentro del zip | 2026-11-17 10:48 |
| Entradas | 10 (3 son directorios vacíos de listado) |
| Bytes sumados | 11249 |
| Este documento | Solo inventario. No porta el orquestador, no arranca Docker ni FastAPI, no trae claves. |
| Zip que reemplaza donde se solapan | `internal/Carga360GO_Dual_AI_Orchestrator.zip` (2026-11-17 10:42, 8 entradas, 8204 bytes) |

El zip vigente es un servicio FastAPI aparte, en su propia carpeta `CARGA360GO-PRODUCTION/`. No contiene el Core de Carga360GO, ni bots, ni automatizaciones, ni una base de datos. La decisión de Gerencia es no mantener ese servicio como segunda aplicación: cuando se porte, vive dentro del Next.js. Este archivo no hace ese porte.

No hay claves reales. `OPENAI_API_KEY` y `XAI_API_KEY` van vacíos en el ejemplo. `IAM_SHARED_TOKEN` del ejemplo es un texto de reemplazo, no un secreto de producción. El fuente, si esa variable no está, usa el literal `change-me`. Eso es un default inseguro del zip. No es una credencial de Carga360GO y no se copia a un `.env` real.

## 1. Rutas dentro del zip

| Ruta en el zip | Bytes | Qué es |
| --- | ---: | --- |
| `CARGA360GO-PRODUCTION/` | 0 | Directorio raíz |
| `CARGA360GO-PRODUCTION/.env.example` | 134 | Variables de ejemplo. Claves de API vacías |
| `CARGA360GO-PRODUCTION/Dockerfile` | 191 | Imagen Python 3.12, comando uvicorn |
| `CARGA360GO-PRODUCTION/README.md` | 833 | Arranque, uso de `POST /v1/chat` y aviso de no publicar el puerto |
| `CARGA360GO-PRODUCTION/app/` | 0 | Directorio del módulo |
| `CARGA360GO-PRODUCTION/app/__pycache__/` | 0 | Directorio de bytecode |
| `CARGA360GO-PRODUCTION/app/__pycache__/main.cpython-312.pyc` | 6650 | Bytecode CPython 3.12 del mismo `app/main.py`. No es otro programa |
| `CARGA360GO-PRODUCTION/app/main.py` | 3061 | Único fuente. 61 líneas |
| `CARGA360GO-PRODUCTION/docker-compose.yml` | 306 | Un servicio, puerto 8080, healthcheck |
| `CARGA360GO-PRODUCTION/requirements.txt` | 74 | Cuatro paquetes con versión fijada |

No hay tests, `README` de API, esquema SQL, ni carpeta `src/`. El bytecode declara `co_filename` = `CARGA360GO-PRODUCTION/app/main.py` y los mismos nombres que el fuente: `ChatRequest`, `call_openai`, `call_xai`, `authorize`, `health`, `chat`, rutas `/health` y `/v1/chat`. No agrega endpoints.

## 2. Endpoints y funciones reales

Aplicación: `FastAPI(title='Carga360GO Dual AI Orchestrator', version='1.0.0')` en `app/main.py`.

| Símbolo | Tipo | Qué hace el fuente |
| --- | --- | --- |
| `ChatRequest` | Modelo pydantic | `prompt` str, largo 1 a 50000. `provider`: `auto`, `openai` o `xai`, default `auto`. `system`: str opcional, sin tope de largo en el modelo |
| `call_openai` | async | Si no hay clave, `RuntimeError`. POST `https://api.openai.com/v1/responses` con `model`, `input` y, si viene `system`, `instructions` |
| `call_xai` | async | Igual contra `https://api.x.ai/v1/responses` |
| `authorize` | sync | Compara el header entero con `Bearer ` más el token compartido. Si no coincide, HTTP 401 y el texto `Unauthorized` |
| `health` | `GET /health` | No pide autorización |
| `chat` | `POST /v1/chat` | Pide `authorize` y luego recorre proveedores |

`GET /health` responde:

```json
{"status":"ok","openai_configured":true,"xai_configured":false}
```

Los booleanos son la presencia de la clave leída al importar el módulo. No llaman al proveedor. No devuelven la clave ni el modelo.

`POST /v1/chat` lee el JSON como `ChatRequest` y tres headers opcionales: `Authorization`, `X-Tenant-Id`, `X-User-Id`. El cuerpo no tiene campos `tenant_id` ni `user_id`.

Respuesta 200, armada en el `return` de `chat` más lo que devuelve `call_openai` o `call_xai`:

| Campo | Origen |
| --- | --- |
| `trace_id` | `uuid.uuid4()` al entrar, antes de llamar proveedores |
| `tenant_id` | Header `X-Tenant-Id`, o null |
| `user_id` | Header `X-User-Id`, o null |
| `fallback_used` | True si el proveedor que respondió no es el primero del orden |
| `latency_ms` | Milisegundos enteros desde el inicio del request hasta esa respuesta. Incluye el intento fallido |
| `provider` | `openai` o `xai` |
| `model` | El valor de `OPENAI_MODEL` o `XAI_MODEL` |
| `text` | Ver extracción abajo |
| `usage` | El objeto `usage` del JSON del proveedor, o `{}` |

Texto OpenAI: `output_text` si viene con contenido. Si falta o es vacío, une con un espacio el campo `text` de cada dict dentro de `output[].content`. No filtra `type == output_text`.

Texto xAI: solo `output_text`, o cadena vacía. No recorre `output`.

Si los dos proveedores fallan, HTTP 502. El detalle es `trace_id` y `providers_failed`: lista de `{provider, error}`. `error` es `type(e).__name__`, no el mensaje. Una clave ausente queda como `RuntimeError`. Un fallo HTTP, de red o de timeout queda con el nombre de la excepción de httpx. El mensaje `OPENAI_API_KEY missing` no sale en esa respuesta.

FastAPI valida el cuerpo antes de `chat`. Un `provider` fuera de `auto|openai|xai`, o un `prompt` vacío o de más de 50000 caracteres, no entra a `authorize`. El zip no define un manejador propio para ese error.

No hay otros decoradores. No hay `POST /v1/orchestrate`, ni modo `both`, ni tools, ni function calling.

## 3. Implementado y lo que no está

En `app/main.py` no hay `TODO`, `FIXME`, `NotImplemented`, `pass` ni `...`. Lo que el archivo escribe, lo ejecuta. El hueco no es un comentario pendiente: son piezas que el archivo no tiene.

Implementado en el fuente:

- App FastAPI con `/health` y `/v1/chat`.
- Llamada real a la Responses API de OpenAI y de xAI, con timeout de httpx.
- Orden de fallback descrito abajo.
- Comparación del header `Authorization` contra un token compartido.
- `trace_id`, `latency_ms`, `provider`, `model`, `usage` y `fallback_used` en el JSON de respuesta.
- Validación de `prompt` y de `provider` con pydantic.

No está en el zip, y no hay stub que lo simule:

- IAM de verdad: no hay JWT, OIDC, roles, sesión ni consulta a un directorio. El README lo dice: el token compartido hay que sustituirlo por JWT/OIDC contra el IAM de Carga360GO antes de exponer el puerto.
- `tenant_id` y `user_id` no se leen de una sesión ni de una tabla. Se copian de headers y se devuelven tal cual. No se comprueban.
- No hay tabla ni archivo de auditoría. El único registro de proveedor y modelo es el JSON de la respuesta HTTP. No hay `logging` ni `print`.
- No hay Core, bots, automatizaciones, colas ni base de datos.
- No hay reintento del mismo proveedor. Un fallo pasa al otro.
- No hay política por palabras del prompt. `auto` no inspecciona el texto.
- No hay modo `both`.
- No hay function calling ni tools MCP.
- Las claves, los modelos, el token y el timeout se leen una vez al importar (`os.getenv` en el cuerpo del módulo), no en cada request.
- `/health` no comprueba que el proveedor responda. El healthcheck de Compose solo mira que esa ruta abra.
- No hay tests.

`change-me` como default de `IAM_SHARED_TOKEN` está escrito en el fuente. Quien levante el proceso sin la variable acepta `Authorization: Bearer change-me`. El README pide cambiarlo. El `.env.example` no trae ese literal: trae un texto de reemplazo.

## 4. Dependencias

`requirements.txt`, versiones fijadas con `==`:

| Paquete | Versión en el zip |
| --- | --- |
| fastapi | 0.115.6 |
| uvicorn[standard] | 0.34.0 |
| httpx | 0.28.1 |
| pydantic | 2.10.5 |

El `Dockerfile` parte de `python:3.12-slim`, copia `requirements.txt`, instala con pip sin caché, copia `app/` y arranca `uvicorn app.main:app --host 0.0.0.0 --port 8080`. No declara `EXPOSE`. No copia un `.env`.

`docker-compose.yml` define un solo servicio, `orchestrator`: `build: .`, `restart: unless-stopped`, `env_file: .env`, puerto `8080:8080`. El healthcheck corre Python contra `http://localhost:8080/health` cada 30 segundos, timeout 5 segundos, 3 reintentos. No tiene `start_period`.

Esas piezas quedan como referencia. No se despliegan con este documento.

## 5. IAM, tenant_id y user_id

IAM, en este zip, es `authorize`:

1. Lee `IAM_SHARED_TOKEN` al importar. Si no existe, el valor es `change-me`.
2. En `POST /v1/chat` exige que `Authorization` sea exactamente `Bearer ` más ese valor.
3. Si no, responde 401. No mira firma, caducidad, rol ni emisor.

`GET /health` no llama a `authorize`.

`tenant_id` y `user_id` salen de `X-Tenant-Id` y `X-User-Id`. Son opcionales. El código no los valida, no los busca en el cuerpo y no los persiste. Los vuelve a poner en el JSON de éxito. En el 502 no van: el detalle solo lleva `trace_id` y `providers_failed`.

El README documenta esas dos cabeceras y el bearer del token compartido. También dice que, antes de Internet, hay que poner TLS, WAF y proxy, no publicar el 8080, rotar secretos y cambiar el token compartido por JWT/OIDC del IAM real.

Eso no es el IAM de `docs/arquitectura/IAM_V1.md`. Este inventario no modifica ese documento.

## 6. Fallback, timeouts, trace_id y registro

Orden, copiado del `if` de `chat`:

| `provider` del cuerpo | Orden real |
| --- | --- |
| `auto` | `openai`, luego `xai` |
| `openai` | `openai`, luego `xai` |
| `xai` | `xai`, luego `openai` |

Cualquier excepción del intento entra en `providers_failed` y sigue. Si el segundo responde, `fallback_used` es true. El README dice lo mismo: `auto` prueba OpenAI y, si falla, xAI; si se fuerza un proveedor, el otro es el fallback.

No hay un segundo intento contra el mismo proveedor.

Timeout: `PROVIDER_TIMEOUT`, default `45`, convertido con `float` al importar. Se pasa a `httpx.AsyncClient(timeout=TIMEOUT)`. Es un número en segundos. Un valor no numérico rompe el import del módulo. El zip no lo atrapa.

`trace_id` es un UUID 4 en texto, uno por request de chat, también en el 502.

Registro de proveedor y modelo: los campos `provider` y `model` de la respuesta 200, junto con `usage`. No hay otra bitácora en el zip.

## 7. Diferencias con el zip anterior

El anterior es `Carga360GO_Dual_AI_Orchestrator.zip`. Archivos: `.env.example` (102), `Dockerfile` (199), `README.md` (698), `__pycache__/` (0), `__pycache__/main.cpython-312.pyc` (4670), `docker-compose.yml` (117), `main.py` (2353), `requirements.txt` (65). El fuente está en la raíz, no en `app/`.

| Tema | Zip anterior (`main.py` en la raíz) | Zip vigente (`app/main.py`) |
| --- | --- | --- |
| Ruta de chat | `POST /v1/orchestrate` | `POST /v1/chat` |
| Salud | `{"ok": true, "providers": ["openai", "xai"]}` siempre esos dos nombres | `status`, `openai_configured`, `xai_configured` según haya clave |
| Proveedores aceptados | `auto`, `openai`, `xai`, `both` | `auto`, `openai`, `xai` |
| `auto` | Si el prompt contiene `x `, `twitter`, `tendencia` o `redes sociales`, elige xAI; si no, OpenAI. No hay fallback | Siempre OpenAI y, si falla, xAI |
| Forzar un proveedor | Solo ese. Si falta la clave, HTTP 503 | Ese primero y el otro como fallback |
| `both` | Llama a los dos con `asyncio.gather` y devuelve los dos resultados o el `str` de la excepción | No existe |
| Modelo xAI por defecto | `grok-4.7` | `grok-4` |
| Modelo OpenAI por defecto | `gpt-5` | `gpt-5` |
| Timeout | 120 segundos, fijo en el código | `PROVIDER_TIMEOUT`, default 45 segundos |
| Instrucciones de sistema | No | Campo `system`, enviado como `instructions` |
| Identidad | No hay auth, ni tenant, ni user | Bearer de token compartido. Headers `X-Tenant-Id` y `X-User-Id` se ecoan |
| `trace_id`, latencia, fallback | No | Sí, en la respuesta |
| Texto de la respuesta | Filtra `type == output_text` y une con salto de línea. Devuelve `raw_id` y `provider` igual a la URL base | OpenAI une con espacio sin filtrar tipo. xAI solo `output_text`. `provider` es `openai` o `xai`. Incluye `usage`. No devuelve `raw_id` |
| Clave ausente | HTTP 503 con un texto que nombra la URL base, no la clave | `RuntimeError`, y el cliente del 502 solo ve el nombre de la clase |
| Error HTTP del proveedor | Reenvía el status y el cuerpo (`r.text`) | `raise_for_status()` y el 502 final solo guarda el nombre de la clase |
| Ejemplo de claves | Textos `pon_tu_clave_openai` y `pon_tu_clave_xai` | Claves vacías. Token IAM como texto de reemplazo |
| Requirements | Mínimos sin fijar (`fastapi>=0.115`, `uvicorn[standard]>=0.30`, `httpx>=0.27`, `pydantic>=2.8`) | Versiones fijadas (tabla de arriba) |
| Imagen | Copia `main.py`, `EXPOSE 8080`, `uvicorn main:app` | Copia `app/`, sin `EXPOSE`, `uvicorn app.main:app` |
| Compose | Sin healthcheck | Healthcheck a `/health` |
| README | Lo describe como capa desacoplada, sin base de Carga360, para enchufar después al Core | Servicio mínimo desplegable. Pide no publicar el 8080 y cambiar el token por JWT/OIDC |

Los dos zips se titulan igual y los dos hablan con `/v1/responses`. Donde se pisan, manda el vigente. El modo `both`, la política por palabras y el timeout fijo de 120 segundos no se arrastran.

## 8. Qué se porta a TypeScript / Next.js

Todavía no está portado. El porte, cuando siga, entra en este mismo repositorio Next.js. No queda un segundo proyecto FastAPI ni un Compose de producción.

Se porta el comportamiento del fuente vigente:

- Conversación contra OpenAI o xAI por la Responses API (`/v1/responses`), con `input` y `instructions`.
- Orden de fallback de la tabla de arriba. Sin modo `both` y sin la política de palabras del zip anterior.
- Timeout por `PROVIDER_TIMEOUT` (segundos, default 45).
- `trace_id` por request, `latency_ms`, `fallback_used`, `provider`, `model` y `usage` numérico.
- Salud con `status` y los dos booleanos de clave configurada, sin devolver la clave.
- Extracción de texto distinta para OpenAI y para xAI, como está escrita.

Condiciones de este repositorio, que el zip no trae y el porte sí respeta:

- Flag `AI_ROUTER_ENABLED` apagado por defecto. Solo el texto exacto `true` lo enciende. Apagado, la ruta nueva responde 404 JSON.
- `OPENAI_API_KEY` y `XAI_API_KEY` solo desde el entorno de runtime. No van en código, tests, fixtures ni logs. En `.env.example` de Next quedan vacías. Los modelos y el timeout también salen del entorno (`OPENAI_MODEL`, `XAI_MODEL`, `PROVIDER_TIMEOUT`), leídos en el request, no en el import.
- `tenant_id` y `user_id` salen de la sesión de Carga360GO. No se aceptan del cuerpo ni de `X-Tenant-Id` / `X-User-Id`. Hoy la sesión tiene usuario y no tiene tenant: `user_id` es el id de esa sesión y `tenant_id` queda vacío hasta que la sesión traiga tenant. No se inventa un tenant leyendo headers.
- El token compartido y el default `change-me` no se portan. La autorización del chat es la sesión que ya tiene la app. El README del zip ya pide sustituir ese token por el IAM real; el IAM de producción no está en este zip.
- Docker, uvicorn y FastAPI no se despliegan. Si más adelante se copia el zip al repo, es referencia, sin `__pycache__` y sin claves.
- El registro de proveedor y modelo que el zip solo devuelve en JSON, el porte lo deja además en auditoría (trace, proveedor, modelo, latencia, resultado), sin prompt, sin claves y sin datos personales en claro. Esa tabla no existe en el zip. La 030 ya es la operación. La 031 no se usa aquí.

Fuera del zip, y por eso fuera de este porte hasta que Gerencia lo ponga en un fuente: bots, automatizaciones, Core, function calling, tools MCP, Approval Engine y el modo `both` del zip anterior.

El maestro `OPS_FEATURE_ENABLED` no envuelve este orquestador. En este repo ese maestro solo condiciona los flags hijos declarados en `src/lib/ops/flags.ts`. El router no es una ruta `/api/ops`. Su interruptor es `AI_ROUTER_ENABLED`.
