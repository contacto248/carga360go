# Adición a la Política de Privacidad: verificación de identidad y datos biométricos

> **Estado:** aprobada para publicarse **junto con** `KYC_FEATURE_ENABLED=true` (Bastián, 11-nov-2026; texto revisado por un abogado).
> Con el flag apagado, /privacidad queda en la versión **1.5-2026-11-17**.
> Al encender el flag, la política pasa a **1.6-2026-11-17**, se agrega esta sección (y ajustes en definiciones, proveedores e historial) y el sitio pide a todas las cuentas aceptarla de nuevo.
> El HTML de /privacidad se arma en `src/lib/privacy-policy.ts` (`policySections()`). Los PDF/DOCX de /privacidad hay que regenerarlos al encender el flag (`scripts/legal-json.ts` + `scripts/export-legal-docs.py`), con el flag en true.
>
> **Pendiente de confirmación de Bastián antes de producción:** plazos de conservación propuestos (30 días de imágenes en Didit; resultado en Carga360go hasta 12 meses después del cierre de la cuenta). No hay consulta al Registro Civil.

El texto publicado con el flag es el de `policySections()` / sección 17, equivalente al siguiente:

## 17. Verificación de identidad y datos biométricos

**Qué datos tratamos.** Para acreditar cada cuenta (mandante o transportista) verificamos la identidad de la persona que la usa. Se trata: (a) la imagen de la cédula de identidad chilena por ambos lados y los datos que contiene (nombre, RUN, fecha de nacimiento, número y vigencia del documento); (b) una selfie en video para la prueba de vida; y (c) la comparación biométrica entre el rostro de la selfie y la foto de la cédula. No consultamos el RUN ante el Registro Civil. La imagen del rostro y la comparación facial son datos biométricos, datos personales sensibles según la Ley 21.719.

**Para qué.** Únicamente para verificar que la persona es quien dice ser, prevenir suplantaciones y fraudes en la contratación de fletes y acreditar la cuenta. No se usan para publicidad, perfiles comerciales ni decisiones distintas de la acreditación, y no se venden ni se ceden.

**Base de licitud.** El consentimiento expreso de la persona, que se pide en una casilla específica antes de iniciar la verificación y que queda registrado con fecha y versión del texto. Es voluntario, pero sin la verificación la cuenta no puede acreditarse para publicar, ofertar ni recibir contactos.

**Quién lo hace (encargado del tratamiento).** Didit Identity Technologies S.L. (Barcelona, España), que realiza la verificación por cuenta de CARGA360GO SpA bajo un acuerdo de tratamiento de datos (DPA). Didit cuenta con certificaciones ISO 27001 y SOC 2.

**Transferencia internacional.** Las imágenes y datos de la verificación se procesan y almacenan en servidores de la Unión Europea (Irlanda). La Unión Europea, bajo el Reglamento General de Protección de Datos (RGPD), ofrece un nivel adecuado de protección.

**Qué guarda Carga360go.** No guardamos las fotos ni la selfie. Guardamos solo: el resultado (aprobado, rechazado, en revisión), el nombre y RUN leídos de la cédula (para compararlos con los datos de la cuenta), códigos de alerta técnicos, la fecha y el registro del consentimiento.

**Plazos de conservación.** Imágenes y datos biométricos en Didit: como máximo 30 días desde la decisión, y luego se eliminan. Resultado de la verificación en Carga360go: mientras la cuenta esté activa y hasta 12 meses después de su cierre, para atender reclamos o requerimientos legales.

**Derechos.** Puedes pedir acceso, rectificación, supresión, oposición, portabilidad y bloqueo, y retirar tu consentimiento en cualquier momento, escribiendo a contacto@carga360go.cl. Retirarlo no afecta la licitud del tratamiento previo, pero la cuenta deja de estar acreditada. También puedes reclamar ante la Agencia de Protección de Datos Personales.

**Seguridad.** La comunicación con Didit es cifrada; las respuestas del proveedor se reciben firmadas (HMAC) y se descartan las que no lo están. El acceso al resultado en el panel está limitado a administradores de Carga360go y queda registrado en la auditoría.
