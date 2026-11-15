import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { BRAND } from "../src/lib/catalog";

const ROOT = path.join(import.meta.dirname, "..");
const CHANNEL = "https://whatsapp.com/channel/0029Vb8rA9T6xCSJPzzp1z2k";

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("el canal de WhatsApp está en BRAND, en la portada y en el pie, con target _blank y rel noopener", () => {
  assert.equal(BRAND.whatsappChannel, CHANNEL);
  const block = read("src/components/WhatsAppChannel.tsx");
  assert.match(block, /Sigue nuestro canal de WhatsApp/);
  assert.match(block, /BRAND\.whatsappChannel/);
  assert.match(block, /target="_blank"/);
  assert.match(block, /rel="noopener noreferrer"/);
  const home = read("src/app/page.tsx");
  assert.doesNotMatch(home, /WhatsAppChannel/);
  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /BRAND\.whatsappChannel/);
  assert.match(footer, /Canal de WhatsApp/);
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noopener/);
});
