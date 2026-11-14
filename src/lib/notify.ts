import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { mailOutboxDir } from "./mail";

/**
 * Canales de entrega para verificaciones. Cada canal se activa solo con variables de entorno:
 *  - Correo:   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *  - WhatsApp entrante (gratis, preferido): WHATSAPP_OTP_INBOUND_ENABLED=true
 *    La persona envía el código al +56 9 5842 8693 por un enlace wa.me. No se manda ningún mensaje de salida.
 *    Las plantillas de autenticación de Meta Cloud API NO son gratis: en Chile, según la tarjeta oficial de
 *    Meta vigente desde el 1-oct-2026, cuestan CLP 17,6584 por mensaje entregado (categoría Authentication).
 *    Un reply de servicio también cuesta CLP 17,6584, por eso este flujo no responde por WhatsApp.
 *  - WhatsApp plantilla (de pago, opcional): WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_OTP_TEMPLATE
 *  - SMS:      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM
 * Si un canal no está configurado no se simula el envío: se registra en el log del servidor y se informa "no_configurado".
 */
export type Delivery = "smtp" | "whatsapp" | "whatsapp_inbound" | "sms" | "no_configurado" | "error";

export function emailChannelReady(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function whatsappChannelReady(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_OTP_TEMPLATE);
}

/** Flujo inverso: la persona escribe al WhatsApp de Carga360go. Apagado por defecto. */
export function whatsappOtpInboundEnabled(): boolean {
  return process.env.WHATSAPP_OTP_INBOUND_ENABLED === "true";
}

export function smsChannelReady(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_SMS_FROM);
}

export function phoneChannelReady(): boolean {
  return whatsappOtpInboundEnabled() || whatsappChannelReady() || smsChannelReady();
}

export function channelStatus() {
  return {
    email: emailChannelReady(),
    whatsapp: whatsappChannelReady(),
    whatsappInbound: whatsappOtpInboundEnabled(),
    sms: smsChannelReady(),
    phone: phoneChannelReady(),
  };
}

export type MailAttachment = { filename: string; content: Buffer; contentType: string };
export type SendEmailOptions = { html?: string };

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  attachments: MailAttachment[] = [],
  options: SendEmailOptions = {},
): Promise<Delivery> {
  const html = options.html;
  if (!emailChannelReady()) {
    try {
      const dir = mailOutboxDir();
      fs.mkdirSync(dir, { recursive: true });
      const base = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const file = path.join(dir, `${base}.txt`);
      const listed = attachments.map((item) => `Adjunto: ${item.filename} (${item.content.length} bytes)\n`).join("");
      fs.writeFileSync(file, `To: ${to}\nSubject: ${subject}\n${listed}\n${text}\n`, { mode: 0o600 });
      if (html) fs.writeFileSync(path.join(dir, `${base}.html`), html, { mode: 0o600 });
      attachments.forEach((item, index) => {
        fs.writeFileSync(path.join(dir, `${base}-${index}-${path.basename(item.filename)}`), item.content, { mode: 0o600 });
      });
      console.log(`[carga360go] SMTP no configurado. Correo "${subject}" para ${to} guardado en ${file}`);
    } catch (error) {
      console.error("[carga360go] No se pudo guardar el correo en outbox", error);
    }
    return "no_configurado";
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@carga360go.cl",
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(attachments.length ? { attachments: attachments.map((item) => ({ ...item })) } : {}),
    });
    return "smtp";
  } catch (error) {
    console.error(`[carga360go] Error SMTP enviando "${subject}" a ${to}`, error);
    return "error";
  }
}

async function sendWhatsappOtp(phoneDigits: string, code: string): Promise<boolean> {
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  const components: unknown[] = [{ type: "body", parameters: [{ type: "text", text: code }] }];
  if (process.env.WHATSAPP_OTP_BUTTON !== "false") {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] });
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phoneDigits,
      type: "template",
      template: {
        name: process.env.WHATSAPP_OTP_TEMPLATE,
        language: { code: process.env.WHATSAPP_OTP_LANG || "es" },
        components,
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error(`[carga360go] WhatsApp OTP falló (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return false;
  }
  return true;
}

async function sendTwilioSms(phoneDigits: string, text: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN || ""}`).toString("base64");
  const body = new URLSearchParams({ To: `+${phoneDigits}`, From: process.env.TWILIO_SMS_FROM || "", Body: text });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error(`[carga360go] SMS Twilio falló (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return false;
  }
  return true;
}

/** Envía un código OTP al celular. Nunca devuelve el código al cliente. */
export async function sendPhoneOtp(phoneDigits: string, code: string): Promise<Delivery> {
  try {
    if (whatsappChannelReady()) {
      if (await sendWhatsappOtp(phoneDigits, code)) return "whatsapp";
    }
    if (smsChannelReady()) {
      if (await sendTwilioSms(phoneDigits, `Tu código de verificación Carga360go es ${code}. Vence en 10 minutos.`)) return "sms";
    }
  } catch (error) {
    console.error("[carga360go] Error enviando OTP", error);
    return "error";
  }
  if (!phoneChannelReady()) {
    console.log(`[carga360go] Canal WhatsApp/SMS no configurado. OTP para +${phoneDigits}: ${code} (vence en 10 min)`);
    return "no_configurado";
  }
  return "error";
}
