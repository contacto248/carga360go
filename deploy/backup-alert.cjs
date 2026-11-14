#!/usr/bin/env node
// Alerta por correo cuando falla el respaldo. Uso: carga360go-backup-alert "mensaje"
// Lee la configuración SMTP de /opt/carga360go/.env y envía a contacto@carga360go.cl (o BACKUP_ALERT_TO).
const fs = require("fs");
const os = require("os");
const APP = process.env.APP_DIR || "/opt/carga360go";
const env = {};
for (const line of fs.readFileSync(`${APP}/.env`, "utf8").split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
const nodemailer = require(`${APP}/node_modules/nodemailer`);
const to = process.env.BACKUP_ALERT_TO || "contacto@carga360go.cl";
const message = process.argv.slice(2).join(" ") || "Falló el respaldo (sin detalle).";
let tail = "";
try {
  tail = fs.readFileSync("/var/log/carga360go-backup.log", "utf8").split("\n").slice(-15).join("\n");
} catch {}
const when = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
const text = [
  "Hola,",
  "",
  `El respaldo de Carga360go falló el ${when} (hora de Chile) en el servidor ${os.hostname()}.`,
  "",
  `Detalle: ${message}`,
  "",
  "Últimas líneas del registro (/var/log/carga360go-backup.log):",
  tail,
  "",
  "Revisa el servidor o vuelve a ejecutar: sudo /usr/local/sbin/carga360go-backup",
].join("\n");
if (!env.SMTP_HOST) {
  console.error("SMTP no configurado; no se envió la alerta.");
  process.exit(1);
}
nodemailer
  .createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || "" } : undefined,
  })
  .sendMail({ from: env.SMTP_FROM || "noreply@carga360go.cl", to, subject: "[Carga360go] ALERTA: falló el respaldo", text })
  .then(() => console.log(`Alerta enviada a ${to}`))
  .catch((error) => {
    console.error(`No se pudo enviar la alerta: ${error.message}`);
    process.exit(1);
  });
