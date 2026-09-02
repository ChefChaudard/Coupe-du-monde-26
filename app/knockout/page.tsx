import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasCompetitionStarted } from "@/lib/competition-lock";
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

type TeamStanding = {
  team: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
};

function computeRealRanking(matches: MatchRow[]) {
  const statsByTeam = new Map<string, TeamStanding>();

  function ensureTeam(team: string) {
    if (!statsByTeam.has(team)) {
      statsByTeam.set(team, { team, points: 0, goalDifference: 0, goalsFor: 0 });
    }
    return statsByTeam.get(team)!;
  }

  for (const match of matches) {
    if (match.phase !== "Phase de ligue") continue;

    const teamA = ensureTeam(match.team_a);
    const teamB = ensureTeam(match.team_b);

    if (!match.is_finished || match.score_a === null || match.score_b === null) {
      continue;
    }

    teamA.goalsFor += match.score_a;
    teamB.goalsFor += match.score_b;
    teamA.goalDifference += match.score_a - match.score_b;
    teamB.goalDifference += match.score_b - match.score_a;

    if (match.score_a > match.score_b) {
      teamA.points += 3;
    } else if (match.score_a < match.score_b) {
      teamB.points += 3;
    } else {
      teamA.points += 1;
      teamB.points += 1;
    }
  }

  const sortedTeams = Array.from(statsByTeam.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.localeCompare(b.team);
  });

  const rankByTeam: Record<string, number> = {};
  sortedTeams.forEach((team, index) => {
    rankByTeam[team.team] = index + 1;
  });

  return rankByTeam;
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
  const realRankByTeam = computeRealRanking(matches ?? []);
  const locked = await hasCompetitionStarted(supabase);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <LeagueRankingPrediction
          userId={user.id}
          teams={leaguePhaseTeams}
          realRankByTeam={realRankByTeam}
          locked={locked}
        />
      </div>
    </main>
  );
}