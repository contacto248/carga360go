import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/mcp/route";
import { createLoad } from "../src/lib/listings";
import { acceptOffer, submitOffer } from "../src/lib/offers";
import { addDays, makeAdmin, person } from "./helpers-agente";

const MCP = "mcp-token-de-prueba-0123456789abcdef";

async function detalle(id: string, session?: string) {
  process.env.MCP_TOKEN = MCP;
  const headers: Record<string, string> = { authorization: `Bearer ${MCP}`, "content-type": "application/json" };
  if (session) headers["x-c360-session"] = session;
  const response = await POST(
    new Request("http://127.0.0.1:4317/api/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "detalle_carga", arguments: { id } } }),
    }),
  );
  const data = (await response.json()) as { result?: { content: { text: string }[] } };
  return JSON.parse(data.result!.content[0].text) as Record<string, unknown>;
}

test("MCP detalle_carga: solo dueña, transportista adjudicado o administrador", async () => {
  const owner = person("mandante", "mcp-dueno");
  const carrier = person("transportista", "mcp-chofer");
  const other = person("transportista", "mcp-ajeno");
  const otherOwner = person("mandante", "mcp-otra");
  const adminP = makeAdmin(person("mandante", "mcp-admin").user);
  const load = createLoad(owner.user, {
    origin: "La Serena",
    destination: "Santiago",
    pickupDate: addDays(3),
    equipment: "rampla_plana",
    description: "Pallets",
    weightT: 10,
    specs: {},
  });
  const offer = await submitOffer(carrier.user, load.id, { priceClp: 900000, pickupDate: addDays(3) }, { notify: false });
  await acceptOffer(owner.user, offer.offer.id, { notify: false });

  // Antes: con solo el MCP_TOKEN se veía cualquier carga. Ahora no.
  const anonymous = await detalle(load.id);
  assert.match(String(anonymous.error), /sin autorización/);
  assert.equal("load" in anonymous, false);
  assert.match(String((await detalle(load.id, other.token)).error), /sin autorización/);
  assert.match(String((await detalle(load.id, otherOwner.token)).error), /sin autorización/);
  assert.match(String((await detalle(load.id, "token-invalido-0123456789abcdef")).error), /sin autorización/);
  // Respuesta idéntica para una carga que no existe (no permite adivinar ids).
  assert.deepEqual(await detalle("no-existe", owner.token), anonymous);

  for (const allowed of [owner.token, carrier.token, adminP.token]) {
    const ok = await detalle(load.id, allowed);
    assert.equal((ok.load as { id: string }).id, load.id);
  }
});

test("MCP sin MCP_TOKEN válido sigue respondiendo 401", async () => {
  process.env.MCP_TOKEN = MCP;
  const response = await POST(
    new Request("http://127.0.0.1:4317/api/mcp", { method: "POST", headers: { authorization: "Bearer otro-token-0123456789abcdef" }, body: "{}" }),
  );
  assert.equal(response.status, 401);
});
