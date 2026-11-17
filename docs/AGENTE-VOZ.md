# Agente comercial de voz y texto (CARGA360)

Módulo reutilizable en `src/lib/agent/` para la web (widget con chat y voz), WhatsApp (opcional) y teléfono (interfaz Twilio, no conectada).

## Activación (todo apagado por defecto)
| Variable / ajuste | Efecto |
|---|---|
| `AGENT_ENABLED=true` o ajuste en /admin/agente | Muestra el widget en la web (reemplaza el botón del chat web anterior) y habilita `/api/agente`. |
| `AGENT_WHATSAPP_ENABLED=true` o ajuste en /admin/agente | El bot de WhatsApp usa el flujo del agente. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `AGENT_PHONE_ENABLED=true` | Conecta `/api/agente/telefono` (TwiML con firma verificada). **De pago: requiere autorización.** |
| `SMTP_HOST` (o plantilla OTP de WhatsApp) | Permite enviar el código de un solo uso para consultar el estado de una carga con su código SEG-XXXXXX. Sin envío, el agente deriva al panel con sesión. |
| Claves de IA existentes (`src/lib/assistant`) | Respuestas libres con IA; sin clave, respuestas por reglas (se rotula en el widget). |

## Avatar en el panel FAB (Carga360)
Zona de cara/video **dentro** del panel del FAB único «Carga360» (no hay un segundo flotante). Por defecto usa avatar local (ilustración + lip-sync falso). Proveedores de pago (HeyGen / D-ID) **apagados** hasta decisión de Gerencia.

| Variable (solo nombres; sin valores en git) | Efecto |
|---|---|
| `NEXT_PUBLIC_AVATAR_ENABLED` / `AVATAR_ENABLED` | `true` habilita el gancho de proveedor real. Defecto: apagado → UI mock. |
| `NEXT_PUBLIC_AVATAR_PROVIDER` | `mock` (defecto) \| `static` \| `heygen` \| `did`. |
| `NEXT_PUBLIC_AVATAR_STATIC_URL` | Imagen o video público (loop) sin proveedor de pago. |
| `NEXT_PUBLIC_AVATAR_STREAM_URL` | URL de stream si ya hay sesión del proveedor (futuro). |
| `AVATAR_HEYGEN_API_KEY` / `AVATAR_DID_API_KEY` | Solo servidor. **No** crear cuentas ni contratar desde este repo; no subir valores. |

El estado público (sin secretos) sale en `GET /api/agente` → `status.avatar` (`src/lib/agent/avatar.ts`).

## Reglas fijas
- No habla de comisiones, modelos de cobro ni estrategia de precios, ni promete precios cerrados. Ante costos explica que el costo real se calcula con la ruta, peajes por ejes, diésel y costos operacionales; el agente usa el motor de costos (`src/lib/agent/costs.ts` → `src/lib/costos/engine.ts`, función única `quote`) y solo dice el costo referencial con IVA cuando la cotización está completa y sin pendientes, aclarando que es referencial y que se calculó con la ruta, los peajes por ejes, el diésel y la fecha de la fuente. Nunca menciona el margen.
- No entrega datos de cargas sin verificar a la persona (código de seguimiento + código de un solo uso al contacto registrado, o sesión iniciada).
- Los mensajes se guardan con datos sensibles ocultos; los registros (logs) solo llevan identificadores.

## Datos
Migración 15 (`docs/migrations/015-agente-comercial.sql`): solo crea tablas nuevas (`agent_conversations`, `agent_messages`, `agent_leads`, `load_tracking_codes`, `agent_otp_challenges`). Reversión manual incluida en ese archivo.
