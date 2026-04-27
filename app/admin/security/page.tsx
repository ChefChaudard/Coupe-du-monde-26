import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SecurityAdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-5xl p-8 space-y-8">
      <Link href="/" className="text-blue-600 hover:underline">
        ← Retour accueil
      </Link>

      <h1 className="text-4xl font-bold">Administration sécurité</h1>

      <section className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-3">
        <h2 className="text-2xl font-bold text-green-900">
          État du système de sauvegarde
        </h2>

        <p className="text-green-900">
          Les sauvegardes complètes de la base sont réalisées depuis le PC local
          avec PostgreSQL 17 et la commande npm.
        </p>

        <div className="rounded bg-white p-4 font-mono text-sm text-green-950">
          npm run backup:db
        </div>

        <p className="text-sm text-green-800">
          Les fichiers sont stockés localement dans le dossier{" "}
          <strong>backups/</strong>.
        </p>
      </section>

      <section className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-4">
        <h2 className="text-2xl font-bold text-red-900">
          Pense-bête restauration depuis le PC
        </h2>

        <p className="text-red-900">
          La restauration ne se lance pas depuis le site en production. Elle doit
          être faite depuis le PC où PostgreSQL 17 est installé.
        </p>

        <ol className="list-decimal space-y-4 pl-6 text-red-950">
          <li>
            Ouvrir PowerShell.
          </li>

          <li>
            Se placer dans le dossier du projet :
            <pre className="mt-2 rounded bg-white p-3 text-sm overflow-x-auto">
{`cd C:\\Users\\FabriceBeral\\prono-site\\Projets\\pronos-cdm-clean`}
            </pre>
          </li>

          <li>
            Lancer la commande de restauration :
            <pre className="mt-2 rounded bg-white p-3 text-sm overflow-x-auto">
{`npm run restore:db`}
            </pre>
          </li>

          <li>
            Choisir le numéro du backup à restaurer.
            <pre className="mt-2 rounded bg-white p-3 text-sm overflow-x-auto">
{`1`}
            </pre>
          </li>

          <li>
            Confirmer en tapant exactement :
            <pre className="mt-2 rounded bg-white p-3 text-sm overflow-x-auto">
{`RESTORE`}
            </pre>
          </li>

          <li>
            Attendre le message :
            <pre className="mt-2 rounded bg-white p-3 text-sm overflow-x-auto">
{`✅ Restauration terminée`}
            </pre>
          </li>
        </ol>

        <div className="rounded border border-red-300 bg-white p-4 text-red-900">
          <strong>Attention :</strong> restaurer un backup remet la base dans
          l’état exact du fichier SQL choisi. Les modifications faites après ce
          backup peuvent être perdues.
        </div>
      </section>

      <section className="rounded-xl border p-6 space-y-4">
        <h2 className="text-2xl font-bold">Commandes utiles</h2>

        <div className="space-y-3">
          <div>
            <p className="font-semibold">Créer un backup complet :</p>
            <pre className="mt-2 rounded bg-gray-100 p-3 text-sm overflow-x-auto">
{`npm run backup:db`}
            </pre>
          </div>

          <div>
            <p className="font-semibold">Restaurer un backup :</p>
            <pre className="mt-2 rounded bg-gray-100 p-3 text-sm overflow-x-auto">
{`npm run restore:db`}
            </pre>
          </div>

          <div>
            <p className="font-semibold">Dossier des backups :</p>
            <pre className="mt-2 rounded bg-gray-100 p-3 text-sm overflow-x-auto">
{`backups/`}
            </pre>
          </div>

          <div>
            <p className="font-semibold">Fichier de log :</p>
            <pre className="mt-2 rounded bg-gray-100 p-3 text-sm overflow-x-auto">
{`backups/backup-log.txt`}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}