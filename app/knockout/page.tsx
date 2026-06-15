import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import Leaderboard from "@/app/dashboard/leaderboard";
import KnockoutBracketPrediction, {
  type BracketMatchInfo,
} from "./KnockoutBracketPrediction";
import { formatOneDecimal } from "@/app/dashboard/format";
import { getRealLaterFixture, type RealLaterPhase } from "../real-knockout/real-knockout-fixtures";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "2e tours",
};
type Round32Teams = [string, string][];

type MatchRow = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at?: string;
  venue?: string | null;
  city?: string | null;
  score_a?: number | null;
  score_b?: number | null;
  is_finished?: boolean | null;
};

type PredictionRow = {
  match_id: number;
  predicted_a: number;
  predicted_b: number;
};

type KnockoutPredictionRow = {
  user_id: string;
  match_key: string;
  team_a: string | null;
  team_b: string | null;
  round: string | null;
};

type TeamOddsByMatchId = Record<number, Record<string, number>>;
type TeamOddsByPhase = Record<string, Record<string, number>>;
type TeamOddsCountByPhase = Record<string, Record<string, number>>;
type ProfileRow = {
  id: string;
};

const round32Phase = "16e de finale";

type GroupRanking = Record<string, string[]>;

type GroupStatsRow = {
  name: string;
  points: number;
  gf: number;
  ga: number;
  predictedMatches: number;
};

type GroupTeamsByLetter = Record<string, string[]>;

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
  const match = phase.match(/groupe\s*([A-L])/i) || phase.match(/group\s*([A-L])/i);
  return match ? match[1].toUpperCase() : null;
}

function getGroupPositionFromPlaceholder(placeholder: string) {
  const match = placeholder.match(/^(1er|2eme|3eme) du groupe ([A-L])/i);
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

function buildGroupTeamsByLetter(matches: MatchRow[]): GroupTeamsByLetter {
  const groups: Record<string, Set<string>> = {};

  for (const match of matches) {
    const group = normalizeGroupName(match.phase);
    if (!group) continue;

    if (!groups[group]) {
      groups[group] = new Set<string>();
    }

    if (match.team_a) groups[group].add(match.team_a);
    if (match.team_b) groups[group].add(match.team_b);
  }

  return Object.fromEntries(
    Object.entries(groups).map(([group, teams]) => [
      group,
      Array.from(teams).sort((left, right) => left.localeCompare(right)),
    ])
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
  const laterPhases: RealLaterPhase[] = [
    "8e de finale",
    "Quarts de finale",
    "Demi-finales",
    "Finale",
  ];

  for (const [phase, phaseMatches] of Object.entries(groupedRealMatches)) {
    const startId = bracketPhaseStartIds[phase];
    if (!startId) continue;

    const laterPhase = laterPhases.includes(phase as RealLaterPhase)
      ? (phase as RealLaterPhase)
      : null;

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
        const fixture = laterPhase ? getRealLaterFixture(laterPhase, index) : null;
        const kickoffAt = match.kickoff_at ?? fixture?.kickoff_at ?? "";

        matchInfoById[startId + index] = {
          teamA: match.team_a,
          teamB: match.team_b,
          kickoffAt,
          venue: match.venue ?? fixture?.venue ?? null,
          city: match.city ?? fixture?.city ?? null,
          scoreA: match.score_a ?? null,
          scoreB: match.score_b ?? null,
          isFinished: match.is_finished ?? false,
        };
      });
  }

  return matchInfoById;
}

function collectAllGroupTeams(matches: MatchRow[]) {
  const teams = new Set<string>();

  for (const match of matches) {
    if (!match.phase.toLowerCase().includes("group")) continue;
    if (match.team_a) teams.add(match.team_a);
    if (match.team_b) teams.add(match.team_b);
  }

  return Array.from(teams).sort((left, right) => left.localeCompare(right));
}

function getTournamentStartAt(matches: MatchRow[]) {
  const kickoffTimes = matches
    .map((match) => match.kickoff_at)
    .filter((kickoffAt): kickoffAt is string => Boolean(kickoffAt))
    .map((kickoffAt) => new Date(kickoffAt).getTime())
    .filter((time) => Number.isFinite(time));

  if (kickoffTimes.length === 0) return null;

  return Math.min(...kickoffTimes);
}

function normalizeTeamLabel(value?: string | null) {
  if (!value) return "";
  return value.trim();
}

function buildActualTeamsByPhase(matches: MatchRow[]) {
  const teamsByPhase = new Map<string, Set<string>>();

  for (const match of matches) {
    if (!match.phase.startsWith(realPhasePrefix)) continue;

    const phase = fromRealPhase(match.phase);
    const phaseTeams = teamsByPhase.get(phase) ?? new Set<string>();

    if (match.team_a) phaseTeams.add(match.team_a);
    if (match.team_b) phaseTeams.add(match.team_b);

    teamsByPhase.set(phase, phaseTeams);
  }

  return Object.fromEntries(
    Array.from(teamsByPhase.entries()).map(([phase, teams]) => [
      phase,
      Array.from(teams).sort((left, right) => left.localeCompare(right)),
    ])
  );
}

function buildTeamOddsByMatchId(
  predictions: KnockoutPredictionRow[]
): TeamOddsByMatchId {
  const countsByMatchId = new Map<number, Map<string, number>>();
  const totalsByMatchId = new Map<number, number>();

  for (const prediction of predictions) {
    const matchId = Number(prediction.match_key);
    if (!Number.isFinite(matchId)) continue;

    const teams = Array.from(
      new Set([
        normalizeTeamLabel(prediction.team_a),
        normalizeTeamLabel(prediction.team_b),
      ].filter(Boolean))
    );

    if (teams.length === 0) continue;

    const currentCounts = countsByMatchId.get(matchId) ?? new Map<string, number>();
    let currentTotal = totalsByMatchId.get(matchId) ?? 0;

    for (const team of teams) {
      currentCounts.set(team, (currentCounts.get(team) ?? 0) + 1);
      currentTotal += 1;
    }

    countsByMatchId.set(matchId, currentCounts);
    totalsByMatchId.set(matchId, currentTotal);
  }

  const oddsByMatchId: TeamOddsByMatchId = {};

  for (const [matchId, counts] of countsByMatchId.entries()) {
    const total = totalsByMatchId.get(matchId) ?? 0;
    oddsByMatchId[matchId] = Object.fromEntries(
      Array.from(counts.entries()).map(([team, count]) => [
        team,
        total === 0 ? 1 : Math.max(1, Math.round((total / Math.max(count, 1)) * 100) / 100),
      ])
    );
  }

  return oddsByMatchId;
}

function getKnockoutOddsCoefficient(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("16e")) return 2;
  if (normalizedPhase.includes("8e")) return 2;
  if (normalizedPhase.includes("quart")) return 3;
  if (normalizedPhase.includes("demi")) return 3;
  if (normalizedPhase.includes("finale")) return 3;

  return 1;
}

function buildTeamOddsByPhase(
  predictions: KnockoutPredictionRow[],
  totalPlayersCount: number
): {
  oddsByPhase: TeamOddsByPhase;
  countsByPhase: TeamOddsCountByPhase;
} {
  const summaryByPhase = buildTeamOddsSummaryByPhase(predictions);
  const oddsByPhase: TeamOddsByPhase = {};

  for (const [phase, counts] of Object.entries(summaryByPhase.countsByPhase)) {
    const coefficient = getKnockoutOddsCoefficient(phase);

    oddsByPhase[phase] = Object.fromEntries(
      Object.entries(counts).map(([team, count]) => [
        team,
        totalPlayersCount === 0
          ? 1
          : Math.max(
              1,
              Math.round((totalPlayersCount / Math.max(count, 1)) * coefficient * 100) / 100
            ),
      ])
    );
  }

  return {
    oddsByPhase,
    countsByPhase: summaryByPhase.countsByPhase,
  };
}

function buildTeamOddsSummaryByPhase(
  predictions: KnockoutPredictionRow[]
): {
  countsByPhase: TeamOddsCountByPhase;
} {
  const teamParticipantsByPhase = new Map<string, Map<string, Set<string>>>();

  for (const prediction of predictions) {
    if (!prediction.round) continue;

    const phase = fromRealPhase(prediction.round);
    const teams = Array.from(
      new Set([
        normalizeTeamLabel(prediction.team_a),
        normalizeTeamLabel(prediction.team_b),
      ].filter(Boolean))
    );

    if (teams.length === 0) continue;

    const currentTeamParticipants = teamParticipantsByPhase.get(phase) ?? new Map<string, Set<string>>();

    for (const team of teams) {
      const teamParticipants = currentTeamParticipants.get(team) ?? new Set<string>();
      teamParticipants.add(prediction.user_id);
      currentTeamParticipants.set(team, teamParticipants);
    }

    teamParticipantsByPhase.set(phase, currentTeamParticipants);
  }

  return {
    countsByPhase: Object.fromEntries(
      Array.from(teamParticipantsByPhase.entries()).map(([phase, teamParticipants]) => [
        phase,
        Object.fromEntries(
          Array.from(teamParticipants.entries()).map(([team, participants]) => [
            team,
            participants.size,
          ])
        ),
      ])
    ),
  };
}

export default async function KnockoutPage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }


  const { data: matches } = await supabase
    .from("matches")
    .select("id, phase, team_a, team_b, kickoff_at, venue, city, score_a, score_b, is_finished");

  const { data: predictions } = await supabase
    .from("predictions")
    .select("match_id, predicted_a, predicted_b")
    .eq("user_id", user.id);

  const { data: knockoutOddsRows } = await fetchAllRows<{
    user_id: string;
    match_key: string;
    team_a: string | null;
    team_b: string | null;
    round: string | null;
  }>(() =>
    adminSupabase
      .from("knockout_predictions")
      .select("user_id, match_key, team_a, team_b, round")
      .order("match_key", { ascending: true })
      .order("user_id", { ascending: true })
  );

  const { data: profileRows } = await adminSupabase
    .from("profiles")
    .select("id");

  const groupRankings = buildPredictedGroupRankings(
    matches ?? [],
    predictions ?? []
  );
  const groupTeamsByLetter = buildGroupTeamsByLetter(matches ?? []);

  const round32Placeholders: Round32Teams = [
    ["1er du groupe A", "3eme du groupe L"],
    ["1er du groupe B", "3eme du groupe K"],
    ["1er du groupe C", "3eme du groupe J"],
    ["1er du groupe D", "3eme du groupe I"],
    ["1er du groupe E", "3eme du groupe H"],
    ["1er du groupe F", "3eme du groupe G"],
    ["1er du groupe G", "2eme du groupe F"],
    ["1er du groupe H", "2eme du groupe E"],
    ["2eme du groupe A", "2eme du groupe L"],
    ["2eme du groupe B", "2eme du groupe K"],
    ["2eme du groupe C", "2eme du groupe J"],
    ["2eme du groupe D", "2eme du groupe I"],
    ["2eme du groupe E", "2eme du groupe H"],
    ["2eme du groupe F", "2eme du groupe G"],
    ["3eme du groupe A", "3eme du groupe C"],
    ["3eme du groupe B", "3eme du groupe D"],
  ];

  const round32Teams: Round32Teams = round32Placeholders.map(
    ([placeholderA, placeholderB]) => [
      resolveTeamPlaceholder(placeholderA, groupRankings),
      resolveTeamPlaceholder(placeholderB, groupRankings),
    ]
  );
  const allTeams = collectAllGroupTeams(matches ?? []);
  const matchInfoById = buildBracketMatchInfo(matches ?? []);
  const actualTeamsByPhase = buildActualTeamsByPhase(matches ?? []);
  const teamOddsBaseRows = ((knockoutOddsRows ?? []) as KnockoutPredictionRow[]).filter(
    (row) => row.user_id !== user.id
  );
  const totalPlayersCount = new Set((profileRows ?? []).map((row: ProfileRow) => row.id)).size;

  const teamOddsData = buildTeamOddsByPhase(teamOddsBaseRows, totalPlayersCount);
  const teamOddsByPhase = teamOddsData.oddsByPhase;
  const teamOddsCountsByPhase = teamOddsData.countsByPhase;
  const tournamentStartAt = getTournamentStartAt(matches ?? []);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <KnockoutBracketPrediction
            userId={user.id}
            round32Teams={round32Teams}
            groupTeamsByLetter={groupTeamsByLetter}
            matchInfoById={matchInfoById}
            actualTeamsByPhase={actualTeamsByPhase}
            teamOddsByPhase={teamOddsByPhase}
            teamOddsCountsByPhase={teamOddsCountsByPhase}
            totalPlayersCount={totalPlayersCount}
            tournamentStartAt={tournamentStartAt}
            title="2e tours"
            description="Cette page permet de construire vos pronostics des tours à élimination directe. Les 16e proposent les 48 équipes qualifiées. Pour les tours suivants, les listes se basent automatiquement sur les équipes du tour précédent, avec une seule occurrence possible par tour. Chaque équipe correctement pronostiquée rapporte des points égaux à sa cote. La cote d'une issue correspond au nombre total de joueurs divisé par le nombre de joueurs ayant choisi cette issue, multiplié par le coefficient du tour."
          />
        </section>

        <section>
          <div className="xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
            <Leaderboard />
          </div>
        </section>
      </div>
    </main>
  );
}
