# Política de Pagos de Carga360go

**Versión borrador 0.2 sujeta a revisión legal** · 11 de noviembre de 2026 · Operador: CARGA360 GO SpA, RUT 78.553.352-6 · Contacto: contacto@carga360go.cl

# Parte 1. Cómo funcionan los pagos (explicación en simple)

Carga360go es un marketplace de fletes: conecta a quien necesita transportar carga (**mandante**) con quien la transporta (**transportista**). **Carga360go no es el transportista, no es el dueño de la carga y no se queda con la plata del flete.** El precio lo acuerdan las partes; la plataforma no fija un mínimo ni un máximo.

El pago se hace con **Mercado Pago Checkout Pro**, en modalidad marketplace (split 1:1). El mandante paga en la página de Mercado Pago. El dinero entra **directamente en la cuenta Mercado Pago del transportista**. Carga360go no recibe ni custodia ese dinero en su cuenta. Hoy la comisión de la plataforma por el flete es **$0**.

Carga360go **no guarda datos de tarjetas** (número, vencimiento ni CVC). Eso lo maneja Mercado Pago.

### Quién puede usar este flujo

- Solo cuentas **100 % acreditadas** (correo y teléfono confirmados, identidad verificada y revisión de Carga360go; el transportista, además, con sus documentos vigentes).
- Los **datos de contacto se revelan solo cuando se cierra una oferta**, y únicamente entre las dos partes de ese flete.
- Cada cuenta tiene **30 días corridos gratis** desde su propia inscripción. Publicar, ofertar y adjudicar es gratis por ahora. Después de esos 30 días se cobrará una **membresía** cuyo valor **[PENDIENTE DE DEFINIR]**.
- El transportista, para cobrar por la plataforma, debe **conectar su propia cuenta Mercado Pago** y declarar que puede emitir factura o boleta del flete (inicio de actividades en el SII). Sin eso, el mandante no puede pagar en la plataforma.

### El viaje del pago, paso a paso

1. **Publicar.** El mandante publica la carga. El transportista publica su camión o viaje, si quiere, y ve las cargas compatibles.
2. **Ofertar.** El transportista ofrece un precio en pesos chilenos (CLP). Ese precio lo pone él; Carga360go no lo impone.
3. **Cerrar.** El mandante elige una oferta. Recién ahí ambas partes ven el contacto de la otra. El sistema arma el pago del flete en dos cuotas: **anticipo** y **saldo**.
4. **Pagar el anticipo.** El mandante ve el desglose (cuota del flete, costo estimado del medio de pago y total) y entra a Mercado Pago a pagar. El viaje no debería comenzar como “anticipo pagado” hasta que Mercado Pago confirme el cobro. La vuelta a Carga360go no es la confirmación definitiva: esta llega cuando Mercado Pago avisa a la plataforma.
5. **Viaje.** Con el anticipo aprobado, el transportista puede marcar el flete **en tránsito** y realizar el servicio.
6. **Entrega y POD.** Al descargar, el transportista sube el comprobante de entrega (POD): al menos una foto del documento de recepción firmado y la firma de quien recibió (en un archivo o en esa misma foto). Ahí parte el plazo para reclamar.
7. **Pagar el saldo.** El mandante paga la segunda cuota, otra vez en Mercado Pago. Puede hacerlo durante el plazo de reclamo.
8. **Liberación.** El flete queda en “saldo liberado” solo cuando el saldo ya fue aprobado **y** se cumplió el plazo de reclamo **sin** un reclamo abierto. Importante: eso es un estado de la plataforma. **No es una caja fuerte ni una retención (escrow)** dentro de Mercado Pago: cuando un pago se aprueba, el dinero ya quedó en la cuenta del transportista, en los plazos que Mercado Pago tenga configurados (por ejemplo, al instante o a varios días).
9. **Reclamos.** El mandante o el transportista pueden abrir un reclamo mientras el flete está en tránsito o, después del POD, mientras siga abierto el plazo. Si hay un reclamo, no se pasa a “saldo liberado”. Un administrador de Carga360go revisa el caso y puede liberar, reembolsar todo o reembolsar una parte.

### Cancelar antes de pagar el anticipo

Mientras el anticipo no esté pagado (ni en proceso en Mercado Pago), el mandante puede **cancelar el pago del flete** desde “Mis pagos”, con una confirmación. Eso no cobra nada, pero tampoco reabre la carga ni cambia la oferta elegida. Si el anticipo ya se pagó, la cancelación y un eventual reembolso los revisa un administrador.

### Un ejemplo numérico (solo para entender)

Supongamos un flete pactado de **$100.000**. Con el porcentaje de anticipo que se usa hoy (**40 %**, [PENDIENTE DE DEFINIR]):

| Concepto | Monto del flete | Qué paga el mandante si absorbe el costo de Mercado Pago |
|---|---:|---:|
| Anticipo (40 %) | $40.000 | aprox. **$41.578** |
| Saldo (60 %) | $60.000 | aprox. **$62.368** |
| Total del flete | $100.000 | aprox. **$103.946** |

Esos $1.578 y $2.368 no son una comisión de Carga360go. Son el **estimado** del costo de Mercado Pago (hoy se calcula con una tasa de 3,19 % más IVA de 19 %). El costo real lo determina Mercado Pago según el medio y el plazo que elija el pagador. Si se define que el costo lo absorbe el transportista, el mandante paga solo los $40.000 y $60.000, y Mercado Pago descuenta su comisión de lo que recibe el transportista. Ver la sección 5 de la Política de Pagos.

---

# Parte 2. Política de Pagos (texto formal — borrador)

**Advertencia.** Este es un borrador de trabajo, preparado a partir del sistema implementado en el ambiente de pruebas. No constituye Términos de uso publicados ni una oferta comercial vinculante hasta que un abogado lo revise, CARGA360 GO SpA lo apruebe y se publique en carga360go.cl, con la aceptación correspondiente de los usuarios.

## 1. Objeto y alcance

1.1. Esta Política regula el pago del flete a través de la plataforma Carga360go cuando el mandante y el transportista utilizan el flujo de pagos habilitado por CARGA360 GO SpA.

1.2. El objeto es que el mandante pague el precio del flete pactado en la oferta adjudicada, y que ese dinero se acredite en la cuenta Mercado Pago del transportista, **sin que CARGA360 GO SpA reciba, capte ni custodie el flete en una cuenta propia**.

1.3. Esta Política no convierte a Carga360go en porteador, transitario, asegurador, factoring ni entidad financiera. El contrato de transporte, los seguros, la documentación de la carga y la responsabilidad por ella siguen siendo materia entre el mandante y el transportista.

1.4. El flujo de pagos en el sitio de producción (www.carga360go.cl) permanecerá apagado hasta que CARGA360 GO SpA lo habilite expresamente. Mientras esté solo en ambiente de pruebas, no está disponible para el público ni mueve dinero real.

1.5. El medio de pago, los plazos, las cuotas, las comisiones y las reglas de reembolso o reclamo que más abajo aparecen como **[PENDIENTE DE DEFINIR]** son valores de trabajo del ambiente de pruebas. Se congelan, para cada flete, al crearse el pago, según la configuración entonces vigente. No se aplicarán en producción sin aprobación y, cuando corresponda, sin actualizar los Términos de uso.

## 2. Partes

2.1. **La plataforma.** CARGA360 GO SpA, en adelante “Carga360go”, opera el marketplace y el módulo de pagos como intermediaria tecnológica. No es parte del contrato de transporte.

2.2. **El mandante.** Usuario que publica la carga, acepta una oferta y, cuando usa este flujo, paga el anticipo y el saldo a través de Mercado Pago.

2.3. **El transportista.** Usuario cuya oferta fue aceptada y que recibe el pago en su propia cuenta Mercado Pago, previa vinculación y declaración tributaria descrita en el punto 3.3.

2.4. **Mercado Pago.** Proveedor externo del checkout y de la acreditación de fondos. Las condiciones, plazos de acreditación, medios disponibles, rechazos, contracargos y comisiones de Mercado Pago se rigen por el contrato entre el usuario y Mercado Pago. Carga360go no controla esas reglas.

2.5. Solo pueden participar cuentas 100 % acreditadas, en los términos publicados en los Términos de uso y en la Política de Privacidad. Los datos de contacto se muestran únicamente al adjudicar una oferta y solo entre las dos partes de ese flete.

## 3. Medio de pago y vinculación de la cuenta

3.1. El medio del sistema es **Mercado Pago Checkout Pro**, en modalidad **marketplace o split 1:1**. El mandante es redirigido a una página de Mercado Pago para pagar. La moneda es **peso chileno (CLP)**.

3.2. El cobrador (collector) es la cuenta Mercado Pago del transportista, autorizada por este mediante OAuth. Carga360go no crea esa cuenta por el transportista: si no la tiene, puede crearla en el mismo flujo de Mercado Pago.

3.3. Para que el mandante pueda pagar en la plataforma, el transportista debe:

- conectar su cuenta Mercado Pago y mantener la autorización vigente (Mercado Pago emite un permiso que dura aproximadamente seis meses y la plataforma intenta renovarlo; si la renovación falla o el transportista revoca el permiso, hay que volver a conectar); y
- declarar, bajo su responsabilidad, que puede emitir factura o boleta por el flete (inicio de actividades ante el Servicio de Impuestos Internos). Esta declaración no es un certificado del SII ni una validación hecha por Carga360go.

3.4. El transportista puede desconectar su cuenta Mercado Pago en cualquier momento. Eso no borra el historial de fletes ya pagados, pero impide crear nuevos checkouts hasta que vuelva a conectar.

3.5. Carga360go **no almacena, no procesa y no tiene acceso** al número de tarjeta, al vencimiento ni al código de seguridad. La seguridad PCI del checkout es de cargo de Mercado Pago.

3.6. Otros rieles (por ejemplo, transferencias bancarias directas u otros proveedores) no forman parte de este sistema. Está prohibido instruir el depósito del flete en una cuenta bancaria de CARGA360 GO SpA.

## 4. Flujo de cuotas: anticipo, viaje, saldo y liberación

4.1. Cuando el mandante acepta una oferta, la plataforma crea un pago de flete asociado a esa carga, con dos cuotas: **anticipo** y **saldo**. El precio pactado es el `precio en pesos` de la oferta aceptada.

4.2. **[PENDIENTE DE DEFINIR] Porcentaje de anticipo.** Hoy el anticipo es el **40 %** del flete pactado y el saldo es el **60 %** restante. El anticipo se calcula como porcentaje entero del monto pactado; el saldo absorbe el ajuste por redondeo, de modo que anticipo + saldo sea exactamente el flete. Ese porcentaje se congela al crear el pago, aunque después cambie la configuración general.

4.3. **[PENDIENTE DE DEFINIR] IVA del flete.** Hoy el precio de la oferta se trata como el **monto bruto pactado** y el **IVA del flete se registra en $0**, hasta que un contador defina si el precio acordado es neto, bruto o exento, y cómo se debe desglosar. El 19 % que aparece en el desglose del checkout no es el IVA del flete: es el IVA usado para **estimar** la comisión de Mercado Pago (sección 5).

4.4. El mandante solo puede pagar:

- el **anticipo**, cuando el flete está adjudicado y esa cuota no está ya aprobada, pendiente en Mercado Pago, reembolsada ni en contracargo;
- el **saldo**, cuando el transportista ya subió el POD y el flete está en estado “entregada (POD)”, con las mismas restricciones de la cuota.

4.5. Antes de ir a Mercado Pago, la plataforma muestra el desglose calculado en el servidor: cuota del flete, costo estimado del medio de pago (si corresponde) y total a pagar, con la nota de que el costo final lo determina Mercado Pago. El navegador no define el precio.

4.6. Un checkout ya creado puede reutilizarse por un plazo breve (hoy, 24 horas) si la cuota sigue pendiente. Si el transportista vuelve a conectar su cuenta Mercado Pago, se emite un checkout nuevo. La página de retorno («pago procesado», «pendiente» o «no se completó») es solo informativa. El estado oficial se confirma cuando Mercado Pago notifica a Carga360go y la plataforma consulta el pago en Mercado Pago.

4.7. Con el anticipo **aprobado**, el transportista puede marcar el flete **en tránsito**. También puede subir el POD sin haber marcado ese paso, si el viaje fue corto.

4.8. El **POD (proof of delivery)** consiste en la carga, por el transportista, de entre 1 y 6 archivos (JPG, PNG, WEBP o PDF): como mínimo, la foto del documento de recepción firmado y la firma de quien recibió, en un archivo aparte o declarada en esa foto. Al aceptar el POD, la plataforma calcula el plazo de reclamo.

4.9. El mandante paga entonces el saldo. El pago del saldo puede ocurrir durante el plazo de reclamo.

4.10. El estado **“saldo liberado”** se alcanza cuando, acumulativamente: (a) el POD fue presentado; (b) el saldo está aprobado por Mercado Pago; (c) el plazo de reclamo venció; y (d) no hay un reclamo abierto o en mediación. Un administrador también puede registrar esa liberación al resolver un reclamo a favor del transportista, si el saldo ya está aprobado.

4.11. **“Saldo liberado” no significa que Carga360go retuviera el dinero y lo soltara.** En este sistema no hay una retención tipo escrow dentro de Mercado Pago. Cuando Mercado Pago aprueba un pago (anticipo o saldo), los fondos se acreditan en la cuenta del transportista según los plazos de Mercado Pago. Carga360go no puede “congelar” esos fondos por su cuenta.

4.12. **[PENDIENTE DE DEFINIR] Plazo para pagar y política de reintento o de pagos pendientes (deferred retry).** Hoy el sistema hace lo siguiente, y falta decidir la regla de negocio:

- Si Mercado Pago **rechaza** el pago, el mandante puede **volver a intentar** de inmediato, con el mismo u otro medio, desde “Mis pagos”.
- Si el pago queda **pendiente** en Mercado Pago (en proceso, autorizado o en mediación), **no se puede abrir un nuevo checkout** de esa cuota hasta que Mercado Pago lo resuelva. No hay un job que cancele ni reintente esa cuota en forma automática.
- **No hay un plazo máximo** para pagar el anticipo después de adjudicar, ni para pagar el saldo después del POD. Tampoco hay una cancelación automática del flete si el anticipo no se paga.
- La disponibilidad del dinero en la cuenta del transportista (al instante o diferida, por ejemplo a 10 días) la define **Mercado Pago y la configuración de esa cuenta**, no Carga360go.

Se debe definir, con el abogado, qué ocurre si el anticipo no se paga en cierto plazo, si un pago queda indefinidamente pendiente, y si el transportista puede o no iniciar el viaje antes de la confirmación del anticipo.

## 5. Comisiones y costos

5.1. **[PENDIENTE DE DEFINIR] Comisión de la plataforma.** Hoy, `marketplace_fee` es **$0 (cero pesos)** por cada preferencia de pago. Carga360go no retiene un cargo propio sobre el flete. Este monto es configurable; cualquier valor distinto de cero exigirá aprobación, actualización de los Términos y comunicación previa a los usuarios.

5.2. **[PENDIENTE DE DEFINIR] Quién paga la comisión de Mercado Pago.** Hoy la configuración es **`shipper`**: se recarga el total cobrado para que, según un estimado, el transportista reciba la cuota pactada y el **mandante absorba** el costo del medio de pago. La alternativa, no activa hoy, es **`trucker`**: se cobra solo la cuota pactada y Mercado Pago descuenta su comisión de lo que recibe el transportista.

5.3. El recargo, cuando lo absorbe el mandante, se calcula así, con una tasa **estimada**:

`total a cobrar = redondear al peso (cuota / (1 − tasa estimada × (1 + IVA)))`

Hoy la tasa estimada es **3,19 %** y el IVA aplicado a esa estimación es **19 %** (tasa de referencia de Checkout de Mercado Pago en Chile, consultada el 11 de noviembre de 2026, para disponibilidad al instante). La tasa real puede ser otra (por ejemplo, un plazo de acreditación distinto o una promoción). **Ese costo lo cobra Mercado Pago, no Carga360go**, y no debe presentarse como tarifa de la plataforma.

5.4. Orden de descuentos en Mercado Pago, conforme a su documentación de split 1:1: primero se descuenta la comisión de Mercado Pago de lo pagado; después, si existiera, la comisión del marketplace. Con comisión de plataforma $0, el neto del transportista es, en lo sustancial, lo cobrado menos la comisión de Mercado Pago.

5.5. Publicar cargas o camiones, ofertar y adjudicar **no tiene cobro de Carga360go** durante el periodo gratis de 30 días corridos contado desde la inscripción de cada cuenta. La membresía posterior es **[PENDIENTE DE DEFINIR]** en su valor, fecha de inicio y beneficios. Carga360go no cobra comisión por el flete en este diseño, mientras la comisión de plataforma siga en $0.

5.6. Carga360go no fija precios mínimos ni máximos de flete. El único requisito técnico es que el precio de la oferta sea un entero en pesos mayor que cero.

## 6. Reembolsos y cancelaciones

6.1. **[PENDIENTE DE DEFINIR] Reglas de cancelación y de reembolso.** La especificación de trabajo (no aprobada) proponía: reembolso del anticipo si se cancela antes de cargar, descontando lo que Mercado Pago no devuelva; reembolso total del anticipo si el transportista no se presenta; y, si ya se cargó, resolución caso a caso, con posible pago parcial. **Eso aún no está definido ni automatizado.**

6.2. Lo que el sistema hace hoy:

- Un **administrador** puede marcar un flete como cancelado. Esa acción **no dispara por sí sola un reembolso**. Si ya hubo un pago aprobado, el reembolso debe pedirse además, también por un administrador.
- El **mandante** puede cancelar el pago del flete **antes de pagar el anticipo**, desde “Mis pagos” y con una confirmación, siempre que el anticipo no esté aprobado ni pendiente en Mercado Pago. No se cobra nada. La cancelación no reabre la carga ni cambia la oferta elegida, y el pago cancelado no se vuelve a crear solo para esa adjudicación. **[PENDIENTE DE DEFINIR]** qué pasa con la carga después (reabrirla, elegir otra oferta) y si hay alguna consecuencia para el mandante.
- Si Mercado Pago llegara a aprobar un pago sobre un flete ya cancelado (por ejemplo, con un enlace abierto antes), queda una alerta para que un administrador lo revise y reembolse.
- No hay un proceso automático que cancele fletes no pagados.
- Después de pagado el anticipo, o con el viaje en tránsito, solo un administrador puede cancelar el flete de pagos, según las reglas que se definan.

6.3. Los reembolsos se solicitan a Mercado Pago con el permiso del transportista (el dinero sale de la cuenta que cobró). Pueden ser totales o parciales, sobre una cuota aprobada. Mercado Pago documenta un plazo de hasta **180 días** desde la aprobación; rigen las condiciones de Mercado Pago.

6.4. Para reembolsar, la cuenta Mercado Pago del transportista debe tener **saldo suficiente**. En el split 1:1, el reembolso se reparte en proporción entre el vendedor y el marketplace. Con comisión de plataforma $0, la parte de Carga360go es $0. **Si el transportista no tiene saldo, Carga360go no cubre con su caja la parte del transportista.** El flete queda en “reembolso fallido”, se registra y un administrador puede reintentarlo cuando el transportista reponga saldo o lo resuelva en Mercado Pago.

6.5. Toda solicitud de reembolso o cancelación administrativa queda auditada. No se ejecuta un reembolso solo porque el navegador envíe un parámetro.

## 7. Reclamos y disputas

7.1. **[PENDIENTE DE DEFINIR] Ventana de reclamo.** Hoy el plazo es de **48 horas hábiles** desde que se acepta el POD. Se cuentan horas completas de reloj en días hábiles, de lunes a viernes, excluyendo sábados, domingos y feriados de Chile, en zona **America/Santiago**. Si el POD se sube en un día no hábil, el conteo parte el siguiente día hábil.

7.2. Los feriados se cargan de una lista configurable. Están cargados los feriados nacionales que quedan de 2026 (8 y 25 de diciembre) y todos los de 2027: 1 de enero; 26 y 27 de marzo; 1 y 21 de mayo; 21 y 28 de junio; 16 de julio; 15 de agosto; 17, 18 y 19 de septiembre; 11 y 31 de octubre; 1 de noviembre; 8 y 25 de diciembre (fuente: feriados.cl, que cita la Biblioteca del Congreso Nacional; derivados de la ley vigente). Los feriados regionales o comunales no se consideran. **El calendario de 2028 y siguientes debe cargarse cada año.**

7.3. El mandante o el transportista del flete pueden abrir un reclamo:

- mientras el flete está **en tránsito**; o
- después del POD, **solo si el plazo de reclamo todavía no vence**.

Motivos previstos en el sistema: no se entregó; carga con daños; faltante; retraso grave; cobro incorrecto; u otro, con un comentario de hasta 1.000 caracteres.

7.4. Al abrirse un reclamo, el flete pasa a “en disputa” y no avanza a “saldo liberado”. Si el saldo ya se había cobrado, un administrador decide —conforme a las reglas que vise el abogado— si se libera, se reembolsa todo o se reembolsa una parte, con una nota de resolución.

7.5. Solo puede haber un reclamo abierto a la vez por flete. El administrador también puede llevar un flete a disputa cuando corresponda (por ejemplo, ante un contracargo).

7.6. Un **contracargo** informado por Mercado Pago abre un reclamo en forma automática y, si el estado del flete lo permite, lo pasa a “en disputa”. Carga360go no cubre con su caja el contracargo. Las partes deberán atenderlo también ante Mercado Pago, cuando corresponda.

7.7. Este reclamo interno no reemplaza las acciones que las partes puedan ejercer ante Mercado Pago, el Sernac, los tribunales de justicia u otras autoridades competentes, ni los plazos legales que rigen esas vías.

## 8. Pagos rechazados o no completados

8.1. Si Mercado Pago rechaza o no completa un pago, no se cobra esa operación y la cuota queda en estado rechazado (o sigue pendiente, si Mercado Pago aún no resuelve). El flete no avanza como si estuviera pagado.

8.2. El mandante puede reintentar un pago **rechazado** desde “Mis pagos”, con el mismo u otro medio disponible en Checkout Pro. Un pago **pendiente** en Mercado Pago no se reintenta hasta que ese intento se resuelva (ver punto 4.12).

8.3. Carga360go no garantiza que un medio de pago concreto esté siempre disponible, ni que Mercado Pago apruebe un intento. Los motivos de rechazo (fondos insuficientes, límite de intentos, rechazo del emisor u otros) los determina Mercado Pago o el medio de pago.

8.4. Si por un error o un reintento llegara a existir un segundo pago sobre una cuota ya aprobada, la plataforma no pisa el pago ya confirmado y deja constancia para revisión de un administrador.

## 9. Seguridad y datos personales

9.1. Carga360go no almacena datos de tarjetas ni de cuentas bancarias del checkout. Los tokens de autorización del transportista se guardan cifrados, no se envían al navegador y no se registran en los logs de aplicación.

9.2. Las notificaciones de Mercado Pago se aceptan solo si la firma es válida. El cuerpo de la notificación se trata como una señal: el estado se confirma consultando el pago en la API de Mercado Pago. Las notificaciones se registran sin secretos ni tokens, y se procesan de forma idempotente (un mismo aviso no debe aplicar dos veces el mismo cambio).

9.3. Las evidencias del POD se almacenan en forma privada, con acceso restringido a las partes del flete y a los administradores, y con registro de las acciones relevantes. No se pide, en este flujo, cédula, licencia, padrón ni póliza adicionales a las que ya exija la acreditación de la cuenta. Si una foto las incluyera, el acceso sigue restringido.

9.4. El tratamiento de datos personales (identificadores de pago, correos, RUT de las cuentas, evidencias del POD e identificadores de Mercado Pago) se rige por la Política de Privacidad de Carga360go y por la Ley N° 19.628 y, cuando entre en vigor en lo pertinente, la Ley N° 21.719. La finalidad es ejecutar el pago del flete, prevenir fraude, conciliar y cumplir obligaciones legales o contables. Carga360go no vende esos datos.

9.5. La Política de Privacidad describe el tratamiento de los datos del pago del flete en su sección «Pago de fletes con Mercado Pago». El plazo de conservación de comprobantes y evidencias lo confirmarán el abogado y el contador. No se eliminará un comprobante de pago si existe una obligación legal de conservarlo.

9.6. Mercado Pago interviene como proveedor de pagos. La calificación jurídica de ese tratamiento (encargado o responsable autónomo) la confirmará el abogado.

## 10. Obligaciones tributarias

10.1. **El flete lo factura el transportista al mandante.** Carga360go no emite la factura ni la boleta del flete.

10.2. Carga360go solo factura, cuando corresponda, **sus propios servicios** (por ejemplo, la membresía, cuando se defina y se cobre).

10.3. **[PENDIENTE DE DEFINIR] Tratamiento de IVA, boleta y factura del flete.** Falta el pronunciamiento de un contador sobre:

- si el precio pactado en la oferta es neto, bruto o exento;
- cómo debe desglosarse el IVA del transporte terrestre nacional en la plataforma y en el checkout;
- las obligaciones de cada parte ante el SII.

Mientras eso no se defina, el sistema no desglosa IVA del flete (lo deja en $0) y muestra el precio de la oferta como el monto pactado.

10.4. La casilla “puedo emitir factura o boleta” es una declaración del transportista. No reemplaza el inicio de actividades ni ninguna actuación ante el SII.

## 11. Responsabilidad de Carga360go como intermediaria

11.1. Carga360go actúa como intermediaria tecnológica del encuentro entre las partes y de la redirección al checkout de Mercado Pago. **No es el porteador, no es depositaria del flete ni del dinero del flete, y no garantiza la ejecución del transporte ni la solvencia de las partes.**

11.2. En particular, Carga360go no responde por:

- la calidad, puntualidad o seguridad del transporte, ni por daños, faltantes o pérdidas de la carga, salvo lo que una norma imperativa imponga y no pueda limitarse;
- la decisión de Mercado Pago de aprobar, rechazar, dejar pendiente, reembolsar o contracargar un pago;
- la falta de saldo del transportista para devolver un pago ya acreditado;
- la veracidad de la declaración tributaria del transportista o de los datos que cada usuario entrega;
- los plazos de acreditación o las comisiones que Mercado Pago aplique efectivamente.

11.3. Carga360go no cubre con su patrimonio el flete, los reembolsos, los contracargos ni las comisiones de Mercado Pago. No invita ni acepta depósitos del flete en sus propias cuentas.

11.4. Los precios sugeridos que eventualmente muestre la plataforma son referenciales y no constituyen una cotización ni una tarifa fijada por Carga360go.

11.5. Las limitaciones de esta sección se entienden sin perjuicio de los derechos que la ley chilena reconozca a los consumidores o usuarios y que no admitan renuncia o limitación.

## 12. Contacto y reclamos a la plataforma

12.1. Consultas, reclamos o solicitudes relativas a esta Política o al funcionamiento del módulo de pagos pueden dirigirse a:

- Correo: [contacto@carga360go.cl](mailto:contacto@carga360go.cl)
- WhatsApp: +56 9 5842 8693

12.2. El canal de WhatsApp de difusión o soporte no publica montos, contactos ni enlaces de pago de un flete concreto.

12.3. Esta Política se rige por las leyes de la República de Chile. Los tribunales competentes se determinarán conforme a la ley aplicable, incluidos, cuando corresponda, los de la comuna de La Serena.

## 13. Vigencia, aceptación y modificaciones

13.1. Este documento es el **borrador 0.2 del 11 de noviembre de 2026 (hora de Chile)**. No está vigente para los usuarios del sitio público mientras no se publique en carga360go.cl y se incorpore, o se referencie, en los Términos de uso, con el mecanismo de aceptación que ya usa la plataforma.

13.2. Carga360go podrá modificar esta Política. Los cambios sustanciales (por ejemplo, un cargo de plataforma distinto de $0, un nuevo porcentaje de anticipo o una regla distinta de quién paga la comisión de Mercado Pago) se comunicarán antes de aplicarse a nuevos fletes, y no se aplicarán en silencio a un flete cuyo pago ya fue creado, porque esos valores quedan congelados al crearse el pago.

13.3. Si alguna cláusula fuera declarada inválida, las restantes seguirán vigentes.

13.4. En caso de discrepancia entre esta Política, los Términos de uso y las condiciones de Mercado Pago: (a) para el contrato de transporte y el uso general de la plataforma, primarán los Términos de uso publicados; (b) para el procesamiento del pago, las condiciones de Mercado Pago en lo que sea de su cargo; (c) esta Política precisa el flujo de pagos en Carga360go. Cualquier contradicción deberá resolverse en la revisión legal previa a la publicación.

