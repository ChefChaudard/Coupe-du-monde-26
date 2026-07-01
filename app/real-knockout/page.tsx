import type { Metadata } from "next";
import Link from "next/link";
import { computeMatchOdds, getPredictionPoints, type MatchOdds } from "@/app/dashboard/scoring";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { isAdmin } from "@/lib/roles";
import RealKnockoutScoreForm from "./real-knockout-score-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "2e tours Réels",
};

type MatchStats = {
  myPoints: number | null;
  averagePoints: number | null;
};

type Match = {
  id: number;
  match_number?: number | null;
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

type Prediction = {
  user_id: string;
  match_id: number;
  predicted_a: number;
  predicted_b: number;
};

type MatchOddsById = Record<number, MatchOdds>;

type GroupStandingRow = {
  team: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

type GroupInfo = {
  rows: GroupStandingRow[];
  totalMatches: number;
  finishedMatches: number;
};

const realPhasePrefix = "Reel - ";
const round32AssignmentsSettingKey = "real_round32_assignments";
const realPhaseOrder = [
  "16e de finale",
  "8e de finale",
  "Quarts de finale",
  "Demi-finales",
  "Finale",
];

function toRealPhase(phase: string) {
  return `${realPhasePrefix}${phase}`;
}

function fromRealPhase(phase: string) {
  return phase.startsWith(realPhasePrefix)
    ? phase.slice(realPhasePrefix.length)
    : phase;
}

function isRealPhase(phase: string) {
  return phase.startsWith(realPhasePrefix);
}

function normalizeGroupName(phase: string) {
  const match =
    phase.match(/groupe\s*([A-L])/i) || phase.match(/group\s*([A-L])/i);
  return match ? match[1].toUpperCase() : null;
}

function parseRound32Assignments(value?: string | null) {
  if (!value) return new Map<number, { teamA: string; teamB: string }>();

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Map<number, { teamA: string; teamB: string }>();

    const assignments = new Map<number, { teamA: string; teamB: string }>();

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;

      const candidate = item as { matchNumber?: unknown; teamA?: unknown; teamB?: unknown };
      if (
        typeof candidate.matchNumber !== "number" ||
        typeof candidate.teamA !== "string" ||
        typeof candidate.teamB !== "string"
      ) {
        continue;
      }

      assignments.set(candidate.matchNumber, {
        teamA: candidate.teamA,
        teamB: candidate.teamB,
      });
    }

    return assignments;
  } catch {
    return new Map<number, { teamA: string; teamB: string }>();
  }
}

function applyRound32Assignments(matches: Match[], assignments: Map<number, { teamA: string; teamB: string }>) {
  return matches.map((match) => {
    if (match.phase !== toRealPhase("16e de finale")) return match;

    const matchNumber = typeof match.match_number === "number" ? match.match_number : null;
    if (!matchNumber) return match;

    const assignment = assignments.get(matchNumber);
    if (!assignment) return match;

    return {
      ...match,
      team_a: assignment.teamA,
      team_b: assignment.teamB,
    };
  });
}

function buildGroupInfo(matches: Match[]) {
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
        played: 0,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
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

  for (const group of Object.values(groups)) {
    group.rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.localeCompare(b.team);
    });
  }

  return groups;
}

function isFirstRoundComplete(matches: Match[]) {
  const groups = Object.values(buildGroupInfo(matches));
  return (
    groups.length > 0 &&
    groups.every(
      (group) =>
        group.totalMatches > 0 && group.finishedMatches === group.totalMatches
    )
  );
}

function countMissingFirstRoundScores(matches: Match[]) {
  return Object.values(buildGroupInfo(matches)).reduce(
    (total, group) => total + Math.max(group.totalMatches - group.finishedMatches, 0),
    0
  );
}

function getTournamentStartAt(matches: Match[]) {
  const kickoffTimes = matches
    .map((match) => match.kickoff_at)
    .filter((kickoffAt): kickoffAt is string => Boolean(kickoffAt))
    .map((kickoffAt) => new Date(kickoffAt).getTime())
    .filter((time) => Number.isFinite(time));

  if (kickoffTimes.length === 0) return null;

  return Math.min(...kickoffTimes);
}

async function updateMatchResult(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .single();

  if (!isAdmin(profile ?? undefined)) {
    throw new Error("Accès admin refusé");
  }

  const matchId = Number(formData.get("match_id"));
  const scoreA = Number(formData.get("score_a"));
  const scoreB = Number(formData.get("score_b"));

  await supabase
    .from("matches")
    .update({
      score_a: scoreA,
      score_b: scoreB,
      is_finished: true,
    })
    .eq("id", matchId);

  revalidatePath("/real-knockout");
  revalidatePath("/dashboard");
}

export default async function RealKnockoutPage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .single();

  const isAdminUser = isAdmin(profile ?? undefined);

  const { data: matches } = await adminSupabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  const { data: predictions } = await fetchAllRows<{
    user_id: string;
    match_id: number;
    predicted_a: number;
    predicted_b: number;
  }>(() =>
    adminSupabase
      .from("predictions")
      .select("user_id, match_id, predicted_a, predicted_b")
      .order("match_id", { ascending: true })
      .order("user_id", { ascending: true })
  );

  const { data: round32Settings } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", round32AssignmentsSettingKey)
    .maybeSingle();

  const safeMatches = applyRound32Assignments(
    (matches ?? []) as Match[],
    parseRound32Assignments(round32Settings?.value ?? null)
  );
  const firstRoundComplete = isFirstRoundComplete(safeMatches);
  const firstRoundMissingScores = countMissingFirstRoundScores(safeMatches);
  const tournamentStartAt = getTournamentStartAt(safeMatches);
  const realMatches = safeMatches
    .filter((match) => isRealPhase(match.phase))
    .map((match) => ({
      ...match,
      phase: fromRealPhase(match.phase),
    }))
    .sort((a, b) => {
      const phaseDiff =
        realPhaseOrder.indexOf(a.phase) - realPhaseOrder.indexOf(b.phase);
      if (phaseDiff !== 0) return phaseDiff;
      return (
        new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime() ||
        a.id - b.id
      );
    });

  const myPredictions = ((predictions ?? []) as Prediction[]).filter(
    (prediction) => prediction.user_id === user.id
  );
  const matchOdds: MatchOddsById = {};

  for (const match of realMatches) {
    const matchPredictions = ((predictions ?? []) as Prediction[])
      .filter((prediction) => prediction.match_id === match.id)
      .map((prediction) => ({
        predicted_a: prediction.predicted_a,
        predicted_b: prediction.predicted_b,
      }));

    matchOdds[match.id] = computeMatchOdds(matchPredictions);
  }

  const matchStats: Record<number, MatchStats> = {};

  for (const match of realMatches) {
    if (!match.is_finished || match.score_a === null || match.score_b === null) {
      matchStats[match.id] = {
        myPoints: null,
        averagePoints: null,
      };
      continue;
    }

    const actualA = match.score_a;
    const actualB = match.score_b;
    const matchPredictions = ((predictions ?? []) as Prediction[]).filter(
      (prediction) => prediction.match_id === match.id
    );

    const allPoints = matchPredictions.map((prediction) =>
      getPredictionPoints(
        prediction.predicted_a,
        prediction.predicted_b,
        actualA,
        actualB,
        match.is_finished,
        match.phase,
        matchOdds[match.id] ?? { one: 1, draw: 1, two: 1 }
      )
    );

    const myPrediction = matchPredictions.find(
      (prediction) => prediction.user_id === user.id
    );

    matchStats[match.id] = {
      myPoints: myPrediction
        ? getPredictionPoints(
            myPrediction.predicted_a,
            myPrediction.predicted_b,
            actualA,
            actualB,
            match.is_finished,
            match.phase,
            matchOdds[match.id] ?? { one: 1, draw: 1, two: 1 }
          )
        : null,
      averagePoints:
        allPoints.reduce<number>((sum, pts) => sum + pts, 0) /
        (allPoints.length || 1),
    };
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7a1f2c]">
            2e Tour Réel
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Matchs du 2e tour réel
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Vue mobile des matchs du 2e tour réel, phase par phase.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/knockout"
              className="inline-flex items-center justify-center rounded-full bg-[#7a1f2c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822]"
            >
              Pronostics 2e tour
            </Link>
            <Link
              href="/groupes/mobile"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Mobile T1
            </Link>
            {isAdminUser && (
              <Link
                href="/admin/real-knockout"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Saisir les 16e
              </Link>
            )}
          </div>
        </section>

        <RealKnockoutScoreForm
          matches={realMatches}
          existingPredictions={myPredictions}
          userId={user.id}
          matchStats={matchStats}
          matchOdds={matchOdds}
          isAdmin={isAdminUser}
          firstRoundComplete={firstRoundComplete}
          firstRoundMissingScores={firstRoundMissingScores}
          tournamentStartAt={tournamentStartAt}
          updateMatchResult={updateMatchResult}
        />
      </div>
    </main>
  );
}
