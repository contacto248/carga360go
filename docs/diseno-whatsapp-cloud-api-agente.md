# Diseño técnico — Agente Carga360go vía WhatsApp Business Cloud API

**Estado:** solo diseño (T-064). **Sin implementación**, sin credenciales en código, sin cifras públicas de precios/comisiones.  
**Marca visible:** Carga360go. **Botón flotante web (relacionado):** «Carga360».  
**Repo:** `contacto248/carga360go` · rama base de referencia `release/2026-11-15`.

---

## 1. Objetivo

Que el mismo agente comercial que hoy atiende en la web (`src/lib/agent/`) responda mensajes **entrantes** en WhatsApp Business usando la **Cloud API de Meta** (proveedor por defecto ya contemplado en `src/lib/whatsapp/`), con posibilidad de proveedor alterno 360dialog vía `WA_PROVIDER`.

El visitante de la web usa un solo FAB «Carga360»; desde el panel puede «Continuar por WhatsApp». En WhatsApp, el bot (cuando esté habilitado) reutiliza el motor del agente.

---

## 2. Número y cuenta Business

| Ítem | Valor / requisito |
| --- | --- |
| Número público Carga360go | `+56 9 5842 8693` (`BRAND.whatsapp` / `BRAND.whatsappDisplay`) |
| Producto | WhatsApp Business Platform — Cloud API (Meta) |
| Identificadores (solo en secretos de entorno / panel Meta; **nunca en git**) | `WA_PHONE_NUMBER_ID`, `WA_WABA_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` |
| Display name | Debe coincidir con marca **Carga360go** / razón social aprobada en Meta Business |
| Calidad del número | Mantener calidad Alta/Media; evitar spam y plantillas rechazadas en masa |

---

## 3. Arquitectura de mensajes

```
Usuario WhatsApp
    → Meta Cloud API (webhook POST firmado)
    → /api/whatsapp/webhook  (ya existe)
    → processWebhookPayload → motor agente (si AGENT_WHATSAPP_ENABLED / ajuste admin)
    → send (Graph API /messages)
    → Usuario
```

- **Entrantes (inbound):** texto (y, si se habilita después, botones interactivos). Multimedia avanzada queda fuera del MVP del agente.
- **Salientes (outbound) dentro de ventana 24 h:** texto libre de sesión (mismo tono que el agente web: español de Chile, sin comisiones ni precios de membresía).
- **Fuera de ventana 24 h:** solo **plantillas** Utility/Marketing aprobadas por Meta (ver §5).
- **Pausa humana:** si alguien del equipo responde desde la app WhatsApp Business, el bot calla `WA_HUMAN_PAUSE_HOURS` (por defecto 12 h) en ese chat — ya modelado en config.

---

## 4. Webhook

| Aspecto | Diseño |
| --- | --- |
| URL pública | `https://carga360go.cl/api/whatsapp/webhook` (o dominio canónico vigente) |
| GET (challenge) | Meta envía `hub.mode`, `hub.verify_token`, `hub.challenge`. Validar contra `WA_VERIFY_TOKEN`; responder challenge en texto plano. |
| POST | Cuerpo JSON; validar firma `X-Hub-Signature-256` con `WA_APP_SECRET`. Sin secreto → no procesar (comportamiento actual). |
| Respuesta HTTP | 200 inmediato (`EVENT_RECEIVED`); procesamiento en `after()` para no provocar reintentos de Meta. |
| Idempotencia | Deduplicar por `wamid` / id de mensaje Meta al persistir. |
| Límite de cuerpo | Ya acotado (~1 MiB) en la ruta. |
| Campos a suscribir en Meta | `messages`, `message_template_status_update` (y opc. `phone_number_quality_update`) |

**Proveedor 360dialog (opcional):** mismo endpoint; autenticación por header compartido `X-Carga360-Secret` (`WA_360_WEBHOOK_SECRET`). No mezclar secretos entre proveedores.

---

## 5. Plantillas (fuera de ventana)

Solo diseño / nombres lógicos. Textos de plantilla y variables de entorno se documentan aparte cuando Gerencia apruebe altas en Meta. **No incluir tokens ni IDs en este archivo.**

| Uso | Categoría sugerida | Notas |
| --- | --- | --- |
| OTP / verificación de contacto | UTILITY | Alineado a flujos KYC y seguimiento SEG-XXXXXX |
| Aviso verificación provisional / revocación | UTILITY | Ver `docs/whatsapp-plantilla-verificacion-manual.md` (pendiente aprobación Meta) |
| Reenganche comercial genérico | MARKETING | Solo con opt-in; no precios ni comisiones en el copy |
| Recordatorio de documentos | UTILITY | Sin datos sensibles en variables públicas |

Reglas de copy: marca **Carga360go**; no cifras de tarifas de membresía ni comisiones; enlaces a `https://carga360go.cl` o rutas de panel.

---

## 6. Habilitación del agente en WhatsApp

Orden operativo (sin deploy desde este documento):

1. Secretos Cloud API configurados en el entorno de ejecución (no en el repo).
2. Webhook verificado en Meta.
3. `WA_BOT_ENABLED=true` **o** interruptor en `/admin/whatsapp`.
4. `AGENT_WHATSAPP_ENABLED=true` **o** interruptor en `/admin/agente` para que el bot use el flujo del agente (cotizar, registro, seguimiento, soporte) en lugar del menú de reglas solo-WhatsApp.
5. Probar en número de prueba / sandbox antes de tráfico real.

Apagado seguro: desactivar bot en admin deja de responder; el webhook sigue ACK 200.

---

## 7. Costos (sin cifras públicas)

- Meta cobra por **conversación** / categoría de mensaje según el plan vigente de WhatsApp Business Platform en Chile.
- Hay tramos gratuitos o de servicio al cliente según políticas actuales de Meta; **no se publican montos en este diseño ni en la UI del agente**.
- Plantillas Marketing suelen costar más que Utility; preferir Utility para OTP y avisos operativos.
- Internamente, Gerencia lleva el control de gasto en la consola Meta / facturación del Business Manager; el producto Carga360go **no muestra** tarifas de WhatsApp al visitante.
- El agente web/voz sigue sin claves de voz de pago (Web Speech API); el costo Cloud API es solo del canal WhatsApp.

---

## 8. Seguridad y cumplimiento

- Credenciales solo en variables de entorno / secret store del host; rotación periódica del token de sistema.
- Firma de webhook obligatoria; rechazar POST sin firma válida.
- Rate limits por chat (`BOT_RATE` en config) y ventana máxima de mensajes entrantes (`MAX_INBOUND_AGE_MS`).
- No loguear cuerpos completos con PII; auditoría con IDs.
- Opt-in / consentimiento alineado a política de privacidad y, cuando aplique, Ley 21.719 (cookies distintas del canal WA).
- Si en release entra el flujo de «contacto obligatorio antes de abrir WhatsApp» desde la web, el enlace «Continuar por WhatsApp» del FAB debe respetarlo; **en `release/2026-11-15` ese gate aún no está mergeado** — el panel usa el `wa.me` con mensaje informativo de marca.

---

## 9. Relación con el FAB unificado (T-064)

| Antes (problema) | Después |
| --- | --- |
| FAB azul / Asistente, FAB verde WhatsApp, FAB naranjo agente se tapaban | Un solo FAB **Carga360** |
| Acciones repartidas | Panel absorbe: Continuar por WhatsApp + cotizar, publicar carga, registro transportista, seguimiento, soporte |
| Cookies HubSpot (PR #13) | Dock se eleva con `body:has(.cookie-banner)` para no solaparse |

Este documento no implementa el bot; documenta cómo el canal Cloud API debe alimentar al mismo agente.

---

## 10. Criterios de aceptación (futura implementación)

1. Webhook GET/POST verificados en Meta contra el entorno staging autorizado.
2. Mensaje de prueba entrante recibe respuesta del motor agente sin credenciales en el repo.
3. Fuera de 24 h, solo plantillas aprobadas; dentro de 24 h, texto de sesión.
4. Pausa humana funciona tras respuesta manual desde la app Business.
5. Copy sin precios/comisiones; marca Carga360go.
6. Apagado desde admin sin redeploy de código.
7. Pruebas automatizadas del webhook (firma, challenge, rate) en CI, sin secretos reales.

---

## 11. Referencias en código (lectura)

- `src/app/api/whatsapp/webhook/route.ts` — entrada HTTP
- `src/lib/whatsapp/config.ts` — variables `WA_*` (nombres, no valores)
- `src/lib/whatsapp/send.ts` / `bot.ts` / `webhook.ts`
- `src/lib/agent/` — motor compartido web / WhatsApp / teléfono
- `docs/AGENTE-VOZ.md` — activación del agente
- `docs/whatsapp-plantilla-verificacion-manual.md` — plantillas KYC pendientes Meta
