import { redirect } from "next/navigation";

export default function SecurityAdminPage() {
  redirect("/");
}


/*
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
*/