# Inventario visual

Documento de solo lectura del árbol de páginas. No cambia pantallas, login, pagos, textos legales, flags ni variables de entorno.

Base: punta de `release/2026-11-15`, `be067cb` (merge del PR #55). Incluye `f405ce5` (merge del PR #54). Runtime: Next.js 15, App Router, `src/app/**/page.tsx`.

Este archivo no abre los PRs de diseño. Esos PRs siguen en la sección [Plan](#plan-de-prs-sin-implementar).

## Cómo se leyó

Hay **62** archivos `page.tsx`. Cada fila de abajo es uno de ellos. No hay grupos de rutas `(...)`, ni rutas paralelas, ni páginas fuera de `src/app`.

No se listan los `route.ts` de `src/app/api/**`: no son páginas.

`src/app/not-found.tsx`, `src/app/error.tsx` y `src/app/loading.tsx` no son rutas. El 404 dice «No encontramos esa página» y ofrece cargas, inicio y contacto. El error dice «No pudimos cargar esta página». La carga dice «Cargando…».

Tres estados:

| Estado | Significado |
| --- | --- |
| viva | La URL renderiza la página sin un flag de función. |
| flag apagado | La URL responde 404 mientras la variable no enciende el módulo. |
| placeholder | La página abre, y el cuerpo que se pinta es un hueco (`--`, «Sin datos», «Esperando datos reales») y no una vista de operación completa. |

Acceso:

| Acceso | Significado |
| --- | --- |
| pública | Se abre sin sesión. |
| sesión opcional | Se abre sin sesión; con sesión muestra más datos o acciones. |
| admin | El contenido pide `role === "admin"`. Sin sesión, puerta de ingreso o 404, según la fila. |
| cuenta | El contenido pide sesión de mandante, transportista o dueño. |

Los redirects de `next.config.ts` no son páginas. Están al final del inventario para no contarlos como rutas.

## Marca y cromo que ya están

Nombre en código: `Carga360go` (`BRAND.name` en `src/lib/catalog.ts`). Razón social: CARGA360GO SpA.

Logo que usa el header, el pie, `/empresas` y `/admin/bassam360`:

- `public/brand/logo-wordmark.png`
- `public/brand/logo-wordmark@2x.png`

Alturas actuales, solo escala: 36 px en el header (`width` 159), 40 px en el pie (`width` 177), 50 px en BASSAM 360 (`width` 220). También existe `public/brand/icon.png` y `public/brand/agent-mark.svg`. El wordmark es el logo de marca.

Tipografía del layout raíz (`src/app/layout.tsx`): Sora en títulos (`--font-display`) y Figtree en el cuerpo (`--font-body`). `themeColor`: `#0B1633`.

Cromo público: banner superior, header navy sticky, pie navy, tabbar fijo bajo 820 px. `/agente-360go` no lleva header ni pie (`app-standalone`).

Nav pública de hoy (`src/components/Header.tsx`), no es lateral:

- Escritorio, desde 820 px: Publicar carga (`/mi-cuenta?rol=mandante`), Camiones, Mi cuenta, Tecnología, más Ingresar o Salir. Si la ruta es `/admin` o `/mi-cuenta`, suma «Agente BASSAM 360». Si la sesión es admin, suma Panel BASSAM y BASSAM 360.
- Móvil, bajo 820 px: la fila del header se oculta; queda el logo, Ingresar o Salir, y una tabbar de esos cuatro enlaces.

`/admin` y la mayoría de sus hijas usan `AdminNav`: pastillas horizontales, no una torre.

`/admin/control` y `/admin/ops` usan el shell de `src/components/control/control.module.css`: sidebar oscura y acento `#79b7e9`. Esa paleta es del panel interno. No es la paleta del logo. El sistema de diseño futuro no la adopta como marca.

`src/app/home.module.css` no está importado. No forma parte de la portada viva.

## Tokens vigentes

Hay dos bloques `:root` en `src/app/globals.css`. El segundo (comentario «Diseño visual nov-2026 · capa 2», paleta del logo) pisa las variables que repite. Los valores de abajo son los que quedan aplicados.

| Token | Valor vigente | Uso |
| --- | --- | --- |
| `--navy` | `#0B1633` | Header, pie, hero, `themeColor`. No lo pisa el segundo bloque. |
| `--navy2` | `#152647` | Hover del nav y menú. |
| `--brand-navy` | `#002451` | Azul del logo. Acentos de portada y mapa. |
| `--brand-orange` | `#FF5001` | Naranjo del logo. Filetes, subrayados, no es el texto de botón. |
| `--accent` | `#C84300` | Botón y foco de acción. El segundo bloque reemplaza `#F26B1D`. |
| `--accent2` | `#A33600` | Hover del botón. Reemplaza `#D95A12`. |
| `--bg` | `#f5f7fa` | Fondo de página. |
| `--ink` | `#0f1b2d` | Texto. |
| `--card` | `#fff` | Tarjetas. |
| `--muted` | `#5b6778` | Texto secundario. |
| `--muted-soft` | `#66717f` | Texto aún más suave. |
| `--line` | `#d9e0ea` | Bordes. Reemplaza `#dde3ec`. |
| `--line-strong` | `#c3cddc` | Borde más marcado. |
| `--ok` | `#16a34a` | Éxito. |
| `--warn` | `#eab308` | Aviso. |
| `--bad` | `#dc2626` | Error. |
| `--focus` | `#0E7490` | Anillo de foco. |
| `--focus-dark` | `#67E8F9` | Foco sobre fondo oscuro. |
| `--r` | `16px` | Radio. Reemplaza `14px`. |

El comentario del CSS explica el naranjo de botón: `#FF5001` es el del logo; sobre blanco no alcanza contraste de texto, y `#C84300` / `#A33600` son el naranjo de acción. El sistema de diseño conserva los dos: logo `#FF5001` para marca, `#C84300` para texto y botones.

El verde `#25d366` es el botón de WhatsApp, no un color de marca.

## Inventario

### Portada y contenido público

| Ruta | Archivo | Qué muestra hoy | Acceso | Estado |
| --- | --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | Portada: hero «torre de control», cuatro beneficios, cuatro pasos (publicar, calzar, historial, panel), búsqueda rápida, bolsa reciente, contadores si hay datos, audiencias mandante/transportista, puntero a Tecnología y un bloque de preguntas frecuentes. | pública | viva |
| `/tecnologia` | `src/app/tecnologia/page.tsx` | Tecnología y automatización: capas de la plataforma, demos de trazabilidad, equipos, controles de seguridad y enlaces a publicar y a cómo verificamos. | pública | viva |
| `/faq` | `src/app/faq/page.tsx` | Preguntas frecuentes, el mismo listado `FAQ` que la portada recorta. | pública | viva |
| `/guias` | `src/app/guias/page.tsx` | Ocho guías con enlace: publicar carga, publicar camión, calculadora, verificación, registro, regiones, tecnología, contacto. | pública | viva |
| `/contacto` | `src/app/contacto/page.tsx` | WhatsApp, correo, dirección de La Serena y datos de CARGA360GO SpA. | pública | viva |
| `/como-verificamos` | `src/app/como-verificamos/page.tsx` | Qué revisa un administrador y qué no garantiza el sello «verificado». | pública | viva |
| `/regiones` | `src/app/regiones/page.tsx` | Mapa de las 16 regiones y tabla de cargas, camiones y transportistas verificados. | pública | viva |
| `/empresas` | `src/app/empresas/page.tsx` | Directorio de empresas en acreditación. Vacío: «Sin datos». Cada ficha enlaza a postular. | pública | viva |
| `/herramientas/calculadora` | `src/app/herramientas/calculadora/page.tsx` | Calculadora de flete. Si el ajuste interno de precio sugerido está activo, muestra el desglose; si no, solo origen, destino y kilómetros. | pública | viva |
| `/transporte-minero-chile` | `src/app/transporte-minero-chile/page.tsx` | Landing SEO de transporte minero (`LandingRoute`, slug en `src/lib/seo-landings.ts`). | pública | viva |
| `/cama-baja-y-maquinaria` | `src/app/cama-baja-y-maquinaria/page.tsx` | Landing SEO de cama baja y maquinaria. | pública | viva |
| `/cargas-de-retorno-mineras` | `src/app/cargas-de-retorno-mineras/page.tsx` | Landing SEO de retornos mineros. | pública | viva |
| `/transporte-calama` | `src/app/transporte-calama/page.tsx` | Landing SEO de Calama. | pública | viva |
| `/transporte-antofagasta` | `src/app/transporte-antofagasta/page.tsx` | Landing SEO de Antofagasta. | pública | viva |
| `/transporte-copiapo` | `src/app/transporte-copiapo/page.tsx` | Landing SEO de Copiapó. | pública | viva |

### Marketplace

| Ruta | Archivo | Qué muestra hoy | Acceso | Estado |
| --- | --- | --- | --- | --- |
| `/cargas` | `src/app/cargas/page.tsx` | Listado de cargas con filtros, aviso de contacto protegido y alerta por correo. | sesión opcional | viva |
| `/cargas/nueva` | `src/app/cargas/nueva/page.tsx` | Formulario de tres pasos. Si la cuenta no está acreditada, muestra el panel de acreditación en vez del formulario. | sesión opcional | viva |
| `/cargas/[id]` | `src/app/cargas/[id]/page.tsx` | Ficha, ofertas y tablero del viaje. 404 si la carga no es visible. El enlace GPS solo aparece con el flag de operación. | sesión opcional | viva |
| `/cargas/[id]/editar` | `src/app/cargas/[id]/editar/page.tsx` | Formulario de edición. Quien no es dueño ve «No puedes editar esta carga». | cuenta (dueño) | viva |
| `/camiones` | `src/app/camiones/page.tsx` | Listado de camiones y retornos con filtros. | sesión opcional | viva |
| `/camiones/nuevo` | `src/app/camiones/nuevo/page.tsx` | Publicar camión. Misma puerta de acreditación que publicar carga. | sesión opcional | viva |
| `/camiones/[id]` | `src/app/camiones/[id]/page.tsx` | Ficha del camión. 404 si no existe. | sesión opcional | viva |
| `/camiones/[id]/editar` | `src/app/camiones/[id]/editar/page.tsx` | Edición. Quien no es dueño ve «No puedes editar este camión». | cuenta (dueño) | viva |

### Cuenta, acceso y copiloto público

| Ruta | Archivo | Qué muestra hoy | Acceso | Estado |
| --- | --- | --- | --- | --- |
| `/ingreso` | `src/app/ingreso/page.tsx` | Formulario de correo y contraseña. | pública | viva |
| `/registro` | `src/app/registro/page.tsx` | Alta de mandante o transportista. Con sesión, invita a ir al panel. | pública | viva |
| `/recuperar` | `src/app/recuperar/page.tsx` | Pedido de enlace para nueva contraseña. | pública | viva |
| `/restablecer` | `src/app/restablecer/page.tsx` | Formulario de nueva contraseña con el token de la query. | pública | viva |
| `/verificar-correo` | `src/app/verificar-correo/page.tsx` | Estado del enlace de correo y reenvío. | pública | viva |
| `/cuenta-en-revision` | `src/app/cuenta-en-revision/page.tsx` | Acreditación, datos de perfil y documentos. Sin sesión pide ingresar. | cuenta | viva |
| `/mi-cuenta` | `src/app/mi-cuenta/page.tsx` | Elige transportista o mandante, estado de documentos y línea de tiempo. Sin sesión, el alta de archivos pide ingresar. | sesión opcional | viva |
| `/panel` | `src/app/panel/page.tsx` | Panel de la cuenta: acreditación, alertas guardadas, documentos, ofertas, cargas y camiones propios. Sin sesión, invita a registrarse o ingresar. | sesión opcional | viva |
| `/alertas/baja` | `src/app/alertas/baja/page.tsx` | Baja de alertas por correo con el token `t`. | pública | viva |
| `/agente-360go` | `src/app/agente-360go/page.tsx` | App suelta AI.CARGA360: avatar, chat en el dispositivo y acciones (cotizar, publicar, registro, seguimiento, soporte). Sin header ni pie. | pública | viva |
| `/registro-transportista` | `src/app/registro-transportista/page.tsx` | El archivo pinta «Postular a sus cargas» y el formulario de registro. La URL no llega a ese archivo: `next.config.ts` la redirige a `/registro`. | pública | redirigida |

`/ingreso`, `/recuperar`, `/restablecer` y `/verificar-correo` son login. No entran en los PRs de este plan.

### Textos legales

Estas rutas se inventarían y no se rediseñan. El plan no cambia su copia.

| Ruta | Archivo | Qué muestra hoy | Acceso | Estado |
| --- | --- | --- | --- | --- |
| `/terminos` | `src/app/terminos/page.tsx` | Términos de uso vigentes. | pública | viva |
| `/privacidad` | `src/app/privacidad/page.tsx` | Política de privacidad vigente. | pública | viva |
| `/politica-de-pagos` | `src/app/politica-de-pagos/page.tsx` | Política de pagos desde `content/politica-de-pagos.md`. | pública | flag apagado |

`/politica-de-pagos` existe solo si `paymentsLegalPublished()` es verdadero: `PAYMENTS_FEATURE_ENABLED` o `PAYMENTS_LEGAL_PUBLISHED`, comparados con `trim().toLowerCase() === "true"` en `src/lib/pagos/config.ts`. Si no, 404. Ese comparador es el de pagos; los flags nuevos de este plan no lo copian.

### Pagos

Estas rutas se inventarían y no se rediseñan. Tampoco se toca `src/lib/pagos/*` ni `PAYMENTS_FEE_PAYER`.

| Ruta | Archivo | Qué muestra hoy | Acceso | Estado |
| --- | --- | --- | --- | --- |
| `/panel/pagos` | `src/app/panel/pagos/page.tsx` | Conexión Mercado Pago y fletes de la cuenta. | cuenta (mandante o transportista) | flag apagado |
| `/pagos/resultado` | `src/app/pagos/resultado/page.tsx` | Vuelta de Checkout Pro. El texto avisa que la confirmación llega por notificación, no por la query. | pública | flag apagado |
| `/admin/pagos` | `src/app/admin/pagos/page.tsx` | Bandeja admin de fletes Mercado Pago, conteos y eventos. Sin tokens. | admin | flag apagado |

Las tres responden 404 si `PAYMENTS_FEATURE_ENABLED` no pasa el comparador de `paymentsEnabled()` (`trim().toLowerCase() === "true"`). Con el flag apagado, Pagos e Identidad no aparecen en `AdminNav`.

### Identidad

| Ruta | Archivo | Qué muestra hoy | Acceso | Estado |
| --- | --- | --- | --- | --- |
| `/verificar-identidad` | `src/app/verificar-identidad/page.tsx` | Correo, teléfono e identidad (cédula y rostro). | cuenta | flag apagado |
| `/verificar-identidad/resultado` | `src/app/verificar-identidad/resultado/page.tsx` | Resultado de la verificación. | cuenta | flag apagado |
| `/admin/identidad` | `src/app/admin/identidad/page.tsx` | Bandeja Didit. No guarda imágenes en Carga360go. | admin | flag apagado |

Flag: `KYC_FEATURE_ENABLED` con el texto exacto `"true"` (`src/lib/kyc/config.ts`). Otro valor, 404.

### Administración viva

Sin flag de función. Quien no es admin ve «Sin acceso», `AdminDenied` o una puerta a `/ingreso`. `/admin/bassam360` redirige a ingreso si no hay sesión y responde forbidden si el rol no es admin.

| Ruta | Archivo | Qué muestra hoy | Acceso | Estado |
| --- | --- | --- | --- | --- |
| `/admin` | `src/app/admin/page.tsx` | Usuarios, documentos, métricas y enlaces a BASSAM, centro de control, acreditación, WhatsApp y chat. | admin | viva |
| `/admin/transportistas` | `src/app/admin/transportistas/page.tsx` | Acreditación de transportistas y mandantes, filtros y checklist. | admin | viva |
| `/admin/ofertas` | `src/app/admin/ofertas/page.tsx` | Conteos de solicitudes, listado de ofertas y ajustes (incluye el interruptor de precio sugerido). | admin | viva |
| `/admin/auditoria` | `src/app/admin/auditoria/page.tsx` | Últimos 500 eventos, filtrables por cuentas, documentos, ofertas, cargas y ajustes. | admin | viva |
| `/admin/whatsapp` | `src/app/admin/whatsapp/page.tsx` | Conversaciones del bot de WhatsApp. | admin | viva |
| `/admin/chat` | `src/app/admin/chat/page.tsx` | Conversaciones del chat de la web. | admin | viva |
| `/admin/agente` | `src/app/admin/agente/page.tsx` | Agente comercial: leads, conversaciones, herramientas, voz y avatar. | admin | viva |
| `/admin/costos` | `src/app/admin/costos/page.tsx` | Motor de costos: cotizaciones, parámetros, peajes, diésel y fuentes. | admin | viva |
| `/admin/costos/[id]` | `src/app/admin/costos/[id]/page.tsx` | Una cotización. 404 si no existe. | admin | viva |
| `/admin/bassam` | `src/app/admin/bassam/page.tsx` | Acreditación BASSAM: documentos de cargas y camiones que ya están en la base. | admin | viva |
| `/admin/bassam360` | `src/app/admin/bassam360/page.tsx` | Bandeja ejecutiva, conteos, asistente que no aprueba solo, y CSV de indicadores. GPS, agentes y WhatsApp se muestran como `--`. | admin | viva |
| `/admin/control` | `src/app/admin/control/page.tsx` | Centro de control de BASSAM 360 y CARGA360GO: resumen, operaciones, tareas, integraciones y actividad. Shell lateral propio. | admin | viva |
| `/admin/centro-control` | `src/app/admin/centro-control/page.tsx` | Menú lateral (vista, operaciones, camiones, clientes, agentes, cotizador, comunicaciones, seguridad, tareas). Conteos de viajes, camiones, clientes y docs. El mapa dice «Esperando datos reales». Agentes, cotizador, comunicaciones, seguridad y tareas pintan `--`. | admin | viva, con secciones placeholder |

### Operación detrás de flags ya existentes

Comparación de `src/lib/ops/flags.ts`: solo el texto exacto `"true"` enciende. `"TRUE"`, `"1"`, `"yes"` y espacios quedan apagados. Un hijo no vale si `OPS_FEATURE_ENABLED` no es `"true"`.

El middleware (`src/middleware.ts`, `src/lib/ops/page-gate.ts`) responde 404 HTML antes de renderizar si el flag está apagado. En seguimiento el token no pide sesión admin. En el resto, quien no es admin también recibe 404.

| Ruta | Archivo | Qué muestra hoy | Acceso | Estado |
| --- | --- | --- | --- | --- |
| `/admin/ops` | `src/app/admin/ops/page.tsx` | Panel con sidebar: contratos y SLA, tarifas, desempeño, asignación, envíos. Montos solo aquí. Query `seccion`. | admin | flag apagado (`OPS_FEATURE_ENABLED`) |
| `/admin/ops/asignacion` | `src/app/admin/ops/asignacion/page.tsx` | Propuestas de asignación. Una persona confirma. No envía WhatsApp ni correo. | admin | flag apagado (`OPS_FEATURE_ENABLED` y `OPS_ALLOCATION_ENABLED`) |
| `/admin/ops/operacion` | `src/app/admin/ops/operacion/page.tsx` | Alta de operación con identificador `360-YYMM-NNNN` y tabla de las ya creadas. | admin | flag apagado (`OPS_FEATURE_ENABLED` y `OPS_OPERACION_ENABLED`) |
| `/seguimiento/[token]` | `src/app/seguimiento/[token]/page.tsx` | Etapa, última posición si existe, y ETA. Avisa que el perfil de ruta es de auto (OSRM), no de camión. | pública con token | flag apagado (`OPS_FEATURE_ENABLED`) |
| `/viajes/[id]/ubicacion` | `src/app/viajes/[id]/ubicacion/page.tsx` | Panel GPS del viaje para admin, con simulación. 404 si no hay viaje. | admin | flag apagado (`OPS_FEATURE_ENABLED`, vía `opsGpsEnabled()`) |
| `/v/[token]` | `src/app/v/[token]/page.tsx` | Punto de control público: etiqueta, origen, destino y viaje. Token desconocido: «sin datos». No usa flag OPS. | pública con token | viva |

Flags OPS que no tienen página propia: `OPS_PROCUREMENT_ENABLED`, `OPS_ALLOCATION_AUTO` (la asignación queda en propuesta), `OPS_API_V1_ENABLED` (solo API de lectura).

### Rutas que no existen

No hay `page.tsx` para Marketplace, Control Tower, Tracking Live, Clientes, Documentos, Finanzas, Analytics ni Copiloto AI como recorrido de producto. Lo más cercano, y distinto, está en la tabla de arriba.

Tampoco existen, como página, `/cotizador`, `/cargas-de-retorno`, `/login`, `/seguimiento` (sin token), `/publicar`, `/publicar-camion`, `/guia` ni `/ayuda`.

## Redirects

`next.config.ts`, temporales (`permanent: false`):

| URL | Destino |
| --- | --- |
| `/publicar` | `/cargas/nueva` |
| `/publicar-camion` | `/camiones/nuevo` |
| `/cotizador` | `/herramientas/calculadora` |
| `/cargas-de-retorno` | `/cargas-de-retorno-mineras` |
| `/guia` | `/guias` |
| `/seguimiento` | `/tecnologia` |
| `/login` | `/ingreso` |
| `/ayuda` | `/guias` |
| `/registro-transportista` | `/registro` |

`/seguimiento` (exacto) va a Tecnología. `/seguimiento/[token]` es la página de la tabla de operación.

El pie enlaza `/cotizador` y `/cargas-de-retorno`. Esas URLs son los redirects de arriba, no páginas.

## Recorrido objetivo y lo que hay hoy

El recorrido de producto, todavía sin implementar:

Inicio → Marketplace → Control Tower → Operaciones → Tracking Live → Transportistas → Clientes → Documentos → Finanzas → Analytics → Copiloto AI → Administración.

| Paso | Hoy |
| --- | --- |
| Inicio | `/`, viva. |
| Marketplace | `/cargas` y `/camiones`, vivas. No hay una ruta llamada Marketplace. |
| Control Tower | No hay una torre de producto. Hay `/admin/control` (viva, admin) y `/admin/centro-control` (viva, con huecos). |
| Operaciones | `/admin/ops` y `/admin/ops/operacion`, flag apagado. |
| Tracking Live | `/seguimiento/[token]` y `/viajes/[id]/ubicacion`, flag apagado. `/v/[token]` es un punto de control corto, vivo. |
| Transportistas | `/admin/transportistas` (admin, viva) y el listado público `/camiones`. |
| Clientes | No hay página. `/admin/centro-control` tiene una sección «Clientes» con un conteo. `/empresas` es un directorio público. |
| Documentos | Repartidos en `/admin`, `/mi-cuenta`, `/admin/bassam` y `/admin/bassam360`. |
| Finanzas | No hay página de finanzas. `/admin/costos` es el motor de costos. Los pagos son otro módulo y quedan fuera. |
| Analytics | No hay página. `/admin` muestra métricas de administración. |
| Copiloto AI | `/agente-360go` (pública) y `/admin/agente` (admin). No es la vista de operación del recorrido. |
| Administración | `/admin`, viva. |

## Plan de PRs, sin implementar

Ningún PR de esta lista se abre en el turno del inventario. El orden es fijo: sistema de diseño, después páginas públicas empezando por Inicio, después vistas nuevas de operación con el flag apagado.

Cada PR de la lista repite estas reglas:

- Misma marca, mismos colores, mismo nombre y el mismo logo. El logo solo cambia de escala.
- Misma personalidad. Se modernizan diseño, UX, estructura y tecnología.
- Estilo Control Tower logística 2026: jerarquía, nav lateral, tarjetas KPI, tablas, mapa, timeline, centro de alertas, Digital Twin del viaje y Copiloto 360.
- Móvil: nav compacta y vistas compactas.
- Recorrido objetivo: Inicio → Marketplace → Control Tower → Operaciones → Tracking Live → Transportistas → Clientes → Documentos → Finanzas → Analytics → Copiloto AI → Administración.
- TrackChain es referencia funcional. No se copian diseño, textos, imágenes, logos ni código de terceros.
- Las páginas públicas no muestran precios.
- El PR lleva capturas de escritorio y de móvil, y CI verde (`typecheck`, `lint`, `test`, `build`).
- No se tocan login (`/ingreso`, `/recuperar`, `/restablecer`, `/verificar-correo`), pagos (`src/lib/pagos/*`, `PAYMENTS_FEE_PAYER`, `/panel/pagos`, `/pagos/resultado`, `/admin/pagos`) ni textos legales (`/terminos`, `/privacidad`, `/politica-de-pagos`).
- No se fusiona y no se despliega en ese PR. No se enciende ningún flag: el valor por defecto sigue apagado y solo el texto exacto `"true"` enciende los flags nuevos.

### 1. Sistema de diseño

Un PR. Tokens, layout, nav lateral adaptable y nav móvil. No rediseña el contenido de cada página.

Tokens, copiados de la tabla vigente, no inventados:

- Marca: `--navy #0B1633`, `--navy2 #152647`, `--brand-navy #002451`, `--brand-orange #FF5001`.
- Acción: `--accent #C84300`, `--accent2 #A33600`.
- Superficie: `--bg #f5f7fa`, `--card #fff`, `--ink #0f1b2d`, `--muted #5b6778`, `--muted-soft #66717f`, `--line #d9e0ea`, `--line-strong #c3cddc`.
- Estado: `--ok #16a34a`, `--warn #eab308`, `--bad #dc2626`.
- Foco: `--focus #0E7490`, `--focus-dark #67E8F9`.
- Radio vigente: `--r 16px`.
- Fuentes vigentes: Sora y Figtree.
- Logo: `logo-wordmark.png` / `@2x`, solo escala.

Layout: un cascarón con nav lateral desde el ancho de escritorio y nav compacta en móvil, en el orden del recorrido objetivo. Los ítems que aún no tienen página no se enlazan a una ruta inventada: quedan fuera hasta el PR que cree esa vista. Login, pagos y legales no cambian de URL ni de copia.

La sidebar oscura de `#79b7e9` no se promueve a token de marca.

Reglas de este PR: misma marca, mismos colores, mismo nombre, mismo logo a escala, misma personalidad. Jerarquía y nav lateral en escritorio; nav compacta en móvil. Sin precios. Sin TrackChain copiado. Capturas de escritorio y móvil. CI verde. Sin login, sin pagos, sin textos legales, sin fusión y sin despliegue.

### 2. Páginas públicas, Inicio primero

Después del sistema de diseño, y en este orden. Cada una es un PR pequeño. Ninguna muestra precios: la portada y las landings no agregan tarifas; la calculadora no entra en estos PRs.

1. **Inicio.** Solo `/` y el CSS que esa página usa. Hero, jerarquía, y el primer pantallazo de torre con la marca actual. Sin precios.
2. **Marketplace.** `/cargas`, `/camiones` y las fichas `/cargas/[id]` y `/camiones/[id]`. Listas y tarjetas. Sin precios en la vista pública. Los formularios de alta y edición pueden ir en un PR siguiente, todavía público de cara al visitante, sin cambiar la puerta de acreditación.
3. **Regiones.** `/regiones`: mapa y tabla, mismos datos.
4. **Directorio.** `/empresas`.
5. **Contenido.** `/tecnologia`, `/guias`, `/faq`, `/contacto`, `/como-verificamos`.
6. **Landings.** Las seis rutas SEO, el componente compartido `LandingRoute`, sin textos nuevos de terceros.

Reglas de cada uno de estos PRs: misma marca, mismos colores, mismo nombre, mismo logo a escala, misma personalidad. Modernizar diseño, UX, estructura y tecnología hacia la torre 2026, en la porción pública (Inicio y Marketplace primero). Móvil compacto. Sin precios. TrackChain solo como referencia funcional, sin copiar diseño, textos, imágenes, logos ni código. Capturas de escritorio y móvil. CI verde. Sin login, sin pagos, sin textos legales, sin fusión y sin despliegue.

Quedan fuera de esta tanda, a propósito: `/ingreso`, `/recuperar`, `/restablecer`, `/verificar-correo`, `/registro`, `/cuenta-en-revision`, `/terminos`, `/privacidad`, `/politica-de-pagos`, `/panel/pagos`, `/pagos/resultado`, `/admin/pagos` y `src/lib/pagos/*`.

### 3. Vistas nuevas de operación, flags apagados

Después de las páginas públicas. Son rutas nuevas. No reemplazan las páginas vivas de admin ni encienden `OPS_*`, `KYC_*` ni `PAYMENTS_*`.

Cada vista nace apagada. El módulo nuevo copia la regla de `isEnabled`: solo el texto exacto `"true"` enciende; el hijo además exige el maestro `"true"`. `"TRUE"`, `"1"` y `"yes"` siguen apagados. Con el flag apagado la URL responde 404 y no se enlaza desde la nav pública.

Maestro propuesto, todavía sin crear: `UI_OPS_ENABLED`.

| PR | Vista nueva (no existe hoy) | Flag hijo | Qué cubre, sin ser la página vieja |
| --- | --- | --- | --- |
| 1 | Control Tower | `UI_TORRE_ENABLED` | Jerarquía, KPI, mapa, centro de alertas. No es `/admin/centro-control` ni `/admin/control`. |
| 2 | Operaciones | `UI_OPERACIONES_ENABLED` | Tablero de viajes. No enciende `/admin/ops`. |
| 3 | Tracking Live | `UI_TRACKING_ENABLED` | Mapa, timeline y Digital Twin del viaje. No sustituye `/seguimiento/[token]` ni `/viajes/[id]/ubicacion`. |
| 4 | Transportistas | `UI_TRANSPORTISTAS_ENABLED` | Vista de operación de transportistas. `/admin/transportistas` sigue igual. |
| 5 | Clientes | `UI_CLIENTES_ENABLED` | No hay página hoy. |
| 6 | Documentos | `UI_DOCUMENTOS_ENABLED` | Bandeja de operación. No reescribe `/admin` ni `/mi-cuenta`. |
| 7 | Finanzas | `UI_FINANZAS_ENABLED` | Vista de operación. No usa `src/lib/pagos/*` ni `PAYMENTS_FEE_PAYER`. `/admin/costos` no se convierte en esta vista. |
| 8 | Analytics | `UI_ANALYTICS_ENABLED` | No hay página hoy. |
| 9 | Copiloto AI | `UI_COPILOTO_ENABLED` | Copiloto 360 de la torre. `/agente-360go` y `/admin/agente` siguen igual. |
| 10 | Administración | `UI_ADMIN_ENABLED` | Entrada de administración del recorrido. `/admin` sigue igual. |

Prefijo de ruta, a fijar en el primer PR de esta tanda y a no chocar con las 62 páginas: bajo `/app` no hay segmento libre llamado como estas vistas; el PR de la torre elige un prefijo nuevo (propuesta: `/torre/...`) y los siguientes lo reutilizan. Hasta ese PR, esas rutas no existen.

Reglas de cada uno de estos PRs: misma marca, mismos colores, mismo nombre, mismo logo a escala, misma personalidad. Torre 2026 con nav lateral, KPI, tablas, mapa, timeline, alertas, Digital Twin y Copiloto 360, en la vista de ese PR y compacta en móvil. Recorrido completo en la nav solo con las vistas ya creadas. TrackChain como referencia funcional, sin copiar diseño, textos, imágenes, logos ni código. Sin precios si alguna vista se asoma a una URL pública. Flag apagado por defecto; encendido solo con el texto exacto `"true"`. Capturas de escritorio y móvil tomadas con el flag de prueba en local, sin dejarlo encendido en el repo. CI verde con los flags sin definir, de modo que la ruta nueva siga en 404. Sin login, sin pagos, sin textos legales, sin fusión y sin despliegue.
