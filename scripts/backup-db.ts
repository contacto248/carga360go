import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

async function main() {
  const sourcePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "carga360go.sqlite");
  const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), "data", "backups");
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);

  if (!fs.existsSync(sourcePath)) {
    console.error(`No existe la base: ${sourcePath}`);
    process.exit(1);
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(backupDir, `carga360go-${stamp}.sqlite`);
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  await source.backup(destination);
  source.close();

  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(backupDir)) {
    if (!name.endsWith(".sqlite")) continue;
    const full = path.join(backupDir, name);
    if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full);
  }

  console.log(`Respaldo listo: ${destination}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "No se pudo respaldar la base";
  console.error(message);
  process.exit(1);
});
