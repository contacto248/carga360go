/**
 * Evals del Orquestador (ORQUESTADOR_SPEC_V1.md §7). Parte ejecutable hoy: todo lo que depende solo de los contratos puros.
 * Lo que necesita Core, el bus o un proveedor real queda como `test.todo` con su criterio de aceptación: Cursor lo implementa
 * en el PR indicado (Guía de implementación §10) y lo pasa de todo a test.
 *
 * Correr fuera del repo (como se verificó el 17-11-2026): tsc a CommonJS y `node --test`.
 * En el repo (destino `evals/`): `tsx --test evals/*.eval.test.ts` (script `test:evals`, PR-0).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as O from "../orquestador_contratos";
import * as M from "../mcp_tools_contrato";

const U = O.UmbralesRouter.parse({});
const base = { umbrales: U, intentosDesambiguar: 0, rolUsuario: "mandante" as const, injectionSospechosa: false };
const llm = (xs: [O.Intencion, number][]): O.ClasificacionLLM => ({ intenciones: xs.map(([intencion, confianza]) => ({ intencion, confianza })), modelo: "m", prompt_version: "router@v1" });
const sobre = (over: Record<string, unknown>) => ({ ...O.EJEMPLO_SOBRE, ...over });

describe("ruteo", () => {
  test("EV-01 cotizar por regla va a SALES sin LLM; SALES no puede crear operación", () => {
    const d = O.decidirRuta({ ...base, reglas: ["cotizar_flete"], llm: null });
    assert.equal(d.tipo, "rutear");
    if (d.tipo === "rutear") { assert.equal(d.fuente, "regla"); assert.deepEqual(d.destino, ["C360-SALES"]); }
    assert.equal(O.autorizarHerramienta("C360-SALES", "calcular_costo_referencia", null).ok, true);
    assert.equal(O.autorizarHerramienta("C360-SALES", "crear_operacion", null).ok, false);
    assert.equal(O.autorizarHerramienta("C360-SALES", "estructurar_solicitud", null).ok, false);
  });
  test("EV-02 OPS puede estructurar, validar y crear (2a)", () => {
    for (const h of ["estructurar_solicitud", "validar_solicitud", "crear_operacion"]) assert.equal(O.autorizarHerramienta("C360-OPS", h, null).ok, true, h);
    assert.match(M.formatOperacionId("2611", 1), M.RE_OPERACION_ID);
  });
  test("EV-15 mandante pidiendo asignar: rol no permitido, no se delega a DISPATCH", () => {
    const d = O.decidirRuta({ ...base, reglas: ["asignacion_proponer"], llm: null });
    assert.deepEqual(d, { tipo: "derivar_humano", motivo: "rol_no_permitido" });
  });
  test("EV-25 dos intenciones altas se rutean juntas", () => {
    const d = O.decidirRuta({ ...base, reglas: [], llm: llm([["cotizar_flete", 0.92], ["estado_operacion", 0.88]]) });
    assert.equal(d.tipo, "rutear");
    if (d.tipo === "rutear") assert.deepEqual([...d.destino].sort(), ["C360-CUSTOMER", "C360-SALES"]);
  });
  test("EV-26 pago + cotizar: gana la derivación humana", () => {
    assert.deepEqual(O.decidirRuta({ ...base, reglas: ["pago", "cotizar_flete"], llm: null }), { tipo: "derivar_humano", motivo: "intencion_humana" });
  });
  test("router: confianza media desambigua, baja deriva, sin LLM deriva", () => {
    assert.equal(O.decidirRuta({ ...base, reglas: [], llm: llm([["eta_seguimiento", 0.7], ["estado_operacion", 0.65]]) }).tipo, "desambiguar");
    assert.equal(O.decidirRuta({ ...base, reglas: [], llm: llm([["eta_seguimiento", 0.3]]) }).tipo, "derivar_humano");
    assert.equal(O.decidirRuta({ ...base, reglas: [], llm: null }).tipo, "derivar_humano");
    assert.equal(O.decidirRuta({ ...base, intentosDesambiguar: U.max_intentos_desambiguar, reglas: [], llm: llm([["eta_seguimiento", 0.7]]) }).tipo, "derivar_humano");
  });
  test("incidente_reportar va a TRACK (D-cierre de ruteo)", () => assert.equal(O.RUTA_INTENCION.incidente_reportar, "C360-TRACK"));
});

describe("idempotencia", () => {
  const ok = M.EJEMPLO_CREAR_RESPONSE_OK;
  if (!("operacion_id" in ok)) throw new Error("ejemplo");
  test("EV-09 misma clave + mismo cuerpo = misma operación", () => {
    const h = M.idempotencyBodyHash(M.EJEMPLO_CREAR_REQUEST);
    const r = M.resolveIdempotency({ key: M.EJEMPLO_CREAR_REQUEST.idempotency_key, bodyHash: h, response: ok as never }, M.EJEMPLO_CREAR_REQUEST.idempotency_key, h);
    assert.equal(r.kind, "reutilizada");
    if (r.kind === "reutilizada") { assert.equal(r.response.operacion_id, ok.operacion_id); assert.equal(r.response.idempotente_reutilizada, true); }
  });
  test("EV-10 misma clave + otro destino = conflicto con el id existente", () => {
    const h1 = M.idempotencyBodyHash(M.EJEMPLO_CREAR_REQUEST);
    const otro = { ...M.EJEMPLO_CREAR_REQUEST, solicitud: { ...M.EJEMPLO_CREAR_REQUEST.solicitud, destino: { ...M.EJEMPLO_CREAR_REQUEST.solicitud.destino, direccion: "Otra 123" } } };
    const h2 = M.idempotencyBodyHash(otro);
    assert.notEqual(h1, h2);
    const r = M.resolveIdempotency({ key: otro.idempotency_key, bodyHash: h1, response: ok as never }, otro.idempotency_key, h2);
    assert.deepEqual(r, { kind: "conflicto", operacionId: ok.operacion_id });
  });
  test("sobre 2a sin idempotency_key se rechaza", () => assert.equal(O.SobreMensaje.safeParse(sobre({ nivel: "2a" })).success, false));
  test("huella del sobre ignora trace e intento", () => {
    const a = O.SobreMensaje.parse(O.EJEMPLO_SOBRE);
    const b = O.SobreMensaje.parse(sobre({ intento: 2, trace: { ...O.EJEMPLO_SOBRE.trace, span_id: "00f067aa0ba902b8" } }));
    assert.equal(O.huellaSobre(a), O.huellaSobre(b));
  });
  test.todo("EV-09 (Core) dos POST /api/ops/operaciones con la misma clave dejan 1 fila en ops_operations y 1 operacion.creada.v1 — PR-4/PR-7");
  test.todo("EV-11 (bus) operacion.creada.v1 entregado 2 veces a C360-DOC crea 1 expediente (ops_bus_consumed) — PR-2/PR-10");
});

describe("seguridad y privilegios", () => {
  test("EV-12 injection sospechosa corta antes del LLM y de cualquier herramienta", () => {
    assert.deepEqual(O.decidirRuta({ ...base, injectionSospechosa: true, reglas: ["solicitar_transporte"], llm: llm([["solicitar_transporte", 0.99]]) }), { tipo: "derivar_humano", motivo: "injection_sospechosa" });
  });
  test("EV-13 DOC solo propone validar documentos; aprobar no existe como herramienta", () => {
    assert.equal(O.HERRAMIENTAS.proponer_validacion_documento.modo, "proponer");
    assert.equal(O.autorizarHerramienta("C360-DOC", "approval.approve", null).ok, false);
    assert.ok(!O.permisosDe("C360-DOC").includes("approval.approve" as O.Permiso));
  });
  test("EV-14 CARRIER ve y responde solo ofertas propias (D-10/D-11); no asigna", () => {
    assert.equal(O.autorizarHerramienta("C360-CARRIER", "ver_ofertas_propias", null).ok, true);
    assert.equal(O.autorizarHerramienta("C360-CARRIER", "responder_oferta_propia", null).ok, true);
    assert.equal(O.autorizarHerramienta("C360-CARRIER", "proponer_asignacion", null).ok, false);
  });
  test("EV-16 ANALYST no crea operación ni abre incidentes", () => {
    assert.deepEqual(O.autorizarHerramienta("C360-ANALYST", "crear_operacion", null), { ok: false, codigo: "HERRAMIENTA_NO_PERMITIDA" });
    assert.equal(O.autorizarHerramienta("C360-ANALYST", "abrir_incidente", null).ok, false);
  });
  test("EV-17 ningún agente tiene permisos prohibidos; revisarFichas() vacío; svc-c360-*", () => {
    assert.deepEqual(O.revisarFichas(), []);
    for (const ag of O.AGENTES) {
      const p = O.permisosDe(ag);
      for (const x of O.PERMISOS_PROHIBIDOS_AGENTES) assert.ok(!(p as string[]).includes(x), `${ag} ${x}`);
      assert.ok(p.every((x) => O.techoEfectivo(ag).includes(x)), ag);
      assert.match(O.FICHAS[ag].service_id, /^svc-c360-[a-z]+$/);
      assert.equal(O.FICHAS[ag].principal, "AI_SERVICE");
      assert.notEqual(O.FICHAS[ag].subnivel_max, "3");
    }
  });
  test("D-11 MASTER no lee datos de negocio (extensión rechazada)", () => {
    assert.equal(O.autorizarHerramienta("C360-MASTER", "consultar_operacion", null).ok, false);
    assert.equal(O.autorizarHerramienta("C360-MASTER", "listar_eventos_bus", null).ok, true);
  });
  test("D-12 todo agente que usa LLM tiene ai.execute; DISPATCH (determinista) no", () => {
    for (const ag of O.AGENTES) assert.equal(O.permisosDe(ag).includes("ai.execute"), O.FICHAS[ag].usa_llm, ag);
  });
  test("herramienta desconocida", () => assert.deepEqual(O.autorizarHerramienta("C360-OPS", "DROP TABLE", null), { ok: false, codigo: "HERRAMIENTA_DESCONOCIDA" }));
  test.todo("EV-16/17 (Core) Core repite el rechazo con la identidad svc-c360-analyst y alerta (2 rechazos independientes) — PR-5");
});

describe("niveles 2b y 3", () => {
  test("EV-18 DISPATCH no confirma asignaciones: propone; confirma una persona (2b con confirmación humana previa)", () => {
    assert.equal(O.HERRAMIENTAS.proponer_asignacion.modo, "proponer");
    assert.ok(!("confirmAllocation" in O.HERRAMIENTAS) && !("confirmar_asignacion" in O.HERRAMIENTAS));
    assert.equal(M.NIVEL_ACCIONES.confirmar_asignacion.subnivel, "2b");
    assert.equal(M.decidirConfirmacionAsignacion({ actor: "bot", permiso: true, run: "propuesta", candidato_vigente: true, tarifa_modificada: false, flag_auto: false, accion: "confirmar" }).resultado, "rechazada");
  });
  test("ningún agente puede ejecutar una acción con confirmación humana previa o Nivel 3", () => {
    for (const ag of O.AGENTES) assert.notEqual(O.FICHAS[ag].subnivel_max, "3");
    for (const v of Object.values(M.NIVEL_ACCIONES)) if (v.confirmacion_humana_previa) assert.notEqual(v.ejecuta, "agente");
  });
  test("EV-19 sobre Nivel 3 sin approval_ref se rechaza", () => {
    assert.equal(O.SobreMensaje.safeParse(sobre({ nivel: "3", idempotency_key: "k".repeat(20), approval_ref: null })).success, false);
  });
  test("D-13 shipment.cancel es prohibido para agentes (siempre Approval Engine)", () => {
    assert.ok((O.PERMISOS_PROHIBIDOS_AGENTES as readonly string[]).includes("shipment.cancel"));
  });
  test.todo("EV-20 (Core) approval_ref de otra acción, otro hash o vencida ⇒ POLICY_RECHAZA y 0 mutaciones — PR-3");
});

describe("proveedores y presupuesto", () => {
  test("EV-21 backoff con full jitter y Retry-After", () => {
    assert.equal(O.esperaReintentoMs(3, 500, 10000, () => 0.5), 2000);
    assert.equal(O.esperaReintentoMs(10, 500, 10000, () => 0.99, 15000), 15000);
    assert.ok(O.esperaReintentoMs(20, 500, 10000, () => 0.999) <= 10000);
  });
  test("EV-21 circuito: abre a los 5 fallos, semiabre y cierra", () => {
    const C = O.ConfigCircuito.parse({});
    let s: O.EstadoCircuito = { estado: "cerrado", fallos: 0, abierto_desde: null };
    for (let i = 0; i < 5; i++) s = O.transicionCircuito(s, "fallo", 1000, C);
    assert.equal(s.estado, "abierto");
    s = O.transicionCircuito(s, "tick", 40000, C); assert.equal(s.estado, "semiabierto");
    s = O.transicionCircuito(s, "exito", 40001, C); assert.equal(s.estado, "cerrado");
  });
  test("D-04 política del clasificador: xAI y luego OpenAI, ambos de pago, fallback a reglas", () => {
    const p = O.PoliticaTarea.parse(O.EJEMPLO_POLITICA_ROUTER);
    assert.deepEqual(p.cadena.map((c) => c.proveedor), ["xai", "openai"]);
    assert.ok(p.cadena.every((c) => c.solo_plan_pago));
    assert.equal(p.fallback_final, "reglas");
  });
  test("EV-22 sin LLM, estado_operacion por regla llega a CUSTOMER y CUSTOMER puede pedir la ETA (D-11)", () => {
    const d = O.decidirRuta({ ...base, reglas: ["estado_operacion"], llm: null });
    assert.equal(d.tipo, "rutear");
    assert.equal(O.autorizarHerramienta("C360-CUSTOMER", "consultar_eta", null).ok, true);
  });
  test("EV-24 presupuesto: avisa al 80 %, degrada al 95 %, corta al 100 %", () => {
    const t = { agente: 100, conversacion: 100, dia: 100 }, u = { aviso_pct: 80, degradar_pct: 95 };
    assert.equal(O.evaluarPresupuesto({ agente: 85, conversacion: 10, dia: 10 }, t, u).accion, "avisar");
    assert.equal(O.evaluarPresupuesto({ agente: 10, conversacion: 96, dia: 10 }, t, u).accion, "degradar");
    assert.equal(O.evaluarPresupuesto({ agente: 1, conversacion: 101, dia: 1 }, t, u).accion, "cortar");
  });
  test.todo("EV-21 (gateway) 503 ×3 del primario ⇒ responde el secundario dentro del timeout y ai_usage guarda fallback_used — PR-1");
  test.todo("EV-23 (gateway) JSON inválido del LLM ⇒ 1 reintento ⇒ derivación; 0 crear_operacion — PR-1/PR-7");
});

describe("bus y contratos", () => {
  test("eventos versionados y ejemplos válidos", () => {
    for (const k of Object.keys(O.CATALOGO_EVENTOS)) assert.match(k, O.RE_EVENT_TYPE);
    assert.equal(O.EventoBus.safeParse(O.EJEMPLO_EVENTO).success, true);
    assert.equal(O.SobreMensaje.safeParse(O.EJEMPLO_SOBRE).success, true);
  });
  test("from = to se rechaza", () => assert.equal(O.SobreMensaje.safeParse(sobre({ to: "C360-MASTER" })).success, false));
  test("v1.1: el sobre exige meta.testData y schema_version c360-msg/1.1", () => {
    assert.equal(O.SobreMensaje.parse(O.EJEMPLO_SOBRE).meta.testData, true);
    const { meta: _m, ...sinMeta } = O.EJEMPLO_SOBRE;
    assert.equal(O.SobreMensaje.safeParse(sinMeta).success, false);
    assert.equal(O.SobreMensaje.safeParse(sobre({ schema_version: "c360-msg/1" })).success, false);
    assert.equal(O.SobreMensaje.safeParse(sobre({ meta: { testData: "si" } })).success, false);
    assert.equal(O.EventoBus.parse(O.EJEMPLO_EVENTO).test_data, true);
  });
  test("v1.1: eventos nuevos solicitud.bloqueada.v1 y operacion.entregada.v1; actualizada usa los estados v1.1", () => {
    assert.ok("solicitud.bloqueada.v1" in O.CATALOGO_EVENTOS && "operacion.entregada.v1" in O.CATALOGO_EVENTOS);
    const p = O.CATALOGO_EVENTOS["operacion.actualizada.v1"].payload;
    assert.equal(p.safeParse({ operacion_id: "360-2611-0001", antes: "en_asignacion", despues: "asignada" }).success, true);
    assert.equal(p.safeParse({ operacion_id: "360-2611-0001", antes: "abierta", despues: "planificada" }).success, false);
    assert.equal(O.CATALOGO_EVENTOS["solicitud.bloqueada.v1"].payload.safeParse({ solicitud_id: "EJEMPLO-1", motivos: ["NIVEL3_PRECIO"], nivel: "3" }).success, true);
  });
  test("TRANSICION_INVALIDA no está en los códigos de error del orquestador", () => assert.ok(!("TRANSICION_INVALIDA" in O.CODIGOS_ERROR_ORQUESTADOR)));
});
