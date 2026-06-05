import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/roles";
import { redirect } from "next/navigation";

async function updateMatch(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const id = Number(formData.get("id"));
  const score_a = Number(formData.get("score_a"));
  const score_b = Number(formData.get("score_b"));

  await supabase
    .from("matches")
    .update({
      score_a,
      score_b,
      is_finished: true,
    })
    .eq("id", id);

  // ❌ SUPPRIMÉ :
  // await supabase.rpc("recalculate_scores");
}

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // (optionnel mais recommandé) vérifier admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, roles")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdmin(profile)) {
    redirect("/dashboard");
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Admin résultats</h1>
        <Link href="/admin/users" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50">
          Comptes et mots de passe
        </Link>
      </div>

      <div className="space-y-4">
        {(matches ?? []).map((match) => (
          <form
            key={match.id}
            action={updateMatch}
            className="flex items-center gap-3 rounded border p-4"
          >
            <input type="hidden" name="id" value={match.id} />

            <span className="min-w-56">
              {match.team_a} vs {match.team_b}
            </span>

            <input
              name="score_a"
              type="number"
              min={0}
              className="w-16 rounded border p-2"
              defaultValue={match.score_a ?? ""}
            />

            <input
              name="score_b"
              type="number"
              min={0}
              className="w-16 rounded border p-2"
              defaultValue={match.score_b ?? ""}
            />

            <button className="rounded bg-black px-4 py-2 text-white">
              Valider
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}