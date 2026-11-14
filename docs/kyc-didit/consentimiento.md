# Consentimiento para la verificación de identidad (datos biométricos)

> **Estado:** aprobado para publicarse **junto con** `KYC_FEATURE_ENABLED=true` (Bastián, 11-nov-2026; texto revisado por un abogado).
> Es el mismo texto de `src/lib/kyc/consent.ts` (versión `kyc-1.0-2026-11-11`).
> Con el flag apagado no se muestra ni se publica.
>
> **Pendiente de confirmación de Bastián (no bloquea el texto, pero hay que confirmarlo antes de producción):**
> propuesta de conservación: Didit guarda las imágenes como máximo **30 días** desde la decisión y luego las elimina; Carga360go **solo guarda el resultado** (sin fotos), mientras la cuenta esté activa y hasta **12 meses** después de su cierre. Si se cambia el plazo, hay que subir la versión del consentimiento.

**Consentimiento para verificar tu identidad (datos biométricos)**

CARGA360GO SpA (RUT 78.553.352-6, Colón 352 of. 318, La Serena) necesita verificar la identidad de cada persona que usa Carga360go, sea mandante o transportista, para evitar suplantaciones y fraudes en la contratación de fletes.

Para eso te pediremos una foto de tu cédula de identidad chilena (por ambos lados) y una selfie en video corta. Con ellas se comprueba que la cédula es auténtica y está vigente, que eres una persona real presente en ese momento (prueba de vida) y que tu rostro coincide con la foto de la cédula. La imagen de tu rostro y su comparación son datos biométricos, que la Ley 21.719 considera datos personales sensibles.

La verificación la realiza nuestro proveedor Didit (Didit Identity Technologies S.L., Barcelona, España), por encargo de CARGA360GO SpA. Tus imágenes se procesan y almacenan en servidores de la Unión Europea (Irlanda), que cuenta con un nivel adecuado de protección de datos. Carga360go no guarda tus fotos ni tu selfie: solo recibe el resultado (aprobado, rechazado o en revisión), tu nombre y RUN leídos de la cédula y la fecha.

Usamos estos datos solo para verificar tu identidad y acreditar tu cuenta. No los usamos para publicidad ni los vendemos. Las imágenes se conservan en el proveedor como máximo 30 días desde la decisión y luego se eliminan. El resultado se conserva en Carga360go mientras tu cuenta esté activa y hasta 12 meses después de su cierre, para atender reclamos o requerimientos legales.

Tu consentimiento es voluntario, pero sin la verificación de identidad tu cuenta no puede acreditarse para publicar, ofertar ni recibir contactos. Puedes retirar tu consentimiento y ejercer tus derechos de acceso, rectificación, supresión, oposición, portabilidad y bloqueo escribiendo a contacto@carga360go.cl. Más detalles en nuestra Política de Privacidad.

☐ *Autorizo expresamente a CARGA360GO SpA y a su proveedor Didit a tratar mis datos biométricos (imagen de mi rostro y de mi cédula) para verificar mi identidad, en los términos descritos arriba.*

Enlaces junto al texto: Aviso de privacidad de Didit (https://didit.me/terms/verification-privacy-notice), Términos de verificación de Didit (https://didit.me/terms/identity-verification) y la Política de Privacidad de Carga360go.

Qué se registra: fecha y hora del consentimiento y la versión del texto (tabla `kyc_verifications`), y se envía a Didit como `biometric_consent` para que su flujo no lo pida de nuevo.

No se incluye la consulta al Registro Civil (decisión del 11-nov-2026).
