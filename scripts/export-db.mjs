import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ SUPABASE_DATABASE_URL manquante");
  process.exit(1);
}

const pgDumpPath = "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe";

const backupsDir = path.join(process.cwd(), "backups");
fs.mkdirSync(backupsDir, { recursive: true });

const logFile = path.join(backupsDir, "backup-log.txt");

function log(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

const now = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(backupsDir, `backup-${now}.sql`);

console.log("📦 Export complet de la base...");
log("START backup");

try {
  execFileSync(
    pgDumpPath,
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      DATABASE_URL,
      "-f",
      outputFile,
    ],
    { stdio: "inherit" }
  );

  console.log(`✅ Backup créé : ${outputFile}`);
  log(`SUCCESS - ${outputFile}`);
} catch {
  console.error("❌ Erreur pendant pg_dump");
  log("ERROR - backup failed");
  process.exit(1);
}
