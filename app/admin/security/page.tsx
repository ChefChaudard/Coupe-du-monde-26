import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function createSnapshot(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const label = String(formData.get("label") || "").trim();

  if (!label) return;

  await supabase.rpc("create_app_snapshot", {
    snapshot_label: label,
  });

  revalidatePath("/admin/security");
}

async function restoreSnapshot(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const snapshotId = Number(formData.get("snapshot_id"));

  if (!snapshotId) return;

  await supabase.rpc("restore_app_snapshot", {
    snapshot_id: snapshotId,
  });

  revalidatePath("/admin/security");
  revalidatePath("/dashboard");
}

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

  const { data: snapshots } = await supabase
    .from("app_snapshots")
    .select("id, label, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-8">
      <Link href="/" className="text-blue-600 hover:underline">
        ← Retour accueil
      </Link>

      <h1 className="text-4xl font-bold">Administration sécurité</h1>

      <section className="rounded-xl border p-6 space-y-4">
        <h2 className="text-2xl font-bold">Créer une sauvegarde</h2>

        <form action={createSnapshot} className="flex gap-3">
          <input
            name="label"
            placeholder="Ex : avant résultats journée 1"
            className="flex-1 rounded border px-3 py-2"
            required
          />

          <button className="rounded bg-black px-4 py-2 text-white">
            Créer sauvegarde
          </button>
        </form>
      </section>

      <section className="rounded-xl border p-6 space-y-4">
        <h2 className="text-2xl font-bold">Restaurer une sauvegarde</h2>

        <div className="space-y-3">
          {(snapshots ?? []).map((snapshot) => (
            <div
              key={snapshot.id}
              className="flex items-center justify-between rounded border p-4"
            >
              <div>
                <p className="font-semibold">{snapshot.label}</p>
                <p className="text-sm text-gray-500">
                  {new Date(snapshot.created_at).toLocaleString("fr-FR")}
                </p>
              </div>

              <form action={restoreSnapshot}>
                <input
                  type="hidden"
                  name="snapshot_id"
                  value={snapshot.id}
                />

                <button className="rounded bg-red-700 px-4 py-2 text-white">
                  Restaurer
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}