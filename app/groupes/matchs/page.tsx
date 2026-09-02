import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { isAdmin } from "@/lib/roles";
import PredictionForm from "@/app/dashboard/prediction-form";
import { getMatchOdds, getPredictionPoints } from "@/app/dashboard/scoring";
import { isGroupPhase } from "@/lib/phase";

export const metadata: Metadata = {
  title: "Matchs de groupe",
};

type MatchStats = {
  myPoints: number | null;
  averagePoints: number | null;
};

type Match = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at: string;
  venue?: string | null;
  city?: string | null;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
};

type PredictionRow = {
  user_id: string;
  match_id: number;
  predicted_a: number;
  predicted_b: number;
};

export default async function GroupMatchesPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin, time_zone")
    .eq("id", user.id)
    .maybeSingle();

  const isAdminUser = isAdmin(profile ?? undefined);

  const { data: allMatches } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  const matches = (allMatches ?? []).filter((match: Match) =>
    isGroupPhase(match.phase)
  );

  const { data: myPredictionsData } = await supabase
    .from("predictions")
    .select("user_id, match_id, predicted_a, predicted_b")
    .eq("user_id", user.id);

  const myPredictions = myPredictionsData ?? [];

  // Every user's predictions are required to compute per-match odds/averages.
  // Paginate explicitly to avoid PostgREST's default 1000-row truncation.
  const { data: predictions } = await fetchAllRows<PredictionRow>(() =>
    supabase
      .from("predictions")
      .select("user_id, match_id, predicted_a, predicted_b")
      .order("match_id", { ascending: true })
      .order("user_id", { ascending: true })
  );

    const matchStats: Record<number, MatchStats> = {};

  // Total number of players in the competition (everyone who has made at least
  // one prediction). Used so the per-match average spreads points over all
  // players, not only those who predicted that specific match.
  const totalPlayers = new Set((predictions ?? []).map((p) => p.user_id)).size;

  for (const match of matches) {
    const matchPredictions = (predictions ?? []).filter(
      (p) => p.match_id === match.id
    );

    const matchOddsForMatch = getMatchOdds(match);

    if (!match.is_finished || match.score_a === null || match.score_b === null) {
      matchStats[match.id] = {
        myPoints: null,
        averagePoints: null,
      };
      continue;
    }

    const allPoints = matchPredictions.map((prediction) =>
      getPredictionPoints(
        prediction.predicted_a,
        prediction.predicted_b,
        match.score_a,
        match.score_b,
        match.is_finished,
        match.phase,
        matchOddsForMatch
      )
    );

    const averagePoints =
      allPoints.reduce<number>((sum, pts) => sum + pts, 0) /
      (totalPlayers || 1);

    const myPrediction = matchPredictions.find((p) => p.user_id === user.id);

    const myPoints = myPrediction
      ? getPredictionPoints(
          myPrediction.predicted_a,
          myPrediction.predicted_b,
          match.score_a,
          match.score_b,
          match.is_finished,
          match.phase,
          matchOddsForMatch
        )
      : null;

    matchStats[match.id] = {
      myPoints,
      averagePoints,
    };
  }

  async function createKnockoutMatches() {
    "use server";
    revalidatePath("/groupes/matchs");
    revalidatePath("/dashboard");
  }

  async function syncRealKnockoutMatches() {
    "use server";

    revalidatePath("/real-knockout");
    revalidatePath("/groupes/matchs");
    revalidatePath("/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
                <PredictionForm
          matches={matches}
          existingPredictions={myPredictions}
          userId={user.id}
          matchStats={matchStats}
          isAdmin={isAdminUser}
          createKnockoutMatches={createKnockoutMatches}
          syncRealKnockoutMatches={syncRealKnockoutMatches}
          initialTab="groupes"
          chronological
        />
      </div>
    </main>
  );
}