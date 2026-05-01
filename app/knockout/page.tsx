import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Leaderboard from "@/app/dashboard/leaderboard";
import KnockoutBracketPrediction, {
  type BracketMatchInfo,
} from "./KnockoutBracketPrediction";

type Round32Teams = [string, string][];

type MatchRow = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at?: string;
  venue?: string | null;
  score_a?: number | null;
  score_b?: number | null;
  is_finished?: boolean | null;
};

type PredictionRow = {
  match_id: number;
  predicted_a: number;
  predicted_b: number;
};

type GroupRanking = Record<string, string[]>;

type GroupStatsRow = {
  name: string;
  points: number;
  gf: number;
  ga: number;
  predictedMatches: number;
};

const realPhasePrefix = "Reel - ";
const bracketPhaseStartIds: Record<string, number> = {
  "16e de finale": 1,
  "8e de finale": 17,
  "Quarts de finale": 25,
  "Demi-finales": 29,
  Finale: 31,
};

function fromRealPhase(phase: string) {
  return phase.startsWith(realPhasePrefix)
    ? phase.slice(realPhasePrefix.length)
    : phase;
}

function normalizeGroupName(phase: string) {
  const match = phase.match(/groupe\s*([A-H])/i) || phase.match(/group\s*([A-H])/i);
  return match ? match[1].toUpperCase() : null;
}

function getGroupPositionFromPlaceholder(placeholder: string) {
  const match = placeholder.match(/^(1er|2eme|3eme) du groupe ([A-H])/i);
  if (!match) return null;

  const position = match[1] === "1er" ? 1 : match[1] === "2eme" ? 2 : 3;
  const group = match[2].toUpperCase();
  return { position, group };
}

function buildPredictedGroupRankings(
  matches: MatchRow[],
  predictions: PredictionRow[]
): GroupRanking {
  const groups: Record<string, Record<string, GroupStatsRow>> = {};
  const predictionMap = new Map<number, PredictionRow>();
  predictions.forEach((prediction) => predictionMap.set(prediction.match_id, prediction));

  for (const match of matches) {
    const group = normalizeGroupName(match.phase);
    if (!group) continue;

    if (!groups[group]) {
      groups[group] = {};
    }

    const addTeam = (team: string) => {
      if (!groups[group][team]) {
        groups[group][team] = {
          name: team,
          points: 0,
          gf: 0,
          ga: 0,
          predictedMatches: 0,
        };
      }
    };

    addTeam(match.team_a);
    addTeam(match.team_b);

    const prediction = predictionMap.get(match.id);
    if (!prediction) continue;

    const { predicted_a, predicted_b } = prediction;

    const teamA = groups[group][match.team_a];
    const teamB = groups[group][match.team_b];

    teamA.gf += predicted_a;
    teamA.ga += predicted_b;
    teamB.gf += predicted_b;
    teamB.ga += predicted_a;

    teamA.predictedMatches += 1;
    teamB.predictedMatches += 1;

    if (predicted_a > predicted_b) {
      teamA.points += 3;
    } else if (predicted_a < predicted_b) {
      teamB.points += 3;
    } else {
      teamA.points += 1;
      teamB.points += 1;
    }
  }

  return Object.fromEntries(
    Object.entries(groups).map(([group, groupTeams]) => {
      const rows = Object.values(groupTeams);
      const hasPredictions = rows.some((row) => row.predictedMatches > 0);
      const sortedTeams = rows
        .slice()
        .sort((a, b) => {
          if (!hasPredictions) return a.name.localeCompare(b.name);
          if (b.points !== a.points) return b.points - a.points;
          const gdA = a.gf - a.ga;
          const gdB = b.gf - b.ga;
          if (gdB !== gdA) return gdB - gdA;
          if (b.gf !== a.gf) return b.gf - a.gf;
          return a.name.localeCompare(b.name);
        })
        .map((row) => row.name);

      return [group, sortedTeams];
    })
  );
}

function resolveTeamPlaceholder(
  placeholder: string,
  rankings: GroupRanking
): string {
  const parsed = getGroupPositionFromPlaceholder(placeholder);
  if (!parsed) return placeholder;

  const groupTeams = rankings[parsed.group];
  if (!groupTeams || groupTeams.length < parsed.position) return placeholder;

  return groupTeams[parsed.position - 1];
}

function buildBracketMatchInfo(matches: MatchRow[]) {
  const groupedRealMatches = matches.reduce<Record<string, MatchRow[]>>(
    (acc, match) => {
      if (!match.phase.startsWith(realPhasePrefix)) return acc;

      const phase = fromRealPhase(match.phase);
      if (!acc[phase]) acc[phase] = [];
      acc[phase].push(match);
      return acc;
    },
    {}
  );

  const matchInfoById: Record<number, BracketMatchInfo> = {};

  for (const [phase, phaseMatches] of Object.entries(groupedRealMatches)) {
    const startId = bracketPhaseStartIds[phase];
    if (!startId) continue;

    phaseMatches
      .slice()
      .sort((a, b) => {
        const dateDiff =
          new Date(a.kickoff_at ?? "").getTime() -
          new Date(b.kickoff_at ?? "").getTime();
        if (dateDiff !== 0) return dateDiff;
        return a.id - b.id;
      })
      .forEach((match, index) => {
        if (!match.kickoff_at) return;

        matchInfoById[startId + index] = {
          teamA: match.team_a,
          teamB: match.team_b,
          kickoffAt: match.kickoff_at,
          venue: match.venue,
          scoreA: match.score_a ?? null,
          scoreB: match.score_b ?? null,
          isFinished: match.is_finished ?? false,
        };
      });
  }

  return matchInfoById;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .single();

  const userName = profile?.nickname ?? user.email?.split("@")[0] ?? `user_${user.id.slice(0, 8)}`;

  const { data: matches } = await supabase
    .from("matches")
    .select("id, phase, team_a, team_b, kickoff_at, venue, score_a, score_b, is_finished");

  const { data: predictions } = await supabase
    .from("predictions")
    .select("match_id, predicted_a, predicted_b")
    .eq("user_id", user.id);

  const groupRankings = buildPredictedGroupRankings(
    matches ?? [],
    predictions ?? []
  );

  const round32Placeholders: Round32Teams = [
    ["1er du groupe A", "3eme du groupe F"],
    ["1er du groupe C", "3eme du groupe E"],
    ["1er du groupe B", "3eme du groupe D"],
    ["1er du groupe D", "3eme du groupe C"],
    ["1er du groupe E", "3eme du groupe B"],
    ["1er du groupe F", "3eme du groupe A"],
    ["1er du groupe G", "2eme du groupe H"],
    ["1er du groupe H", "2eme du groupe G"],
    ["2eme du groupe A", "2eme du groupe F"],
    ["2eme du groupe C", "2eme du groupe E"],
    ["2eme du groupe B", "2eme du groupe D"],
    ["2eme du groupe D", "2eme du groupe C"],
    ["2eme du groupe E", "2eme du groupe B"],
    ["2eme du groupe F", "2eme du groupe A"],
    ["3eme du groupe G", "3eme du groupe H"],
    ["3eme du groupe H", "3eme du groupe G"],
  ];

  const round32Teams: Round32Teams = round32Placeholders.map(
    ([placeholderA, placeholderB]) => [
      resolveTeamPlaceholder(placeholderA, groupRankings),
      resolveTeamPlaceholder(placeholderB, groupRankings),
    ]
  );
  const matchInfoById = buildBracketMatchInfo(matches ?? []);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <KnockoutBracketPrediction
            userName={userName}
            round32Teams={round32Teams}
            matchInfoById={matchInfoById}
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
