# Plantillas de WhatsApp — verificación manual (solo lectura)

**Estado: pendiente de aprobación de Meta.** No están dadas de alta en la cuenta de WhatsApp Business de Carga360go. El sistema no las envía hasta que estén aprobadas y se configuren las variables de entorno indicadas abajo.

Fuera de la ventana de atención de 24 horas (último mensaje entrante de la persona), WhatsApp no permite un texto libre: hay que usar una plantilla Utility aprobada. Dentro de esa ventana se envía el texto completo de sesión, sin plantilla.

Idioma: español (`es`). Categoría: **UTILITY**. Botón de URL estático (sin variable) a `https://www.carga360go.cl/panel`.

## 1. Otorgar solo lectura

- Nombre: `verificacion_manual_solo_lectura`
- Variable de entorno, una vez aprobada: `WA_READONLY_TEMPLATE=verificacion_manual_solo_lectura`
- Idioma (opcional): `WA_READONLY_TEMPLATE_LANG=es`

Cuerpo propuesto:

```
Estimado/a {{1}}: se aprobó su verificación provisional en Carga360go por un plazo máximo de 30 días, hasta el {{2}}. Documentación pendiente: {{3}}.
```

| Variable | Contenido |
| --- | --- |
| {{1}} | Nombre de contacto |
| {{2}} | Fecha de vencimiento (dd-mm-aaaa, calendario de Chile) |
| {{3}} | Resumen corto de la documentación pendiente (lista breve o cantidad; máx. 200 caracteres) |

Botón: «Ir al panel» → `https://www.carga360go.cl/panel`

## 2. Revocar solo lectura

- Nombre: `verificacion_manual_revocada`
- Variable de entorno, una vez aprobada: `WA_READONLY_REVOKE_TEMPLATE=verificacion_manual_revocada`

Cuerpo propuesto:

```
Hola {{1}}: el acceso de solo lectura a Carga360go fue revocado. Ya no puedes ver los movimientos de la plataforma hasta completar tu acreditación.
```

| Variable | Contenido |
| --- | --- |
| {{1}} | Nombre de contacto |

Botón: «Ir al panel» → `https://www.carga360go.cl/panel`

## 3. Qué ocurre mientras no estén aprobadas

Si el canal de WhatsApp (Cloud API o 360dialog) no está configurado, el aviso se guarda en el outbox con el estado `no enviado: canal no configurado`. Nunca se marca como enviado.

Si el canal está configurado, no hay ventana de 24 h y estas plantillas no están configuradas o Meta las rechaza, el aviso queda en el outbox con el estado `no enviado: requiere plantilla aprobada de Meta`. El correo se intenta por su lado (SMTP o outbox). La verificación manual se otorga o se revoca igual: el envío no la bloquea.
