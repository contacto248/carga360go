import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { upsertAdmin } from "../src/lib/auth";
import { AppError } from "../src/lib/errors";

async function ask(question: string, fallback?: string): Promise<string> {
  if (fallback) return fallback;
  if (!stdin.isTTY) {
    throw new Error(`Falta ${question.trim()} y no hay terminal. Pásalo por variable de entorno.`);
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function askPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!stdin.isTTY) {
    throw new Error("Define ADMIN_PASSWORD. No hay terminal para preguntarla y la contraseña no va en el código.");
  }
  stdout.write("Contraseña (no se muestra): ");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  const password = await new Promise<string>((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: string) => {
      if (chunk === "\n" || chunk === "\r" || chunk === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(buffer);
        return;
      }
      if (chunk === "\u0003") {
        reject(new Error("Cancelado"));
        return;
      }
      if (chunk === "\u007f" || chunk === "\b") {
        buffer = buffer.slice(0, -1);
        return;
      }
      buffer += chunk;
    };
    stdin.on("data", onData);
  });
  return password;
}

async function main() {
  const email = await ask("Correo del administrador: ", process.env.ADMIN_EMAIL);
  const password = await askPassword();
  const rut = await ask("RUT: ", process.env.ADMIN_RUT);
  const razonSocial = await ask("Razón social [Carga360go]: ", process.env.ADMIN_NAME || (stdin.isTTY ? undefined : "Carga360go"));
  const contactName = await ask("Nombre de contacto [Administrador]: ", process.env.ADMIN_CONTACT || (stdin.isTTY ? undefined : "Administrador"));
  const whatsapp = await ask("WhatsApp [+56 9 5842 8693]: ", process.env.ADMIN_WHATSAPP || (stdin.isTTY ? undefined : "+56 9 5842 8693"));
  const city = await ask("Ciudad base [Antofagasta]: ", process.env.ADMIN_CITY || (stdin.isTTY ? undefined : "Antofagasta"));
  const user = upsertAdmin({
    email,
    password,
    rut,
    razonSocial: razonSocial || "Carga360go",
    contactName: contactName || "Administrador",
    whatsapp: whatsapp || "+56 9 5842 8693",
    city: city || "Antofagasta",
  });
  console.log(`Administrador listo: ${user.email} (${user.id}). La contraseña no se imprime.`);
}

main().catch((error: unknown) => {
  const message = error instanceof AppError || error instanceof Error ? error.message : "Error desconocido";
  console.error(message);
  process.exit(1);
});
