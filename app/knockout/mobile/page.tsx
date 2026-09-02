import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { isAdmin } from "@/lib/roles";
import { getMatchOdds, getPredictionPoints } from "@/app/dashboard/scoring";
import KnockoutMobilePredictionForm from "./KnockoutMobilePredictionForm";

export const metadata: Metadata = {
  title: "Mobile 2e tour",
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

function isKnockoutPhase(phase: string) {
  const normalized = phase.toLowerCase();
  return (
    normalized.includes("8e") ||
    normalized.includes("quart") ||
    normalized.includes("demi") ||
    normalized.includes("finale")
  );
}

export default async function MobileSecondRoundPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const isAdminUser = isAdmin(profile ?? undefined);

  const { data: allMatches } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  const matches = (allMatches ?? [])
    .filter((match: Match) => isKnockoutPhase(match.phase))
    .slice()
    .sort(
      (a: Match, b: Match) =>
        new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime() ||
        a.id - b.id
    );

  const { data: myPredictionsData } = await supabase
    .from("predictions")
    .select("user_id, match_id, predicted_a, predicted_b")
    .eq("user_id", user.id);

  const myPredictions = myPredictionsData ?? [];

  // Every user's predictions are required to compute averagePoints.
  // Paginate explicitly to avoid PostgREST's default 1000-row truncation.
  const { data: predictions } = await fetchAllRows<PredictionRow>(() =>
    supabase
      .from("predictions")
      .select("user_id, match_id, predicted_a, predicted_b")
      .order("match_id", { ascending: true })
      .order("user_id", { ascending: true })
  );

  const matchStats: Record<number, MatchStats> = {};

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

  async function syncRealKnockoutMatches() {
    "use server";

    revalidatePath("/real-knockout");
    revalidatePath("/knockout/mobile");
    revalidatePath("/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <KnockoutMobilePredictionForm
          matches={matches}
          existingPredictions={myPredictions}
          userId={user.id}
          matchStats={matchStats}
          isAdmin={isAdminUser}
          syncRealKnockoutMatches={syncRealKnockoutMatches}
        />
      </div>
    </main>
  );
}
