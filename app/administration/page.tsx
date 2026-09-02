import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { computeLeaderboardData } from "@/app/dashboard/leaderboard-data";


export const metadata: Metadata = {
  title: "Administration",
};

const adminSections = [
  {
    label: "Comptes et mots de passe",
    href: "/admin/users",
  },
  {
    label: "Créer / gérer groupes",
    href: "/admin/groups",
  },
  {
    label: "Saisie 2ème Tour",
    href: "/admin/real-knockout",
  },
];

function shuffle<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Utilise pour interdire "Aleatoire" et "Reinitialiser" une fois que le 1er
// match de la phase de ligue a reellement debute (protection anti-triche /
// anti-fausse manipulation une fois la competition lancee).
async function hasCompetitionStarted(
  client: ReturnType<typeof createAdminClient>
) {
  const { data: firstMatch, error } = await client
    .from("matches")
    .select("kickoff_at")
    .eq("phase", "Phase de ligue")
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!firstMatch?.kickoff_at) return false;

  return new Date(firstMatch.kickoff_at).getTime() <= Date.now();
}

async function freezeWc2026Results() {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin, nickname")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdmin(profile)) {
    throw new Error("Accès admin refusé.");
  }

  const adminClient = createAdminClient();

  const [
    { data: predictions },
    { data: profiles },
    { data: matches },
    { data: knockoutPredictions },
    { data: realTopScorers },
  ] = await Promise.all([
    fetchAllRows<{
      user_id: string;
      match_id: number;
      predicted_a: number;
      predicted_b: number;
    }>(() =>
      adminClient
        .from("predictions")
        .select("user_id, match_id, predicted_a, predicted_b")
        .order("match_id", { ascending: true })
        .order("user_id", { ascending: true })
    ),
    adminClient.from("profiles").select("id, nickname"),
    adminClient
      .from("matches")
      .select(
        "id, phase, team_a, team_b, kickoff_at, venue, city, score_a, score_b, is_finished"
      ),
    fetchAllRows<{
      user_id: string;
      match_key: string;
      team_a: string | null;
      team_b: string | null;
      winner: string | null;
      round: string | null;
    }>(() =>
      adminClient
        .from("knockout_predictions")
        .select("user_id, match_key, team_a, team_b, winner, round")
        .order("match_key", { ascending: true })
        .order("user_id", { ascending: true })
    ),
    adminClient.from("real_top_scorers").select("player_name"),
  ]);

  const matchesById = new Map(
    (matches ?? []).map((match) => [match.id, match])
  );

  const predictionsWithMatches = (predictions ?? []).map((prediction) => ({
    ...prediction,
    matches: matchesById.get(prediction.match_id) ?? null,
  }));

  const payload = computeLeaderboardData(
    predictionsWithMatches as unknown as Parameters<typeof computeLeaderboardData>[0],
    (profiles ?? []) as unknown as Parameters<typeof computeLeaderboardData>[1],
    null,
    (knockoutPredictions ?? []) as unknown as Parameters<typeof computeLeaderboardData>[3],
    (matches ?? []) as unknown as Parameters<typeof computeLeaderboardData>[4],
    (realTopScorers ?? []) as unknown as Parameters<typeof computeLeaderboardData>[5]
  );

  const records = payload.rows.map((row, index) => {
    const details = payload.detailsByUser[row.user_id] ?? {
      group: 0,
      groupPlacement: 0,
      knockout: 0,
      topScorer: 0,
      real: 0,
    };

    const groupPlacementPoints =
      payload.groupPlacementPointsByUser[row.user_id] ?? 0;

    return {
      user_id: row.user_id,
      nickname: row.nickname,
      rank: index + 1,
      points: row.points,
      group_points: details.group - groupPlacementPoints,
      group_placement_points: groupPlacementPoints,
      knockout_points: details.knockout,
      top_scorer_points: details.topScorer,
      real_points: details.real,
      score_report: payload.scoreReportByUser[row.user_id] ?? [],
    };
  });

  const { error: deleteError } = await adminClient
    .from("wc2026_results")
    .delete()
    .not("user_id", "is", null);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (records.length > 0) {
    const { error: insertError } = await adminClient
      .from("wc2026_results")
      .insert(records);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidatePath("/administration");
revalidatePath("/world-cup-26/classement");
}

async function resetMyPredictions() {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin, nickname")
    .eq("id", user.id)
    .single();

  if (!profile || !isSuperAdmin(profile)) {
    throw new Error("Accès super administrateur refusé.");
  }

  const adminClient = createAdminClient();

  if (await hasCompetitionStarted(adminClient)) {
    throw new Error(
      "Le 1er match de la compétition a déjà débuté : réinitialisation désactivée."
    );
  }

  const { error: predictionsError } = await adminClient
    .from("predictions")
    .delete()
    .eq("user_id", user.id);

  if (predictionsError) {
    throw new Error(predictionsError.message);
  }

  const { error: knockoutError } = await adminClient
    .from("knockout_predictions")
    .delete()
    .eq("user_id", user.id);

  if (knockoutError) {
    throw new Error(knockoutError.message);
  }

  const { error: groupError } = await adminClient
    .from("group_predictions")
    .delete()
    .eq("user_id", user.id);

  if (groupError) {
    throw new Error(groupError.message);
  }

  // Meme contrainte que pour la generation aleatoire : la remise a null des
  // scores/is_finished est aussi bloquee par le trigger "match pas encore
  // termine". On utilise donc la meme fonction SQL de contournement
  // (desactive le trigger, remet a null, reactive le trigger).
  const { error: matchResetError } = await adminClient.rpc(
    "admin_reset_league_match_results"
  );

  if (matchResetError) {
    throw new Error(matchResetError.message);
  }

  revalidatePath("/administration");
  revalidatePath("/dashboard");
  revalidatePath("/groupes/mobile");
  revalidatePath("/knockout");
  revalidatePath("/knockout/mobile");
  revalidatePath("/knockout/qualifies");
}

async function generateRandomPredictions() {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin, nickname")
    .eq("id", user.id)
    .single();

  if (!profile || !isSuperAdmin(profile)) {
    throw new Error("Accès super administrateur refusé.");
  }

  const adminClient = createAdminClient();

  if (await hasCompetitionStarted(adminClient)) {
    throw new Error(
      "Le 1er match de la compétition a déjà débuté : génération aléatoire désactivée."
    );
  }

  const { data: leagueMatches, error: matchesError } = await adminClient
    .from("matches")
    .select("id, team_a, team_b")
    .eq("phase", "Phase de ligue");

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const matches = leagueMatches ?? [];

  // 1) 1er tour : scores aleatoires (0 a 3) sur les matchs de la phase de ligue.
  if (matches.length > 0) {
    const predictionRows = matches.map((match) => ({
      user_id: user.id,
      match_id: match.id,
      predicted_a: Math.floor(Math.random() * 4),
      predicted_b: Math.floor(Math.random() * 4),
      updated_at: new Date().toISOString(),
    }));

    const { error: predictionsError } = await adminClient
      .from("predictions")
      .upsert(predictionRows, { onConflict: "user_id,match_id" });

    if (predictionsError) {
      throw new Error(predictionsError.message);
    }
  }

  // 2) Classement equipes : ordre aleatoire des 36 equipes (group_name = "Phase de ligue").
  const teamNames = Array.from(
    new Set(matches.flatMap((match) => [match.team_a, match.team_b]))
  );
  const shuffledTeams = shuffle(teamNames);

  const { error: deleteRankingError } = await adminClient
    .from("group_predictions")
    .delete()
    .eq("user_id", user.id)
    .eq("group_name", "Phase de ligue");

  if (deleteRankingError) {
    throw new Error(deleteRankingError.message);
  }

  if (shuffledTeams.length > 0) {
    const rankingRows = shuffledTeams.map((team, index) => ({
      user_id: user.id,
      group_name: "Phase de ligue",
      team_name: team,
      predicted_position: index + 1,
      updated_at: new Date().toISOString(),
    }));

    const { error: insertRankingError } = await adminClient
      .from("group_predictions")
      .insert(rankingRows);

    if (insertRankingError) {
      throw new Error(insertRankingError.message);
    }
  }

  // 3) Qualifies : Quarts (8), Demi (4), Finale (2), Vainqueur (1), tires
  //    independamment parmi les 24 premieres equipes du classement ci-dessus.
  const pool = shuffledTeams.slice(0, 24);
  const tiers = [
    { groupName: "Quarts de finale", count: 8 },
    { groupName: "Demi-finales", count: 4 },
    { groupName: "Finale", count: 2 },
    { groupName: "Vainqueur", count: 1 },
  ];

  const { error: deleteTiersError } = await adminClient
    .from("group_predictions")
    .delete()
    .eq("user_id", user.id)
    .in(
      "group_name",
      tiers.map((tier) => tier.groupName)
    );

  if (deleteTiersError) {
    throw new Error(deleteTiersError.message);
  }

  const tierRows = tiers.flatMap((tier) => {
    const picks = shuffle(pool).slice(0, tier.count);
    return picks.map((team, index) => ({
      user_id: user.id,
      group_name: tier.groupName,
      team_name: team,
      predicted_position: index + 1,
      updated_at: new Date().toISOString(),
    }));
  });

  if (tierRows.length > 0) {
    const { error: insertTiersError } = await adminClient
      .from("group_predictions")
      .insert(tierRows);

    if (insertTiersError) {
      throw new Error(insertTiersError.message);
    }
  }

  // 4) Resultats reels aleatoires (0 a 3) du 1er tour, pour simuler des
  // matchs deja joues. La contrainte "match pas encore termine" est
  // desactivee le temps du script via une fonction SQL dediee
  // (admin_generate_random_league_scores), puis reactivee automatiquement,
  // meme en cas d'erreur.
  const { error: randomScoresError } = await adminClient.rpc(
    "admin_generate_random_league_scores"
  );

  if (randomScoresError) {
    throw new Error(randomScoresError.message);
  }

  revalidatePath("/administration");
  revalidatePath("/dashboard");
  revalidatePath("/groupes/mobile");
  revalidatePath("/knockout");
  revalidatePath("/knockout/mobile");
  revalidatePath("/knockout/qualifies");
}

export default async function AdministrationHome() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin, nickname")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdmin(profile)) {
    redirect("/dashboard");
  }

  const canResetOwnPredictions = isSuperAdmin(profile);
  const competitionStarted = canResetOwnPredictions
    ? await hasCompetitionStarted(createAdminClient())
    : false;

  return (
    <main className="py-8 sm:py-10">
      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
<section className="rounded-3xl border border-slate-200 bg-white/85 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Administration
          </h1>

          <div className="mt-8 flex flex-wrap gap-3">
            {adminSections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                {section.label}
              </Link>
))}
          </div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900">
              Figer le classement World Cup 26
            </p>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Recalcule le classement et le détail des points de chaque joueur
              à partir des données actuelles, puis les enregistre dans une
              table dédiée (wc2026_results). Une fois figé, la page{" "}
              <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">
                /world-cup-26/classement
              </code>{" "}
              affiche ce résultat sans avoir besoin des autres tables — tu
              peux ensuite les vider en toute sécurité.
            </p>

            <form action={freezeWc2026Results} className="mt-4">
              <button
                type="submit"
                className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Figer le classement WC2026
              </button>
            </form>
          </div>

          {canResetOwnPredictions && !competitionStarted ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-900">
                Pronostics de test (SuperAdmin)
              </p>
              <p className="mt-1 max-w-xl text-sm text-red-700">
                "Aleatoire" genere des pronostics aleatoires sur ton compte
                (scores du 1er tour, classement 1-36, equipes qualifiees
                jusqu&apos;au vainqueur). "Reinitialiser" supprime tous tes
                pronostics pour repartir de zero. Actions irreversibles,
                uniquement sur ton propre compte. Ces deux boutons se
                desactivent automatiquement des que le 1er match de la
                phase de ligue a debute.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <form action={generateRandomPredictions}>
                  <button
                    type="submit"
                    className="rounded-full bg-amber-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-amber-700"
                  >
                    Aleatoire
                  </button>
                </form>

                <form action={resetMyPredictions}>
                  <button
                    type="submit"
                    className="rounded-full bg-red-700 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-red-800"
                  >
                    Reinitialiser mes pronostics
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {canResetOwnPredictions && competitionStarted ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">
                Pronostics de test (SuperAdmin)
              </p>
              <p className="mt-1 max-w-xl text-sm text-slate-600">
                La competition a debute : "Aleatoire" et "Reinitialiser" sont
                desactives.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
