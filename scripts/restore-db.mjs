import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ SUPABASE_DATABASE_URL manquante");
  process.exit(1);
}

const psqlPath = "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const backupsDir = path.join(process.cwd(), "backups");

if (!fs.existsSync(backupsDir)) {
  console.error("❌ Dossier backups introuvable");
  process.exit(1);
}

const files = fs
  .readdirSync(backupsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .reverse();

if (files.length === 0) {
  console.error("❌ Aucun backup .sql trouvé");
  process.exit(1);
}

console.log("\nBackups disponibles :\n");

files.forEach((file, index) => {
  console.log(`${index + 1}. ${file}`);
});

const rl = readline.createInterface({ input, output });

const choice = await rl.question("\nNuméro du backup à restaurer : ");
const index = Number(choice) - 1;

if (Number.isNaN(index) || index < 0 || index >= files.length) {
  console.error("❌ Choix invalide");
  rl.close();
  process.exit(1);
}

const selectedFile = path.join(backupsDir, files[index]);

console.log(`\n⚠️ Tu vas restaurer : ${files[index]}`);
console.log("⚠️ Cette opération peut écraser la base actuelle.");

const confirm = await rl.question(
  '\nTape exactement "RESTORE" pour confirmer : '
);

rl.close();

if (confirm !== "RESTORE") {
  console.log("❌ Restauration annulée");
  process.exit(0);
}

console.log("\n♻️ Restauration en cours...");

try {
  execFileSync(psqlPath, [DATABASE_URL, "-f", selectedFile], {
    stdio: "inherit",
  });

  console.log("\n✅ Restauration terminée");
} catch {
  console.error("\n❌ Erreur pendant la restauration");
  process.exit(1);
}