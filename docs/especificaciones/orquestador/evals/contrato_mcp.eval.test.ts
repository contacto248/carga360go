/**
 * Evals del contrato MCP y de la validación (VALIDACION_DATOS.md §8 y §12). Los casos del motor (EJEMPLO 1 a 24 de §8)
 * quedan como test.todo: el motor validateSolicitud no existe todavía (PR-6).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as M from "../mcp_tools_contrato";

/** Espejo de src/lib/ops/operacion.ts @ 89cb8a5 (createSchema). Si Core cambia, este test debe fallar y se revisa D-14. */
const CORE = { MAX_PESO_KG: 80_000, MAX_CORRELATIVO: 9999, RE_KEY: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/, KEY_MIN: 8, KEY_MAX: 128 };

describe("contrato MCP", () => {
  test("v1.1: 63 reglas de §3.2 + OPCIONAL_AUSENTE + 15 del playbook = 79 códigos, sin duplicados", () => {
    assert.equal(M.CODIGOS_REGLA.length, 79);
    assert.equal(new Set(M.CODIGOS_REGLA).size, 79);
    assert.equal(M.CODIGOS_PLAYBOOK_V11.length, 15);
    assert.equal(M.CODIGOS_PLAYBOOK_V11[0], "FALTA_DIRECCION_RETIRO");
    assert.equal(M.VERSION_REGLAS, "val-v1.1");
  });
  test("ejemplos del contrato pasan su schema", () => {
    assert.equal(M.ValidarSolicitudInput.safeParse(M.EJEMPLO_VALIDAR_REQUEST).success, true);
    assert.equal(M.ValidarSolicitudOutput.safeParse(M.EJEMPLO_VALIDAR_RESPONSE).success, true);
    assert.equal(M.CrearOperacionInput.safeParse(M.EJEMPLO_CREAR_REQUEST).success, true);
    for (const r of [M.EJEMPLO_CREAR_RESPONSE_OK, M.EJEMPLO_CREAR_RESPONSE_CONFLICTO, M.EJEMPLO_CREAR_RESPONSE_APROBACION]) assert.equal(M.CrearOperacionOutput.safeParse(r).success, true);
    assert.equal(M.RegistroAuditoria.safeParse(M.EJEMPLO_AUDITORIA).success, true);
  });
  test("D-14 YYMM en America/Santiago (igual que #58)", () => {
    assert.equal(M.yymmChile(new Date("2026-12-01T02:30:00Z")), "2611");
    assert.equal(M.yymmChile(new Date("2026-12-01T03:30:00Z")), "2612");
  });
  test("D-14 v1.1 (PLAYBOOK §4): 4 dígitos y sobre 9999 crece a 5 — CP-122 y CP-125", () => {
    assert.equal(M.formatOperacionId("2611", 1), "360-2611-0001");
    assert.equal(M.formatOperacionId("2611", 9999), "360-2611-9999");
    assert.equal(M.formatOperacionId("2611", 10000), "360-2611-10000");
    const fmt = ["360-2611-0001", "C360-AB12CD", "360-0001", "360-2611-10000"].map((x) => M.RE_OPERACION_ID.test(x));
    assert.deepEqual(fmt, [true, false, false, true]);
    // Core hoy topa en 9999 (CORE.MAX_CORRELATIVO): el PR ops-operacion-estados lo sube a 99999. Este assert documenta la brecha.
    assert.ok(CORE.MAX_CORRELATIVO < 10000);
  });
  test("CP-121 cambio de mes en hora de Chile", () => {
    assert.deepEqual(["2026-11-30T12:00:00Z", "2026-12-01T02:30:00Z", "2026-12-01T03:30:00Z"].map((x) => M.yymmChile(new Date(x))), ["2611", "2611", "2612"]);
  });
  test("D-14 adaptador produce un cuerpo que Core acepta", () => {
    const c = M.aCuerpoCoreOperacion(M.EJEMPLO_CREAR_REQUEST.solicitud, M.EJEMPLO_CREAR_REQUEST.idempotency_key, "Comercial EJEMPLO SpA");
    assert.ok(c.cliente.length >= 2 && c.cliente.length <= 160);
    assert.ok(c.origen.length >= 2 && c.origen.length <= 120 && c.destino.length >= 2 && c.destino.length <= 120);
    assert.notEqual(c.origen.localeCompare(c.destino, "es-CL", { sensitivity: "base" }), 0);
    assert.ok(c.tipoCarga.length >= 2 && c.tipoCarga.length <= 80);
    assert.ok(c.pesoKg > 0 && c.pesoKg <= CORE.MAX_PESO_KG);
    assert.match(c.idempotencyKey, CORE.RE_KEY);
    assert.ok(c.idempotencyKey.length >= CORE.KEY_MIN && c.idempotencyKey.length <= CORE.KEY_MAX);
  });
  test("D-17 reparto en la misma comuna con direcciones distintas no choca con Core", () => {
    const s = M.EJEMPLO_CREAR_REQUEST.solicitud;
    const misma = { ...s, destino: { ...s.origen, direccion: "San Diego 500" } };
    const c = M.aCuerpoCoreOperacion(misma, M.EJEMPLO_CREAR_REQUEST.idempotency_key, "Comercial EJEMPLO SpA");
    assert.notEqual(c.origen.localeCompare(c.destino, "es-CL", { sensitivity: "base" }), 0);
  });
  test("descriptores MCP: validar es solo lectura; crear es idempotente y no destructiva", () => {
    const v = M.MCP_TOOLS.find((t) => t.name === "validar_solicitud");
    const c = M.MCP_TOOLS.find((t) => t.name === "crear_operacion");
    assert.ok(v && c);
    assert.equal(v.annotations.readOnlyHint, true);
    assert.equal(c.annotations.readOnlyHint, false);
    assert.equal(c.annotations.idempotentHint, true);
    assert.equal(c.annotations.destructiveHint, false);
  });
  for (let i = 1; i <= 24; i++) test.todo(`VAL-EJ-${String(i).padStart(2, "0")} motor validateSolicitud con el EJEMPLO ${i} de VALIDACION_DATOS.md §8 — PR-6`);
});

describe("v1.1 · schema y marca de prueba (PLAYBOOK §2.1)", () => {
  const base = M.EJEMPLO_VALIDAR_REQUEST.solicitud;
  test("schema 1.1.0 con meta.testData es válido; 1.0.0 sin testData sigue aceptado", () => {
    assert.equal(M.VERSION_SCHEMA_SOLICITUD, "1.1.0");
    assert.equal(M.SolicitudV1.safeParse(base).success, true);
    const { testData, ...meta10 } = base.meta;
    void testData;
    assert.equal(M.SolicitudV1.safeParse({ ...base, meta: { ...meta10, schemaVersion: "1.0.0" } }).success, true);
  });
  test("testData con schema 1.0.0 se rechaza", () => {
    assert.equal(M.SolicitudV1.safeParse({ ...base, meta: { ...base.meta, schemaVersion: "1.0.0" } }).success, false);
  });
  test("la solicitud normalizada exige testData", () => {
    const { testData, ...sinMarca } = M.EJEMPLO_CREAR_REQUEST.solicitud;
    void testData;
    assert.equal(M.SolicitudNormalizada.safeParse(sinMarca).success, false);
  });
  test("esSolicitudDePrueba: llave EJEMPLO- + notes EJEMPLO + testData ≠ false", () => {
    assert.equal(M.esSolicitudDePrueba({ idempotencyKey: "EJEMPLO-CP-001-20261117", testData: true }, "EJEMPLO · x"), true);
    assert.equal(M.esSolicitudDePrueba({ idempotencyKey: "EJEMPLO-CP-001-20261117" }, "EJEMPLO"), true);
    assert.equal(M.esSolicitudDePrueba({ idempotencyKey: "wa-3f9c2a7e-20261117-0001", testData: true }, "EJEMPLO"), false);
    assert.equal(M.esSolicitudDePrueba({ idempotencyKey: "EJEMPLO-CP-001-20261117", testData: true }, null), false);
    assert.equal(M.esSolicitudDePrueba({ idempotencyKey: "EJEMPLO-CP-001-20261117", testData: false }, "EJEMPLO"), false);
  });
});

describe("v1.1 · estados VALIDA / INCOMPLETA / BLOQUEADA (PLAYBOOK §3.1)", () => {
  test("derivación determinista", () => {
    assert.equal(M.derivarEstadoValidacion([{ codigo: "OPCIONAL_AUSENTE", severidad: "AVISA" }]), "VALIDA");
    assert.equal(M.derivarEstadoValidacion([{ codigo: "FALTA_ORIGEN", severidad: "BLOQUEA" }]), "INCOMPLETA");
    assert.equal(M.derivarEstadoValidacion([{ codigo: "NIVEL3_PRECIO", severidad: "BLOQUEA" }]), "BLOQUEADA");
    assert.equal(M.derivarEstadoValidacion([{ codigo: "FALTA_ORIGEN", severidad: "BLOQUEA" }, { codigo: "DATOS_REALES_NO_AUTORIZADOS", severidad: "BLOQUEA" }]), "BLOQUEADA");
    assert.equal(M.derivarEstadoValidacion([], true), "BLOQUEADA");
  });
});

/** Casos de transición de CASOS_PRUEBA_DISPATCH.md (CP-100 a CP-115), copiados tal cual. */
const CP_TRANSICIONES: [string, M.Maquina, string, string, boolean][] = [
  ["CP-100", "solicitud", "recibida", "estructurada", true], ["CP-101", "solicitud", "recibida", "validada", false],
  ["CP-102", "solicitud", "incompleta", "convertida", false], ["CP-103", "solicitud", "bloqueada", "validada", false],
  ["CP-104", "solicitud", "bloqueada", "estructurada", true], ["CP-105", "operacion", "abierta", "asignada", false],
  ["CP-106", "operacion", "en_asignacion", "en_curso", false], ["CP-107", "operacion", "en_asignacion", "asignada", true],
  ["CP-108", "operacion", "cerrada", "abierta", false], ["CP-109", "operacion", "cancelada", "abierta", false],
  ["CP-110", "operacion", "en_curso", "cerrada", false], ["CP-111", "viaje", "entregado", "en_transito", false],
  ["CP-112", "viaje", "asignado", "entregado", false], ["CP-113", "viaje", "incidencia", "entregado", true],
  ["CP-114", "viaje", "retirado", "en_transito", true], ["CP-115", "operacion", "entregada", "cerrada", true],
];

describe("v1.1 · máquina de estados (PLAYBOOK §6)", () => {
  test("estados nuevos: bloqueada, en_asignacion, asignada, entregada", () => {
    assert.ok(M.ESTADOS_SOLICITUD.includes("bloqueada"));
    for (const e of ["en_asignacion", "asignada", "entregada"] as const) assert.ok(M.ESTADOS_OPERACION.includes(e), e);
    assert.equal(M.EstadoOperacion.safeParse("planificada").success, false);
  });
  for (const [id, maq, de, a, ok] of CP_TRANSICIONES) test(`${id} ${maq}: ${de} → ${a} = ${ok ? "válida" : "rechazada"}`, () => assert.equal(M.transicionPermitida(maq, de, a), ok));
  test("camino feliz completo de la operación", () => {
    const c = ["abierta", "en_asignacion", "asignada", "en_curso", "entregada", "cerrada"];
    for (let i = 1; i < c.length; i++) assert.ok(M.transicionPermitida("operacion", c[i - 1]!, c[i]!), `${c[i - 1]} → ${c[i]}`);
  });
  test("cerrada, cancelada, convertida, descartada y entregado (viaje) son terminales", () => {
    assert.equal(M.TRANSICIONES_OPERACION.cerrada.length + M.TRANSICIONES_OPERACION.cancelada.length, 0);
    assert.equal(M.TRANSICIONES_SOLICITUD.convertida.length + M.TRANSICIONES_SOLICITUD.descartada.length + M.TRANSICIONES_VIAJE.entregado.length, 0);
  });
  test("entregada no se cancela; asignada y en_curso sí (2b)", () => {
    assert.equal(M.transicionPermitida("operacion", "entregada", "cancelada"), false);
    assert.ok(M.transicionPermitida("operacion", "asignada", "cancelada") && M.transicionPermitida("operacion", "en_curso", "cancelada"));
    assert.equal(M.NIVEL_ACCIONES.cancelar_operacion_asignada.subnivel, "2b");
  });
  test("estado desconocido se rechaza", () => assert.equal(M.transicionPermitida("operacion", "planificada", "abierta"), false));
  test("TRANSICION_INVALIDA es solo de pruebas: fuera de todos los enums de producción", () => {
    assert.deepEqual([...M.CODIGOS_SOLO_PRUEBA], ["TRANSICION_INVALIDA"]);
    assert.ok(!(M.CODIGOS_REGLA as readonly string[]).includes("TRANSICION_INVALIDA"));
    assert.ok(!(M.CODIGOS_ERROR_HERRAMIENTA as readonly string[]).includes("TRANSICION_INVALIDA"));
    assert.equal(M.CodigoErrorHerramienta.safeParse("TRANSICION_INVALIDA").success, false);
  });
});

/** CP-130 a CP-138 de CASOS_PRUEBA_DISPATCH.md. */
describe("v1.1 · niveles 2b y 3 (PLAYBOOK §7.4, §8, P-04)", () => {
  test("confirmar asignación = 2b con confirmación humana previa; cambiar precio = 3 con aprobación", () => {
    const c = M.NIVEL_ACCIONES.confirmar_asignacion, p = M.NIVEL_ACCIONES.cambiar_precio_o_tarifa;
    assert.deepEqual([c.subnivel, c.confirmacion_humana_previa, c.aprobacion_previa, c.ejecuta, c.permiso_persona], ["2b", true, false, "persona", "asignacion.ejecutar"]);
    assert.deepEqual([p.subnivel, p.aprobacion_previa, p.ejecuta], ["3", true, "persona"]);
    for (const k of ["confirmar_con_tarifa_modificada", "cobro_pago_reembolso", "borrar_datos", "encender_flag"] as const) assert.equal(M.NIVEL_ACCIONES[k].subnivel, "3", k);
    for (const [k, v] of Object.entries(M.NIVEL_ACCIONES)) if (v.subnivel === "3" || v.confirmacion_humana_previa) assert.equal(v.ejecuta, "persona", k);
  });
  const b = { actor: "persona" as const, permiso: true, run: "propuesta" as const, candidato_vigente: true, tarifa_modificada: false, flag_auto: false, accion: "confirmar" as const };
  const casos: [string, Partial<Parameters<typeof M.decidirConfirmacionAsignacion>[0]>, string, string[], string][] = [
    ["CP-130", {}, "confirmada", [], "2b"],
    ["CP-131", { actor: "bot" }, "rechazada", ["POLICY_RECHAZA"], "2b"],
    ["CP-132", { permiso: false }, "rechazada", ["SIN_PERMISO"], "2b"],
    ["CP-133", { candidato_vigente: false }, "rechazada", ["POLICY_RECHAZA"], "2b"],
    ["CP-134", { tarifa_modificada: true }, "frenada", ["REQUIERE_APROBACION"], "3"],
    ["CP-135", { run: "agotada", candidato_vigente: false }, "escalada", [], "2b"],
    ["CP-136", { actor: "sistema", permiso: false, accion: "autoconfirmar" }, "rechazada", ["POLICY_RECHAZA"], "2b"],
    ["CP-137", { actor: "bot", permiso: false, accion: "encender_flag_auto" }, "frenada", ["REQUIERE_APROBACION"], "3"],
    ["CP-138", { actor: "sistema", permiso: false, flag_auto: true, accion: "autoconfirmar" }, "rechazada", ["POLICY_RECHAZA"], "2b"],
  ];
  for (const [id, over, res, cod, niv] of casos) test(`${id} → ${res} (${niv})`, () => {
    const r = M.decidirConfirmacionAsignacion({ ...b, ...over });
    assert.deepEqual([r.resultado, r.codigos, r.nivel], [res, cod, niv]);
  });
});
