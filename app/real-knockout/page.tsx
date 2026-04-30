import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Leaderboard from "@/app/dashboard/leaderboard";
import KnockoutBracketPrediction from "@/app/knockout/KnockoutBracketPrediction";
import {
  type Round32Teams,
  round32Placeholders,
} from "@/app/knockout/bracket-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pronostics Réels 2nd Tour",
};

type MatchRow = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

type GroupStandingRow = {
  team: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  played: number;
};

type GroupInfo = {
  rows: GroupStandingRow[];
  totalMatches: number;
  finishedMatches: number;
};

type GroupRanking = Record<string, string[]>;

function normalizeGroupName(phase: string) {
  const match =
    phase.match(/groupe\s*([A-L])/i) || phase.match(/group\s*([A-L])/i);
  return match ? match[1].toUpperCase() : null;
}

function getGroupPositionFromPlaceholder(placeholder: string) {
  const match = placeholder.match(/^(1er|2eme|3eme) du groupe ([A-L])/i);
  if (!match) return null;

  const position = match[1] === "1er" ? 1 : match[1] === "2eme" ? 2 : 3;
  return {
    position,
    group: match[2].toUpperCase(),
  };
}

function buildRealGroupRankings(matches: MatchRow[]): GroupRanking {
  const groups: Record<string, GroupInfo> = {};

  const getOrCreateGroup = (groupName: string) => {
    if (!groups[groupName]) {
      groups[groupName] = {
        rows: [],
        totalMatches: 0,
        finishedMatches: 0,
      };
    }

    return groups[groupName];
  };

  const getOrCreateTeam = (group: GroupInfo, team: string) => {
    let row = group.rows.find((item) => item.team === team);

    if (!row) {
      row = {
        team,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        played: 0,
      };
      group.rows.push(row);
    }

    return row;
  };

  for (const match of matches) {
    const groupName = normalizeGroupName(match.phase);
    if (!groupName) continue;

    const group = getOrCreateGroup(groupName);
    group.totalMatches += 1;

    const teamA = getOrCreateTeam(group, match.team_a);
    const teamB = getOrCreateTeam(group, match.team_b);

    if (!match.is_finished || match.score_a === null || match.score_b === null) {
      continue;
    }

    group.finishedMatches += 1;
    teamA.played += 1;
    teamB.played += 1;
    teamA.goalsFor += match.score_a;
    teamA.goalsAgainst += match.score_b;
    teamB.goalsFor += match.score_b;
    teamB.goalsAgainst += match.score_a;

    if (match.score_a > match.score_b) {
      teamA.points += 3;
    } else if (match.score_a < match.score_b) {
      teamB.points += 3;
    } else {
      teamA.points += 1;
      teamB.points += 1;
    }

    teamA.goalDifference = teamA.goalsFor - teamA.goalsAgainst;
    teamB.goalDifference = teamB.goalsFor - teamB.goalsAgainst;
  }

  return Object.fromEntries(
    Object.entries(groups)
      .filter(([, group]) => group.finishedMatches === group.totalMatches)
      .map(([groupName, group]) => {
        const sortedTeams = group.rows
          .slice()
          .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.goalDifference !== a.goalDifference) {
              return b.goalDifference - a.goalDifference;
            }
            if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
            return a.team.localeCompare(b.team);
          })
          .map((row) => row.team);

        return [groupName, sortedTeams];
      })
  );
}

function resolveTeamPlaceholder(placeholder: string, rankings: GroupRanking) {
  const parsed = getGroupPositionFromPlaceholder(placeholder);
  if (!parsed) return placeholder;

  const groupTeams = rankings[parsed.group];
  if (!groupTeams || groupTeams.length < parsed.position) return placeholder;

  return groupTeams[parsed.position - 1];
}

function buildRealRound32Teams(matches: MatchRow[]): Round32Teams {
  const realRankings = buildRealGroupRankings(matches);

  return round32Placeholders.map(([placeholderA, placeholderB]) => [
    resolveTeamPlaceholder(placeholderA, realRankings),
    resolveTeamPlaceholder(placeholderB, realRankings),
  ]);
}

export default async function RealKnockoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .single();

  const userName =
    profile?.nickname ?? user.email?.split("@")[0] ?? `user_${user.id.slice(0, 8)}`;

  const { data: matches } = await supabase
    .from("matches")
    .select("id, phase, team_a, team_b, score_a, score_b, is_finished")
    .order("kickoff_at", { ascending: true });

  const round32Teams = buildRealRound32Teams((matches ?? []) as MatchRow[]);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <KnockoutBracketPrediction
            userName={userName}
            round32Teams={round32Teams}
            storageKey="realSecondRoundPredictions"
            title="Pronostics Réels 2nd Tour"
            description="Les equipes du tableau des 32 sont deduites des resultats reels saisis dans les champs A Reel et B Reel. Pour les tours suivants, selectionnez le vainqueur de chaque match en respectant la meme logique que les pronostics eliminatoires."
          />
        </section>

        <section>
          <div className="xl:sticky xl:top-24">
            <Leaderboard />
          </div>
        </section>
      </div>
    </main>
  );
}
