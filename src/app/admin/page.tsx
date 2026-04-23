import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function updateMatchResult(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    throw new Error("Accès refusé.");
  }

  const id = Number(formData.get("id"));
  const scoreA = Number(formData.get("score_a"));
  const scoreB = Number(formData.get("score_b"));

  if (Number.isNaN(id) || Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
    throw new Error("Valeurs invalides.");
  }

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      score_a: scoreA,
      score_b: scoreB,
      is_finished: true,
    })
    .eq("id", id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: rpcError } = await supabase.rpc("recalculate_scores");

  if (rpcError) {
    throw new Error(rpcError.message);
  }
}

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return (
      <main className="p-10 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Admin</h1>
        <p>Accès refusé.</p>
      </main>
    );
  }

  const { data: matches, error } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  if (error) {
    return (
      <main className="p-10 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Admin</h1>
        <p>Erreur chargement matchs : {error.message}</p>
      </main>
    );
  }

  return (
    <main className="p-10 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold mb-2">Admin résultats</h1>
      <p className="mb-8 text-gray-600">
        Connecté en tant que {profile.nickname}
      </p>

      <div className="space-y-4">
        {(matches ?? []).map((match) => (
          <form
            key={match.id}
            action={updateMatchResult}
            className="border rounded-2xl p-4 flex flex-col gap-4"
          >
            <input type="hidden" name="id" value={match.id} />

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm text-gray-500 mb-1">
                  {match.phase} •{" "}
                  {new Date(match.kickoff_at).toLocaleString("fr-FR")}
                </div>
                <div className="text-lg font-semibold">
                  {match.team_a} vs {match.team_b}
                </div>
              </div>

              <div className="text-sm text-gray-500">
                {match.is_finished ? "Terminé" : "À jouer"}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="min-w-[100px]">{match.team_a}</span>

              <input
                name="score_a"
                type="number"
                min={0}
                defaultValue={match.score_a ?? ""}
                className="w-20 border rounded px-3 py-2"
              />

              <span>-</span>

              <input
                name="score_b"
                type="number"
                min={0}
                defaultValue={match.score_b ?? ""}
                className="w-20 border rounded px-3 py-2"
              />

              <span className="min-w-[100px]">{match.team_b}</span>

              <button
                type="submit"
                className="bg-black text-white px-4 py-2 rounded"
              >
                Valider résultat
              </button>
            </div>
          </form>
        ))}
      </div>
    </main>
  );
}