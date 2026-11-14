import { countAiAttempts, reserveAiCall } from "../src/lib/assistant/usage";

const mode = process.argv[2];
if (mode === "contar") process.stdout.write(String(countAiAttempts()));
else {
  const result = reserveAiCall();
  process.stdout.write("id" in result ? "reserved" : result.reason);
}
