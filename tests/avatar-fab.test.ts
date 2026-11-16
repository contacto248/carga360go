import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { avatarPublicStatus } from "../src/lib/agent/avatar";

const ROOT = path.join(__dirname, "..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("avatar: por defecto mock / apagado, sin secretos en el estado público", () => {
  const status = avatarPublicStatus({});
  assert.equal(status.mode, "mock");
  assert.equal(status.provider, "mock");
  assert.equal(status.enabled, false);
  assert.equal(status.connected, false);
  assert.match(status.state, /NO CONECTADA/);
  assert.equal(status.streamUrl, "");
  assert.equal(JSON.stringify(status).includes("API_KEY"), false);
  assert.equal(JSON.stringify(status).includes("secret"), false);
});

test("avatar: AVATAR_ENABLED=false mantiene mock aunque se pida heygen", () => {
  const status = avatarPublicStatus({
    AVATAR_ENABLED: "false",
    NEXT_PUBLIC_AVATAR_PROVIDER: "heygen",
    AVATAR_HEYGEN_API_KEY: "no-subir-esto",
  });
  assert.equal(status.enabled, false);
  assert.equal(status.mode, "mock");
  assert.equal(status.connected, false);
  assert.equal(JSON.stringify(status).includes("no-subir-esto"), false);
});

test("avatar: static con URL pública, sin claves", () => {
  const status = avatarPublicStatus({
    NEXT_PUBLIC_AVATAR_ENABLED: "true",
    NEXT_PUBLIC_AVATAR_PROVIDER: "static",
    NEXT_PUBLIC_AVATAR_STATIC_URL: "/brand/agent-mark.svg",
  });
  assert.equal(status.mode, "static");
  assert.equal(status.provider, "static");
  assert.equal(status.connected, true);
  assert.equal(status.staticUrl, "/brand/agent-mark.svg");
  assert.match(status.state, /CONECTADA/);
});

test("avatar: heygen sin clave de servidor → UI mock, estado NO CONECTADA", () => {
  const status = avatarPublicStatus({
    AVATAR_ENABLED: "true",
    NEXT_PUBLIC_AVATAR_PROVIDER: "heygen",
  });
  assert.equal(status.provider, "heygen");
  assert.equal(status.enabled, true);
  assert.equal(status.connected, false);
  assert.equal(status.mode, "mock");
  assert.match(status.state, /AVATAR_HEYGEN_API_KEY/);
});

test("avatar: did con clave pero sin stream → mock (sin filtrar la clave)", () => {
  const status = avatarPublicStatus({
    AVATAR_ENABLED: "true",
    NEXT_PUBLIC_AVATAR_PROVIDER: "did",
    AVATAR_DID_API_KEY: "clave-secreta-prueba",
  });
  assert.equal(status.provider, "did");
  assert.equal(status.enabled, true);
  assert.equal(status.connected, false);
  assert.equal(status.mode, "mock");
  assert.equal(JSON.stringify(status).includes("clave-secreta-prueba"), false);
  assert.match(status.state, /sin sesión\/stream/);
});

test("T-064 + avatar: zona dentro del panel FAB, un solo flotante Carga360", () => {
  const agent = read("src/components/VoiceAgent.tsx");
  assert.match(agent, /AgentAvatarStage/);
  assert.match(agent, /micDenied/);
  assert.match(agent, /Sin permiso de micrófono/);
  assert.match(agent, /Micrófono activo/);
  assert.match(agent, />Carga360</);
  assert.match(agent, /Carga360go/);
  assert.doesNotMatch(agent, /help-wa|btn wa fab|help-stack/);
  assert.doesNotMatch(agent, /HeyGen|D-ID|DID_API|HEYGEN_API/);

  const stage = read("src/components/AgentAvatarStage.tsx");
  assert.match(stage, /agent-avatar-stage/);
  assert.match(stage, /HumanFaceSvg|agent-human-face/);
  assert.match(stage, /Escuchando|Hablando|micrófono/i);
  assert.match(stage, /Carga360go/);

  const lib = read("src/lib/agent/avatar.ts");
  assert.match(lib, /NEXT_PUBLIC_AVATAR_PROVIDER/);
  assert.match(lib, /AVATAR_ENABLED/);
  assert.match(lib, /AVATAR_HEYGEN_API_KEY/);
  assert.match(lib, /AVATAR_DID_API_KEY/);
  assert.doesNotMatch(lib, /sk-|eyJ|api_key\s*=\s*['\"][^'\"]+['\"]/i);

  const css = read("src/app/globals.css");
  assert.match(css, /\.agent-avatar-stage/);
  assert.match(css, /\.agent-mic\.is-denied/);
  assert.match(css, /\.agent-mic-denied/);
  assert.match(css, /agent-mouth|lipsync/);

  const route = read("src/app/api/agente/route.ts");
  assert.match(route, /avatarPublicStatus/);
  assert.match(route, /avatar:/);

  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /VoiceAgentLauncher/);
});
