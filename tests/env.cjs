const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c360-"));
process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.MAIL_OUTBOX = path.join(dir, "mail");
process.env.APP_URL = "http://127.0.0.1:4317";
process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";
delete process.env.SMTP_HOST;
process.env.MAX_UPLOAD_BYTES = String(10 * 1024 * 1024);
process.env.WEB_CHAT_ENABLED = "false";
process.env.WA_BOT_ENABLED = "false";
process.env.KYC_FEATURE_ENABLED = "false";
process.env.PAYMENTS_FEATURE_ENABLED = "false";
