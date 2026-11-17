# Atención al cliente y base de conocimiento

## Audiencias
Mandantes, transportistas, conductores, empresas mineras, retail, contratistas, operadores logísticos, sindicatos, inversionistas, bancos y factoring.

## Intenciones
Registro, validación de empresa y documentos, publicación de cargas/camiones, cotización, cobertura geográfica, disponibilidad, postulación, matching, seguimiento GPS, QR, entrega, cobros, facturación, comisiones, acceso, contraseña, soporte, reclamos, incidentes, privacidad, cancelaciones, reuniones y convenios.

## Plantilla Q&A escalable
Cada entrada JSONL: `id`, `intencion`, `audiencia`, `preguntas_variantes`, `respuesta_aprobada`, `fuente`, `fecha_validacion`, `requisitos`, `accion_permitida`, `escalamiento`, `idioma`, `version`.
- No inventar precio, plazo, contrato, póliza, coberturas, funcionalidades o promesas de entrega.
- Preguntar solo datos indispensables y no solicitar contraseñas, códigos OTP ni datos bancarios por chat.
- Consultar API/CRM con permisos cuando estén conectados; identificar si la respuesta es informativa o depende del estado del usuario.
- Si faltan hechos, responder con transparencia y abrir caso o derivar a responsable.
- Preparar corpus de 5.000 pares verificados mediante combinaciones de intenciones y paráfrasis, deduplicación semántica, pruebas y revisión humana antes de producción; no confundir variaciones sintéticas con 5.000 políticas independientes.
- Evitar fuga de contactos corporativos internos o datos personales a perfiles sin acceso.
