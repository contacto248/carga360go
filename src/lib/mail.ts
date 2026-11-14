import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

export function mailOutboxDir(): string {
  return process.env.MAIL_OUTBOX || path.join(process.cwd(), "data", "mail-outbox");
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://127.0.0.1:4317").replace(/\/$/, "");
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<"stub" | "smtp"> {
  const subject = "Restablecer contraseña — Carga360go";
  const text = [
    "Hola,",
    "",
    "Recibimos una solicitud para restablecer la contraseña de tu cuenta en Carga360go.",
    "",
    "Abre este enlace dentro de la próxima hora:",
    link,
    "",
    "Si no fuiste tú, ignora este mensaje. Tu contraseña no cambia hasta que uses el enlace.",
    "",
    "Carga360go",
  ].join("\n");

  if (!process.env.SMTP_HOST) {
    const dir = mailOutboxDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
    fs.writeFileSync(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`, { mode: 0o600 });
    console.log(`[carga360go] SMTP no configurado. Enlace de restablecimiento para ${to} guardado en ${file}`);
    return "stub";
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "noreply@carga360go.cl",
    to,
    subject,
    text,
  });
  return "smtp";
}
