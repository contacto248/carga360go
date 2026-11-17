# Carga360go · Textos del rediseño de carga360go.cl · Versión final única

**BORRADOR · no publicar**
**Fecha:** 17-11-2026 (hora de Chile)
**Autor:** Product Marketer Carga360go, por encargo de Gerencia vía Jefe Web («modo cierre total»).
**Destino:** Cursor, a través del Jefe Web. Este archivo es solo copy: no autoriza publicar, mergear, desplegar ni enviar pauta. No se tocó la web.
**Páginas:** 1. Inicio · 2. Marketplace · 3. Control Tower · 4. Tracking · 5. Transportistas · 6. Clientes.

**Fuentes consolidadas:** `brief-posicionamiento.md`, `home-y-anuncios.md`, `home-y-anuncios-v2.md` (T-049), `portada-T065.md` (T-065), `COPY_MODULOS_OPS.md`, `FICHAS_OPS_FINAL.md` (texto aprobado por Gerencia, reproducido tal cual en Clientes y Transportistas) y `GUIONES_SALES_CUSTOMER.md`.

## Reglas aplicadas

- La marca se escribe siempre **Carga360go**. Español de Chile, tuteo, frases cortas.
- Sin precios, tarifas, montos ni comisiones. Se habla de **costo de referencia desglosado**; el valor final lo acuerdan las partes.
- Sin cifras, clientes, testimonios, logos ni volumen de carga o de ingresos. No se muestran contadores de avisos ni de camiones.
- Carga360go conecta a mandantes y transportistas: **no es transportista ni asegura que el viaje se concrete**. El calce es una recomendación.
- Sin textos de terceros (TrackChain, chain.io, Avancargo, Carga.cl, SubCargo u otros). Solo se tomó el orden de bloques como referencia.
- No se escriben ni modifican textos legales (términos, privacidad, política de pagos). Donde hace falta un enlace, va **[ENLACE LEGAL EXISTENTE]**.
- Una sola versión por página, sin alternativas A/B. La versión principal es la **segura**: solo afirma lo que hoy está activo.
- Estado real usado (última revisión, 16-11-2026): **activos**: bolsa de cargas y camiones, calce por ruta, fechas, equipo y capacidad (también en retornos), alertas por correo, cotizador con costo de referencia desglosado (sin registro), acreditación por un administrador, contacto protegido hasta adjudicar, historial de eventos de la publicación. **No activos**: GPS o seguimiento en vivo, comprobante de entrega digital, voz del asistente, alertas por WhatsApp, pago dentro de la plataforma.

## Leyenda de etiquetas

| Etiqueta | Qué significa | Qué hace Cursor |
|---|---|---|
| **[ESTADO: Próximamente]** | La página o el módulo no está disponible hoy. | Mostrar el distintivo «Próximamente» visible junto al título. |
| **[ESTADO]** | Gerencia aún no decide entre «Disponible», «En piloto» o «Próximamente». | Dejar el distintivo como variable; no publicar sin valor decidido. |
| **[REQUIERE FUNCIÓN ACTIVA: …]** | La línea solo es verdadera cuando esa función esté encendida y visible para el usuario. | No mostrarla. Usar la **Alternativa segura** que va justo debajo. |
| **Alternativa segura** | Texto que se puede usar hoy. | Es el texto que va en producción mientras la función siga apagada. |
| **[DESTINO POR CONFIRMAR]** | La URL del botón no está verificada o la página aún no existe. | Confirmar con el Jefe Web antes de enlazar. |
| **[ENLACE LEGAL EXISTENTE]** | Enlace a un texto legal que ya existe en el sitio. | Enlazar la página legal vigente sin cambiar su contenido. |
| **[NOMBRE POR CONFIRMAR: hoy visible como BASSAM 360]** | El asistente se llamará Agente Carga360go, falta confirmación de Gerencia. | Usar «Agente Carga360go» solo cuando Gerencia lo confirme. |

Destinos verificados el 16-11-2026: `/cargas/nueva`, `/camiones/nuevo`, `/cargas`, `/camiones`, `/registro`, `/herramientas/calculadora`, `/como-verificamos`, `/cargas-de-retorno-mineras`, `/transporte-minero-chile`, `/cama-baja-y-maquinaria`. No usar `/cotizador`, `/cargas-de-retorno`, `/seguimiento` ni `/rastreo` mientras respondan 404.

## Línea de transparencia (va en todas las páginas, bajo el hero o en el pie)

> Carga360go conecta a mandantes y transportistas. No es transportista ni asegura que el viaje se concrete. El acuerdo y el valor final los definen las partes. Solo mostramos avisos reales y vigentes.
> [ENLACE LEGAL EXISTENTE: Términos] · [ENLACE LEGAL EXISTENTE: Privacidad]

---

## 1. Inicio

**Meta title:** Carga360go · Cargas, camiones y retornos en Chile
**Meta description:** Publica tu carga, tu camión o tu retorno, encuentra el calce por ruta, fecha y equipo, y ve un costo de referencia desglosado. De Arica a Punta Arenas.

**H1:** Cargas, camiones y retornos en Chile, de Arica a Punta Arenas.

**Subtítulo:** Publica tu carga o tu camión y encuentra el calce por ruta, fecha y equipo, también en retornos. Ve un costo de referencia desglosado: ruta, peajes según ejes, diésel y costos de operación, cada uno con su fuente.

**CTAs**
- Primario mandantes: «Tengo carga» → `/cargas/nueva`
- Primario transportistas: «Tengo camión o retorno» → `/camiones/nuevo`
- Secundario: «Abrir el cotizador (sin registro)» → `/herramientas/calculadora`

*(Bajo el hero: Línea de transparencia.)*

### Sección 1.1 · Dos caminos, un mismo lugar

**Título:** Elige tu camino

**Si tienes carga**
Publica tu carga y encuentra el camión que calza, con el costo del flete a la vista. Indicas ruta, fecha y equipo, recibes ofertas de transportistas acreditados y eliges. El contacto se abre solo cuando adjudicas.
CTA: «Publicar carga» → `/cargas/nueva` · «Conocer Carga360go para empresas» → `/clientes` [DESTINO POR CONFIRMAR]

**Si tienes camión o retorno**
Publica tu camión o tu retorno y te avisamos por correo cuando aparezca una carga que calza. Dejas tu corredor, tus fechas y la ficha de tu equipo, y ofreces tú el valor.
CTA: «Publicar camión o retorno» → `/camiones/nuevo` · «Conocer Carga360go para transportistas» → `/transportistas` [DESTINO POR CONFIRMAR]

### Sección 1.2 · Cómo funciona

**Título:** Así funciona Carga360go

1. **Publica.** Tu carga, tu camión o tu viaje de vuelta, con ruta, fechas y equipo.
2. **Calza.** Carga360go cruza equipo, capacidad, ruta y fechas, y te muestra por qué calza.
3. **Te avisamos.** Si no hay calce hoy, guarda una alerta y te escribimos por correo cuando aparezca uno.
4. **Eliges y coordinas.** El mandante adjudica la oferta y recién ahí se abre el contacto entre las partes.

### Sección 1.3 · Costo de referencia desglosado

**Título:** Mira de qué se compone el flete antes de ofertar

**Cuerpo:** El cotizador arma un costo de referencia desglosado: ruta, peajes según ejes, diésel publicado por la CNE y costos de operación, cada uno con su fuente. Es una referencia para conversar con fundamento, no una cotización cerrada. El valor final lo acuerdan las partes.
CTA: «Abrir el cotizador» → `/herramientas/calculadora`

### Sección 1.4 · Corredor minero del norte

**Título:** Foco en el corredor minero: Calama, Antofagasta y Copiapó

**Cuerpo:** Carga360go está abierta a carga general y masiva en todo Chile, de Arica a Punta Arenas. Empezamos con fuerza en el corredor minero del norte, donde el viaje pide un equipo concreto, una cama baja o un retorno que no quieres hacer vacío.

- **Retornos.** Publica tu viaje de vuelta y recibe una alerta por correo cuando aparezca una carga que calza por origen, destino, fechas, equipo y capacidad.
- **Cama baja y maquinaria.** La ficha pide ejes, ancho, capacidad y medidas, para que el mandante vea si el equipo calza antes de ofertar.
- **Hacia y desde faena.** Cargas de minería y de proveedores del corredor, con contacto protegido hasta adjudicar.

CTA: «Publicar un retorno» → `/cargas-de-retorno-mineras` · «Ver transporte minero» → `/transporte-minero-chile`

### Sección 1.5 · Torre de control [ESTADO: Próximamente]

**Título:** Torre de control: tus viajes ordenados en un solo panel

**Cuerpo (seguro):** Hoy ya ves en tu panel la publicación, el calce, las ofertas y la adjudicación, con fecha y hora. Estamos preparando la torre de control para seguir cada viaje hasta la entrega.
CTA: «Conocer la torre de control» → `/control-tower` [DESTINO POR CONFIRMAR]

**[REQUIERE FUNCIÓN ACTIVA: GPS y comprobante de entrega digital]** Sigue cada viaje en vivo y ciérralo con el comprobante de entrega digital.
*Alternativa segura (usar hoy):* el «Cuerpo (seguro)» de arriba.

### Sección 1.6 · Confianza

**Título:** Cuentas revisadas y contacto protegido

- **Acreditación por una persona.** Un administrador revisa el contacto y, en transportistas, los documentos vigentes antes de habilitar la cuenta.
- **Aviso antes del vencimiento.** Un semáforo de vencimientos avisa cuando un documento está por vencer.
- **Contacto protegido.** WhatsApp, teléfono y correo no aparecen en el aviso. Se abren solo para el flete adjudicado.
- **Lo que significa «verificado».** Que la cuenta pasó la revisión de Carga360go. No es un sello de solvencia ni reemplaza la revisión que hace cada parte.

CTA: «Cómo verificamos» → `/como-verificamos`

### Sección 1.7 · Agente Carga360go [NOMBRE POR CONFIRMAR: hoy visible como BASSAM 360]

**Título:** ¿Dudas? Escríbele al Agente Carga360go

**Cuerpo:** Te ayuda por chat a cotizar, publicar y encontrar el calce entre cargas y camiones. Si tu caso necesita a una persona, te deriva al equipo de Carga360go.
**Línea del widget:** Hola, soy el Agente Carga360go. Dime si tienes una carga o un camión y te oriento.
CTA: «Escribirle al Agente Carga360go» → abre el chat web

**[REQUIERE FUNCIÓN ACTIVA: voz]** También puedes hablarle.
*Alternativa segura (usar hoy):* no se menciona la voz; el CTA queda solo como chat.

### Preguntas frecuentes (Inicio)

- **¿Carga360go transporta mi carga?** No. Carga360go conecta a mandantes con transportistas. El transporte, el acuerdo y el valor final quedan entre las partes.
- **¿Necesito registrarme para cotizar?** No. El cotizador se usa sin registro. Para publicar u ofertar necesitas una cuenta acreditada.
- **¿Funciona fuera del norte?** Sí. Puedes publicar en todo Chile, de Arica a Punta Arenas. El norte minero es nuestro foco de entrada.
- **¿Cuándo veo el contacto de la otra parte?** Cuando el mandante adjudica la oferta, y solo para ese flete.

### Cierre (Inicio)

**Título:** ¿Tienes carga o tienes camión? Empieza hoy.
CTAs: «Tengo carga» → `/cargas/nueva` · «Tengo camión o retorno» → `/camiones/nuevo`

---

## 2. Marketplace

**Meta title:** Marketplace de cargas y camiones en Chile · Carga360go
**Meta description:** Busca cargas y camiones por región, ruta, fecha y equipo. Calce también en retornos, alertas por correo y contacto protegido hasta adjudicar.

**H1:** Cargas y camiones que calzan, en un solo marketplace.

**Subtítulo:** Busca por región, ciudad, equipo y fecha. Carga360go te muestra el calce y las razones, y te avisa por correo cuando aparece uno nuevo.

**CTAs**
- Primario: «Ver cargas vigentes» → `/cargas`
- Primario: «Ver camiones disponibles» → `/camiones`
- Secundario: «Publicar carga» → `/cargas/nueva` · «Publicar camión o retorno» → `/camiones/nuevo`

*(Bajo el hero: Línea de transparencia.)*

### Sección 2.1 · Calce con razones

**Título:** No es un listado genérico: es calce

**Cuerpo:** Carga360go cruza equipo, capacidad, ruta y fechas, también en el viaje de vuelta, y te muestra por qué una carga y un camión calzan. Es una recomendación para decidir mejor, no un compromiso de contratación.

### Sección 2.2 · Alertas por correo

**Título:** Si hoy no hay calce, te avisamos

**Cuerpo:** Guarda una alerta con tu ruta, tus fechas y tu equipo. Cuando aparezca una carga o un camión que calza, te llega un correo. Puedes pausar tus alertas cuando quieras.

**[REQUIERE FUNCIÓN ACTIVA: alertas por WhatsApp]** También te avisamos por WhatsApp.
*Alternativa segura (usar hoy):* se menciona solo el correo.

### Sección 2.3 · Ofertas y adjudicación

**Título:** Ofertas claras, contacto protegido

**Cuerpo:** Los transportistas acreditados ofertan sobre la carga. El mandante compara y adjudica, o no adjudica si ninguna le sirve. Recién al adjudicar se abre el contacto entre las dos partes, y solo para ese flete.

### Sección 2.4 · Avisos reales

**Título:** Solo avisos reales y vigentes

**Cuerpo:** En Carga360go no inflamos el listado. Lo que ves son publicaciones reales y vigentes, y se actualizan con cada aviso nuevo.
*(Nota para Cursor: no mostrar contadores ni «camiones disponibles ahora». Si un listado está vacío, usar el texto: «Aún no hay avisos que calcen con tu búsqueda. Guarda una alerta y te avisamos por correo.»)*

### Preguntas frecuentes (Marketplace)

- **¿Quién puede publicar y ofertar?** Solo las cuentas acreditadas por un administrador de Carga360go.
- **¿Quién define el valor del flete?** Las partes. El transportista oferta su valor y el mandante elige. Carga360go muestra un costo de referencia desglosado como apoyo.
- **¿Puedo publicar un retorno?** Sí. Publica tu viaje de vuelta y entra al calce como cualquier camión disponible.

### Cierre (Marketplace)

**Título:** Publica en minutos y deja que el calce trabaje por ti.
CTAs: «Publicar carga» → `/cargas/nueva` · «Publicar camión o retorno» → `/camiones/nuevo`

---

## 3. Control Tower · [ESTADO: Próximamente]

*(Nombre visible en la página y el menú: «Torre de control». La URL sugerida `/control-tower` está [DESTINO POR CONFIRMAR].)*

**Meta title:** Torre de control para tus fletes · Carga360go
**Meta description:** Publicación, calce, ofertas y adjudicación en un solo panel. Carga360go prepara la torre de control para seguir cada viaje hasta la entrega.

**H1:** Torre de control: tu operación de flete en un solo panel.

**Subtítulo:** Hoy ya ordenas en Carga360go la publicación, el calce, las ofertas y la adjudicación. La torre de control suma el seguimiento de cada viaje hasta la entrega, y está en preparación.

**CTAs**
- Primario: «Avísame cuando esté disponible» → lista de espera [DESTINO POR CONFIRMAR]
- Secundario: «Publicar carga» → `/cargas/nueva`

*(Bajo el hero: Línea de transparencia.)*

### Sección 3.1 · Lo que ya está en tu panel

**Título:** Lo que ya puedes ordenar hoy

- **Publicación y calce a la vista.** Carga, camión o retorno, con las razones del calce.
- **Ofertas y adjudicación en el mismo lugar.** Sin planillas ni hilos sueltos de chat.
- **Historial con fecha y hora.** La publicación, las ofertas y la adjudicación quedan registradas.

### Sección 3.2 · Lo que viene en la torre de control [ESTADO]

**Título:** En preparación

- **Seguimiento de viajes** [ESTADO]
  **[REQUIERE FUNCIÓN ACTIVA: GPS]** Ve en qué va cada viaje sin llamar al conductor.
  *Alternativa segura (usar hoy):* Los hitos de cada operación quedan registrados con fecha y hora. El seguimiento GPS se anunciará cuando esté activo.
- **ETA, la hora estimada de llegada** [ESTADO]
  **[REQUIERE FUNCIÓN ACTIVA: GPS]** Sabes a qué hora llega cada carga y coordinas la recepción con tiempo.
  *Alternativa segura (usar hoy):* La hora estimada de llegada llegará junto con el seguimiento GPS.
- **Evidencia de entrega** [ESTADO]
  **[REQUIERE FUNCIÓN ACTIVA: comprobante de entrega digital]** Fotos, firmas y documentos del cierre quedan guardados en el viaje.
  *Alternativa segura (usar hoy):* El cierre lo coordinan las partes. El comprobante digital se anunciará cuando esté disponible.
- **Contratos y tarifas** [ESTADO]: tus acuerdos por ruta y zona, con niveles de servicio claros, en un solo lugar.
- **Desempeño del transportista** [ESTADO]: historial de cumplimiento para elegir con información.
- **Asignación automática** [ESTADO]: Carga360go te propone el transportista más adecuado según costo de referencia, desempeño y disponibilidad, y tu equipo confirma. Nada se asigna solo.

### Preguntas frecuentes (Control Tower)

- **¿La torre de control ya está disponible?** Todavía no. Hoy puedes ordenar la publicación, el calce, las ofertas y la adjudicación en tu panel. Déjanos tu correo y te avisamos.
- **¿Carga360go asigna los viajes por mí?** No. Cuando la asignación esté disponible, Carga360go propondrá y una persona de tu equipo confirmará.

### Cierre (Control Tower)

**Título:** Ordena tu flete desde hoy y suma la torre de control cuando esté lista.
CTAs: «Avísame cuando esté disponible» → [DESTINO POR CONFIRMAR] · «Publicar carga» → `/cargas/nueva`

---

## 4. Tracking · [ESTADO: Próximamente]

*(Nombre visible en la página y el menú: «Seguimiento». La URL sugerida `/tracking` está [DESTINO POR CONFIRMAR]. No reutilizar `/seguimiento` ni `/rastreo` hasta que la función exista.)*

**Meta title:** Seguimiento de fletes · Próximamente en Carga360go
**Meta description:** Carga360go prepara el seguimiento de tus viajes. Hoy cada operación registra sus hitos con fecha y hora: publicación, ofertas y adjudicación.

**H1:** Seguimiento de tus viajes: próximamente en Carga360go.

**Subtítulo:** Mientras lo preparamos, cada operación ya registra sus hitos con fecha y hora: publicación, ofertas y adjudicación. Te avisamos cuando el seguimiento esté activo.

**CTAs**
- Primario: «Avísame cuando esté disponible» → lista de espera [DESTINO POR CONFIRMAR]
- Secundario: «Escribirle al Agente Carga360go» → abre el chat web [NOMBRE POR CONFIRMAR: hoy visible como BASSAM 360]

*(Bajo el hero: Línea de transparencia.)*

### Sección 4.1 · Lo que existe hoy

**Título:** Trazabilidad de la operación, de la publicación a la adjudicación

**Cuerpo:** Cada carga registra eventos con fecha y hora, visibles para quienes participan en esa operación. Los estados del viaje los declaran las partes; no corresponden a una ubicación GPS.

### Sección 4.2 · Lo que viene

**Título:** Lo que traerá el seguimiento

- **[REQUIERE FUNCIÓN ACTIVA: GPS]** Ves dónde va tu carga sin llamar al conductor.
  *Alternativa segura (usar hoy):* Para saber dónde va el camión, coordina con el transportista adjudicado o escríbenos.
- **[REQUIERE FUNCIÓN ACTIVA: GPS]** Hora estimada de llegada (ETA) para coordinar la recepción.
  *Alternativa segura (usar hoy):* La hora de llegada la coordinan las partes.
- **[REQUIERE FUNCIÓN ACTIVA: comprobante de entrega digital]** Cierre del viaje con el comprobante de entrega digital, sin papeles sueltos.
  *Alternativa segura (usar hoy):* El comprobante de entrega lo coordina una persona del equipo de Carga360go.

### Preguntas frecuentes (Tracking)

- **¿Puedo ver hoy mi camión en un mapa?** Todavía no. El seguimiento GPS está en preparación. Hoy ves los hitos de tu operación en tu panel.
- **¿Qué hago si necesito saber dónde va mi carga?** Coordina con el transportista adjudicado. Si necesitas ayuda, el Agente Carga360go te deriva a una persona del equipo.
- **¿Hay comprobante de entrega digital?** Todavía no. Te avisamos cuando esté disponible.

### Cierre (Tracking)

**Título:** Te avisamos apenas el seguimiento esté activo.
CTA: «Avísame cuando esté disponible» → [DESTINO POR CONFIRMAR]

---

## 5. Transportistas

*(Bloque principal: texto aprobado por Gerencia el 17-11-2026, reproducido sin cambios, con [ESTADO] intacto.)*

**Meta title:** Cargas y retornos para tu camión · Carga360go
**Meta description:** Publica tu camión o tu retorno y recibe alertas por correo cuando aparezca una carga que calza con tu equipo y tu ruta. Ofreces tú el valor.

**H1:** Carga360go: más viajes que calzan con tu camión, y tu buen trabajo a la vista.

**Subtítulo:** Publica tu camión o tu retorno, recibe cargas que calzan con tu equipo y tu ruta, y construye un historial que te abre más oportunidades.

**CTAs**
- Primario: «Publica tu camión o tu retorno» → `/camiones/nuevo`
- Segunda opción: «Completa tu ficha de equipo» → `/registro` [DESTINO POR CONFIRMAR: confirmar si la ficha se completa en `/registro` o en el panel]

*(Bajo el hero: Línea de transparencia.)*

### Sección 5.1 · Lo que hay para ti (texto aprobado)

- **Seguimiento GPS** [ESTADO]: menos llamadas preguntando dónde vas, porque el cliente ve el avance.
  **[REQUIERE FUNCIÓN ACTIVA: GPS]** · *Alternativa segura (usar hoy):* Los hitos de tu operación quedan registrados con fecha y hora.
- **ETA, la hora estimada de llegada** [ESTADO]: el cliente sabe a qué hora llegas, así que la descarga se coordina mejor y esperas menos.
  **[REQUIERE FUNCIÓN ACTIVA: GPS]** · *Alternativa segura (usar hoy):* La hora de llegada la coordinas directo con el mandante que te adjudicó.
- **Contratos y tarifas** [ESTADO]: condiciones claras antes de partir, con acuerdos por ruta y zona y niveles de servicio por escrito.
- **Desempeño del transportista** [ESTADO]: tu cumplimiento queda registrado, y un buen historial te ayuda a ser elegido.
- **Asignación automática** [ESTADO]: con tu ficha de equipo completa y un buen desempeño, Carga360go te puede proponer para cargas que calzan, incluidos los retornos.

### Sección 5.2 · Cómo funciona (texto aprobado)

1. Inscríbete y completa la ficha de tu camión.
2. Publica tu disponibilidad o tu retorno.
3. Recibe propuestas de carga que calzan contigo.
4. Haz el viaje y ciérralo con la evidencia de entrega.
   **[REQUIERE FUNCIÓN ACTIVA: comprobante de entrega digital]** · *Alternativa segura (usar hoy):* 4. Haz el viaje y coordina el cierre directo con el mandante.

### Sección 5.3 · Lo que ya funciona hoy

**Título:** Lo que ya tienes en Carga360go

- **Retornos que calzan.** Publica tu viaje de vuelta. El calce cruza origen, destino, fechas, equipo y capacidad, y te avisa por correo. Es una recomendación: no siempre habrá carga en cada fecha.
- **Tú pones el valor.** Ves un costo de referencia desglosado (ruta, peajes según ejes, diésel y operación) para ofertar con fundamento. Carga360go no impone el precio.
- **Tu contacto, protegido.** El mandante ve tu contacto solo si te adjudica.
- **Documentos al día.** Subes cédula, licencia profesional, padrón, revisión técnica, SOAP y permiso de circulación. El semáforo te avisa antes del vencimiento.
- **Corredor minero.** Calama, Antofagasta y Copiapó, con ficha técnica para cama baja y maquinaria. Y publicación abierta de Arica a Punta Arenas.

### Preguntas frecuentes (Transportistas)

- **¿Qué necesito para empezar?** Crear tu cuenta, confirmar correo y teléfono, y subir tus documentos. Un administrador revisa y activa tu cuenta.
- **¿Carga360go me asegura carga?** No. Carga360go te muestra las cargas que calzan y te avisa por correo. Elegir, ofertar y hacer el viaje depende de ti y del mandante.
- **¿Quién fija el valor del viaje?** Tú ofertas tu valor. El costo de referencia desglosado te sirve de apoyo.

### Cierre (Transportistas)

**Título:** No vuelvas vacío. Publica tu retorno hoy.
CTAs: «Publica tu camión o tu retorno» → `/camiones/nuevo` · «Ver cargas vigentes» → `/cargas`

---

## 6. Clientes (mandantes y generadores de carga)

*(Bloque principal: texto aprobado por Gerencia el 17-11-2026, reproducido sin cambios, con [ESTADO] intacto.)*

**Meta title:** Publica tu carga y encuentra camión · Carga360go
**Meta description:** Publica tu carga, recibe ofertas de transportistas acreditados y ve un costo de referencia desglosado. Foco en el norte minero, de Arica a Punta Arenas.

**H1:** Carga360go: tu flete organizado, de la contratación a la entrega.

**Subtítulo:** Publica tu carga, encuentra el transportista que calza con tu ruta y tu equipo, y sigue el viaje hasta el cierre, todo en un solo lugar.
**[REQUIERE FUNCIÓN ACTIVA: GPS, por «sigue el viaje hasta el cierre»]** · *Alternativa segura (usar hoy):* Publica tu carga, encuentra el transportista que calza con tu ruta y tu equipo, y ordena ofertas y adjudicación en un solo lugar.

**CTAs**
- Primario: «Publica tu carga» → `/cargas/nueva`
- Segunda opción: «Quiero una demostración» → formulario de contacto [DESTINO POR CONFIRMAR]
- Apoyo: «Abrir el cotizador (sin registro)» → `/herramientas/calculadora`

*(Bajo el hero: Línea de transparencia.)*

### Sección 6.1 · Lo que hay para ti (texto aprobado)

- **Seguimiento GPS** [ESTADO]: ves dónde va tu carga sin llamar al conductor.
  **[REQUIERE FUNCIÓN ACTIVA: GPS]** · *Alternativa segura (usar hoy):* Los hitos de tu operación quedan registrados con fecha y hora.
- **ETA, la hora estimada de llegada** [ESTADO]: sabes a qué hora llega y puedes coordinar la recepción con tiempo.
  **[REQUIERE FUNCIÓN ACTIVA: GPS]** · *Alternativa segura (usar hoy):* La hora de llegada la coordinas con el transportista adjudicado.
- **Contratos y tarifas** [ESTADO]: tus acuerdos por ruta y zona, con niveles de servicio claros, quedan registrados en un solo lugar.
- **Desempeño del transportista** [ESTADO]: eliges con información, porque cada transportista tiene un historial de cumplimiento.
- **Asignación automática** [ESTADO]: Carga360go te propone el transportista más adecuado según costo de referencia, desempeño y disponibilidad, y tu equipo lo confirma.

### Sección 6.2 · Cómo funciona (texto aprobado)

1. Publica tu carga con origen, destino, fechas y tipo de equipo.
2. Recibe la propuesta de transportista y confírmala.
   *(Nota para Cursor: mientras la asignación automática no esté activa, usar: «2. Recibe ofertas de transportistas acreditados y elige.»)*
3. Sigue el viaje y su ETA.
   **[REQUIERE FUNCIÓN ACTIVA: GPS]** · *Alternativa segura (usar hoy):* 3. Adjudica y coordina el viaje directo con el transportista.
4. Cierra el viaje con la evidencia de entrega.
   **[REQUIERE FUNCIÓN ACTIVA: comprobante de entrega digital]** · *Alternativa segura (usar hoy):* 4. El historial de la operación queda en tu panel.

### Sección 6.3 · Lo que ya funciona hoy

**Título:** Lo que ya tienes en Carga360go

- **Calce útil, no un listado genérico.** Carga360go cruza equipo, capacidad, ruta y fechas. Si mueves maquinaria, la ficha de cama baja pide ejes, ancho y medidas.
- **Costo de referencia desglosado.** Ruta, peajes según ejes, diésel publicado por la CNE y costos de operación, con su fuente. El valor final lo cierras con el transportista.
- **Cuentas revisadas y contacto protegido.** Un administrador acredita a los transportistas. El contacto se abre solo cuando adjudicas.
- **Alertas por correo.** Si hoy no hay un camión que calce, guarda una alerta y te avisamos.
- **Norte minero y todo Chile.** Foco en Calama, Antofagasta y Copiapó, con publicación abierta de Arica a Punta Arenas.

### Sección 6.4 · Atención

**Título:** Te acompañamos en cada paso

**Cuerpo:** El Agente Carga360go [NOMBRE POR CONFIRMAR: hoy visible como BASSAM 360] te ayuda por chat a cotizar y publicar. Reclamos, condiciones comerciales y casos especiales los ve siempre una persona del equipo de Carga360go. [Canal y horario de atención: PENDIENTE DE GERENCIA]

### Preguntas frecuentes (Clientes)

- **¿Carga360go transporta mi carga?** No. Te conecta con transportistas acreditados. El transporte y el acuerdo quedan entre tú y el transportista.
- **¿Cuánto cuesta usar Carga360go?** Para conocer las condiciones comerciales, escríbenos y te contacta una persona del equipo. [DESTINO POR CONFIRMAR]
- **¿Puedo pedir equipos especiales, como cama baja?** Sí. Indica el equipo al publicar y la ficha técnica ayuda a encontrar el calce. El calce no reemplaza permisos especiales ni escoltas.
- **¿Qué significa «verificado»?** Que un administrador revisó la cuenta y sus documentos vigentes. No es un sello de solvencia. Más detalle en `/como-verificamos`.

### Cierre (Clientes)

**Título:** Publica tu carga y encuentra el camión que calza.
CTAs: «Publica tu carga» → `/cargas/nueva` · «Quiero una demostración» → [DESTINO POR CONFIRMAR]

---

## Pie de página común

- Línea de transparencia (arriba).
- Enlaces: [ENLACE LEGAL EXISTENTE: Términos] · [ENLACE LEGAL EXISTENTE: Privacidad] · [ENLACE LEGAL EXISTENTE: Política de pagos] · «Cómo verificamos» → `/como-verificamos`
- Razón social: usar la que ya figura en el pie actual, sin cambios.

---

## Pendientes para Gerencia

1. **[ESTADO] de cada módulo** (Seguimiento GPS, ETA, Contratos y tarifas, Desempeño, Asignación automática): Disponible, En piloto o Próximamente. Este borrador asume que Control Tower y Tracking van como Próximamente.
2. **Fechas de encendido** de GPS, comprobante de entrega digital, voz y alertas por WhatsApp, para quitar las marcas [REQUIERE FUNCIÓN ACTIVA].
3. **Nombre del asistente:** confirmar «Agente Carga360go» en lugar de «BASSAM 360».
4. **Destinos por confirmar:** URLs de `/clientes`, `/transportistas`, `/control-tower`, `/tracking`, la lista de espera, el formulario de demostración y el canal de condiciones comerciales; además, el canal y horario de atención humana.
5. **Ajuste opcional en texto aprobado:** «así que la descarga se coordina mejor y esperas menos» (Transportistas, ETA). Se dejó tal cual; Gerencia decide si se quita «y esperas menos».
6. **Nombre del módulo «Contratos y tarifas»:** se dejó como lo aprobó Gerencia; confirmar si se prefiere «Compras y contratos de flete» para no sugerir que se publican tarifas.
