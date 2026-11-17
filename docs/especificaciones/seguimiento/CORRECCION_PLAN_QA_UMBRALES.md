# Corrección del plan de QA — umbrales oficiales y enlace público — Carga360go

**Fecha:** 17-11-2026 (hora de Chile, UTC-3) · solo documento
**Plan original (sin modificar):** `/workspace/c360/out/equipo/QA_PLAN_OPS.md`. Ese archivo **no está en el repo** (`git ls-files` no lo encuentra); vive en la carpeta de trabajo del equipo. No se editó.
**Patch aplicable:** `CORRECCION_PLAN_QA_UMBRALES.patch` (misma carpeta). Probado con `--dry-run`, sin errores:

```bash
cd /workspace/c360/out/equipo && patch -p0 --dry-run < seguimiento/CORRECCION_PLAN_QA_UMBRALES.patch   # comprobar
cd /workspace/c360/out/equipo && patch -p0 < seguimiento/CORRECCION_PLAN_QA_UMBRALES.patch             # aplicar (cuando se apruebe)
```

**Fuentes del cambio:**
- decisión 3 de JEFE BASTIAN (17-11-2026): los umbrales oficiales son los del código, `detencion` 20, `sin_senal` 45 y `atraso` 30, todos configurables por variable de entorno;
- PR #55 (`facd763`, merge `be067cb`): el enlace público no muestra alertas;
- código en `origin/release/2026-11-15` `f5b5893`: `src/lib/ops/alerts.ts` y `src/lib/ops/alert-config.ts`.

## Cambios caso por caso

| Sección / caso | Antes | Después |
|---|---|---|
| §5.5 tabla «Umbrales de torre» (encabezado) | «configurables; valores de prueba, no operativos definitivos» | Oficiales e iguales a los del código; configurables por variable y, por envío, con `PUT /api/ops/envios/{id}/alertas` |
| §5.5 Atraso | ETA > plan + **15 min** (o la tolerancia del SLA) | ETA > plan + **30 min** (estrictamente mayor). `OPS_ALERTA_ATRASO_MIN` propuesta en la migración ops_operation_alerts; hoy está fijo en 30 |
| §5.5 Detención | desplazamiento < **30 m** durante **30 min** | dos últimas posiciones a ≤ **200 m**, durante ≥ **20 min**, fuera del destino (`OPS_ALERTA_DETENCION_MIN`) |
| §5.5 Sin señal | sin posición durante **20 min** | sin posición durante ≥ **45 min** (`OPS_ALERTA_SIN_SENAL_MIN`); la evalúa `POST /api/ops/alertas/senal` |
| TWR-07 | Lee `ops_exceptions`; tolerancia de 15 min | Lee `ops_alerts` (`GET .../alertas`); `severity='media'`; no abre con ≤ 30 min; audita `ops.alerta_abierta` y registra el evento `alerta.abierta` |
| TWR-08 | ETA +10 min con tolerancia 15 | Borde: ETA +30 no abre y +31 sí abre; si el ambiente define `OPS_ALERTA_ATRASO_MIN`, rige ese valor |
| TWR-09 | Serie < 30 m durante 30 min; control de 25 min | ≤ 200 m y 20 min (abre con `>=`); control de 19 min; dentro del destino no abre; `severity='alta'` |
| TWR-10 | H+20 abre, H+19 no; «job que evalúa» | H+45 abre, H+44 no; evaluador `evaluateSilentSignals(now)` o `POST /api/ops/alertas/senal`; sin secreto → 503; una posición nueva cierra la alerta. En producción, el timer systemd cada 5 min (**bloqueado** hasta que Gerencia defina `OPS_ALERTAS_JOB_SECRET`) |
| TWR-11 | Detención 10 → restaurar a 30; «el cambio queda auditado» | `OPS_ALERTA_DETENCION_MIN=10` → sin variable = 20; un valor inválido vuelve a 20; la fila por envío gana; **solo** el cambio por envío se audita (`ops.alerta_umbral`), el de la variable no |
| **TWR-16** | El enlace puede mostrar un estado genérico («en tránsito», «con demora») | **Sin ningún estado de alerta.** La respuesta pública tiene exactamente `destination, etaAt, origin, position, stage, token, truckAware`: sin `alerts`, sin `severity`, sin `kind` y sin «con demora». Abrir el enlace no abre ni cierra alertas |
| E2E-02, paso 4 | «si no se superó el umbral» | «si la detención breve duró menos de 20 min» |

No cambian: TWR-01 a 06 y TWR-12 a 15 (salvo la observación de abajo), y la tabla de severidad de defectos (§6.1).

## Observación fuera del alcance de esta corrección (para JEFE BASTIAN)

**TWR-12 y el código no coinciden en el token del enlace.** El plan exige guardar el **hash** del token y trata el valor en claro como «defecto crítico» (`QA_PLAN_OPS.md`, TWR-12). En `f5b5893`, `src/lib/ops/tracking.ts`:
- guarda el token en claro como clave primaria de `ops_tracking_links` (`INSERT INTO ops_tracking_links (token, ...)`);
- también lo escribe en la auditoría (`auditStrict(..., "ops.seguimiento_emitido", ..., { token })`).

Es un tema de seguridad (Nivel 3): no se corrige aquí y se informa solo a JEFE BASTIAN.

## Alineación hecha en los casos de prueba

- `CASOS_PRUEBA_INCIDENCIAS.md` y `fixtures_incidencias_EJEMPLO.json` ya usan los umbrales oficiales.
- Se suman CPI-T06 (`OPS_ALERTA_ATRASO_MIN`), CPI-T07 (vínculo operación → envío) y CPI-T08 (bloqueo del secreto).
- Las operaciones usan el formato real `360-YYMM-NNNN`, marcado EJEMPLO: `360-2611-9901` a `360-2611-9916`.

*Fin. Carga360go.*
