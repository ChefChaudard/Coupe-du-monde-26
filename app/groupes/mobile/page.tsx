import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { isAdmin } from "@/lib/roles";
import { syncAvailableRealMatches } from "@/app/real-knockout/real-knockout-sync";
import {
  computeMatchOdds,
  getPredictionPoints,
  type MatchOdds,
} from "@/app/dashboard/scoring";
import MobilePredictionForm from "./MobilePredictionForm";

export const metadata: Metadata = {
  title: "Mobile T1",
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
};

type PredictionRow = {
  user_id: string;
  match_id: number;
  predicted_a: number;
  predicted_b: number;
};

function isGroupPhase(phase: string) {
  return phase.toLowerCase().includes("group");
}

export default async function MobileFirstRoundPage() {
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
    .filter((match: Match) => isGroupPhase(match.phase))
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
  const matchPredictionCounts: Record<number, MatchOdds> = {};

  const totalPlayers = new Set((predictions ?? []).map((p) => p.user_id)).size;

  for (const match of matches) {
    const matchPredictions = (predictions ?? []).filter(
      (p) => p.match_id === match.id
    );

    const predictionCounts = matchPredictions.reduce<MatchOdds>(
      (acc, prediction) => {
        if (prediction.predicted_a > prediction.predicted_b) {
          acc.one += 1;
        } else if (prediction.predicted_a < prediction.predicted_b) {
          acc.two += 1;
        } else {
          acc.draw += 1;
        }

        return acc;
      },
      { one: 0, draw: 0, two: 0 }
    );

    matchPredictionCounts[match.id] = predictionCounts;

    const matchOddsForMatch = computeMatchOdds(matchPredictions);

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

    const adminSupabase = createAdminClient();
    await syncAvailableRealMatches(adminSupabase);

    revalidatePath("/real-knockout");
    revalidatePath("/groupes/mobile");
    revalidatePath("/groupes/matchs");
    revalidatePath("/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Mobile
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Premier tour — ordre chronologique
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Vue optimisée pour mobile : tous les matchs du premier tour, du plus
            proche au plus lointain.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard?tab=groupes"
              className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
            >
              Vue groupes
            </Link>
            <Link
              href="/groupes/matchs"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Vue bureau
            </Link>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded-full bg-[#7a1f2c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822]"
            >
              Sauvegarder
            </button>
          </div>
        </section>

        <MobilePredictionForm
          matches={matches}
          existingPredictions={myPredictions}
          userId={user.id}
          matchStats={matchStats}
          matchPredictionCounts={matchPredictionCounts}
          isAdmin={isAdminUser}
          syncRealKnockoutMatches={syncRealKnockoutMatches}
        />
      </div>
    </main>
  );
}
