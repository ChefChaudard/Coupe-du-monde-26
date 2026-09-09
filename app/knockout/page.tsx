import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasCompetitionStarted } from "@/lib/competition-lock";
import { computeLeagueRealRanking } from "@/app/dashboard/scoring";
import LeagueRankingPrediction from "./LeagueRankingPrediction";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "2e tours",
};

type MatchRow = {
  phase: string;
  team_a: string;
  team_b: string;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

function collectLeaguePhaseTeams(matches: MatchRow[]) {
  const teams = new Set<string>();
  for (const match of matches) {
    if (match.phase !== "Phase de ligue") continue;
    if (match.team_a) teams.add(match.team_a);
    if (match.team_b) teams.add(match.team_b);
  }
  return Array.from(teams).sort((left, right) => left.localeCompare(right));
}

export default async function KnockoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("phase, team_a, team_b, score_a, score_b, is_finished");

  const leaguePhaseTeams = collectLeaguePhaseTeams(matches ?? []);
  // computeLeagueRealRanking ne tient compte que des matchs deja termines
  // (is_finished + scores non nuls) et applique les criteres UEFA complets
  // (points, difference de buts, buts marques, buts marques a l'exterieur,
  // victoires, victoires a l'exterieur, alphabetique).
  const realRankByTeam = computeLeagueRealRanking(matches ?? []);
  const locked = await hasCompetitionStarted(supabase);

  const { data: pointSettingRows } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("key", "points_classement_equipes_enabled");
  const pointsEnabled =
    (pointSettingRows ?? []).find((row) => row.key === "points_classement_equipes_enabled")
      ?.value === "true";

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <LeagueRankingPrediction
          userId={user.id}
          teams={leaguePhaseTeams}
          realRankByTeam={realRankByTeam}
          locked={locked}
          pointsEnabled={pointsEnabled}
        />
      </div>
    </main>
  );
}