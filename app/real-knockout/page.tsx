import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Leaderboard from "@/app/dashboard/leaderboard";
import { createClient } from "@/lib/supabase/server";
import RealKnockoutScoreForm from "./real-knockout-score-form";

export const metadata: Metadata = {
  title: "Pronostics Réel 2nd Tour",
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

type NewMatchPayload = Omit<Match, "id">;

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

type QualifiedThirdPlace = GroupStandingRow & {
  group: string;
};

type RoundOf32Seed =
  | {
      type: "group";
      group: string;
      position: 1 | 2;
    }
  | {
      type: "third";
      candidates: string[];
    };

type RoundOf32Fixture = {
  matchNumber: number;
  kickoff_at: string;
  venue: string;
  teamA: RoundOf32Seed;
  teamB: RoundOf32Seed;
};

const realPhasePrefix = "Reel - ";
const realPhaseOrder = [
  "16e de finale",
  "8e de finale",
  "Quarts de finale",
  "Demi-finales",
  "Finale",
];

const roundOf32Fixtures: RoundOf32Fixture[] = [
  {
    matchNumber: 73,
    kickoff_at: "2026-06-28T20:00:00.000Z",
    venue: "Los Angeles Stadium",
    teamA: { type: "group", group: "A", position: 2 },
    teamB: { type: "group", group: "B", position: 2 },
  },
  {
    matchNumber: 74,
    kickoff_at: "2026-06-29T20:00:00.000Z",
    venue: "Boston Stadium",
    teamA: { type: "group", group: "E", position: 1 },
    teamB: { type: "third", candidates: ["A", "B", "C", "D", "F"] },
  },
  {
    matchNumber: 75,
    kickoff_at: "2026-06-29T20:00:00.000Z",
    venue: "Estadio Monterrey",
    teamA: { type: "group", group: "F", position: 1 },
    teamB: { type: "group", group: "C", position: 2 },
  },
  {
    matchNumber: 76,
    kickoff_at: "2026-06-29T20:00:00.000Z",
    venue: "Houston Stadium",
    teamA: { type: "group", group: "C", position: 1 },
    teamB: { type: "group", group: "F", position: 2 },
  },
  {
    matchNumber: 77,
    kickoff_at: "2026-06-30T20:00:00.000Z",
    venue: "New York New Jersey Stadium",
    teamA: { type: "group", group: "I", position: 1 },
    teamB: { type: "third", candidates: ["C", "D", "F", "G", "H"] },
  },
  {
    matchNumber: 78,
    kickoff_at: "2026-06-30T20:00:00.000Z",
    venue: "Dallas Stadium",
    teamA: { type: "group", group: "E", position: 2 },
    teamB: { type: "group", group: "I", position: 2 },
  },
  {
    matchNumber: 79,
    kickoff_at: "2026-06-30T20:00:00.000Z",
    venue: "Mexico City Stadium",
    teamA: { type: "group", group: "A", position: 1 },
    teamB: { type: "third", candidates: ["C", "E", "F", "H", "I"] },
  },
  {
    matchNumber: 80,
    kickoff_at: "2026-07-01T20:00:00.000Z",
    venue: "Atlanta Stadium",
    teamA: { type: "group", group: "L", position: 1 },
    teamB: { type: "third", candidates: ["E", "H", "I", "J", "K"] },
  },
  {
    matchNumber: 81,
    kickoff_at: "2026-07-01T20:00:00.000Z",
    venue: "San Francisco Bay Area Stadium",
    teamA: { type: "group", group: "D", position: 1 },
    teamB: { type: "third", candidates: ["B", "E", "F", "I", "J"] },
  },
  {
    matchNumber: 82,
    kickoff_at: "2026-07-01T20:00:00.000Z",
    venue: "Seattle Stadium",
    teamA: { type: "group", group: "G", position: 1 },
    teamB: { type: "third", candidates: ["A", "E", "H", "I", "J"] },
  },
  {
    matchNumber: 83,
    kickoff_at: "2026-07-02T20:00:00.000Z",
    venue: "Toronto Stadium",
    teamA: { type: "group", group: "K", position: 2 },
    teamB: { type: "group", group: "L", position: 2 },
  },
  {
    matchNumber: 84,
    kickoff_at: "2026-07-02T20:00:00.000Z",
    venue: "Los Angeles Stadium",
    teamA: { type: "group", group: "H", position: 1 },
    teamB: { type: "group", group: "J", position: 2 },
  },
  {
    matchNumber: 85,
    kickoff_at: "2026-07-02T20:00:00.000Z",
    venue: "BC Place Vancouver",
    teamA: { type: "group", group: "B", position: 1 },
    teamB: { type: "third", candidates: ["E", "F", "G", "I", "J"] },
  },
  {
    matchNumber: 86,
    kickoff_at: "2026-07-03T20:00:00.000Z",
    venue: "Miami Stadium",
    teamA: { type: "group", group: "J", position: 1 },
    teamB: { type: "group", group: "H", position: 2 },
  },
  {
    matchNumber: 87,
    kickoff_at: "2026-07-03T20:00:00.000Z",
    venue: "Kansas City Stadium",
    teamA: { type: "group", group: "K", position: 1 },
    teamB: { type: "third", candidates: ["D", "E", "I", "J", "L"] },
  },
  {
    matchNumber: 88,
    kickoff_at: "2026-07-03T20:00:00.000Z",
    venue: "Dallas Stadium",
    teamA: { type: "group", group: "D", position: 2 },
    teamB: { type: "group", group: "G", position: 2 },
  },
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

function compareGroupRows(a: GroupStandingRow, b: GroupStandingRow) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.team.localeCompare(b.team);
}

function getQualifiedThirdPlaces(groupInfo: Record<string, GroupInfo>) {
  return Object.entries(groupInfo)
    .flatMap(([group, info]) => {
      const row = info.rows[2];
      return row ? [{ ...row, group }] : [];
    })
    .sort(compareGroupRows)
    .slice(0, 8);
}

function getThirdPlaceSeeds() {
  return roundOf32Fixtures.flatMap((fixture, fixtureIndex) =>
    [fixture.teamA, fixture.teamB].flatMap((seed, seedIndex) =>
      seed.type === "third"
        ? [{ fixtureIndex, seedIndex, candidates: seed.candidates }]
        : []
    )
  );
}

function assignThirdPlaces(groupInfo: Record<string, GroupInfo>) {
  const thirdSeeds = getThirdPlaceSeeds();
  const qualifiedThirds = getQualifiedThirdPlaces(groupInfo);
  const assignments = new Map<number, QualifiedThirdPlace>();
  const usedGroups = new Set<string>();
  const seedOrder = thirdSeeds
    .map((seed, index) => ({ ...seed, index }))
    .sort((a, b) => a.candidates.length - b.candidates.length);

  function backtrack(seedOrderIndex: number): boolean {
    if (seedOrderIndex >= seedOrder.length) return true;

    const seed = seedOrder[seedOrderIndex];
    const candidates = qualifiedThirds.filter(
      (third) =>
        seed.candidates.includes(third.group) && !usedGroups.has(third.group)
    );

    for (const candidate of candidates) {
      assignments.set(seed.index, candidate);
      usedGroups.add(candidate.group);

      if (backtrack(seedOrderIndex + 1)) return true;

      assignments.delete(seed.index);
      usedGroups.delete(candidate.group);
    }

    return false;
  }

  return backtrack(0) ? assignments : new Map<number, QualifiedThirdPlace>();
}

function resolveSeed(
  seed: RoundOf32Seed,
  groupInfo: Record<string, GroupInfo>,
  thirdAssignments: Map<number, QualifiedThirdPlace>,
  thirdSeedIndex: number
) {
  if (seed.type === "third") {
    return thirdAssignments.get(thirdSeedIndex)?.team ?? null;
  }

  const group = groupInfo[seed.group];
  if (!group || group.rows.length < seed.position) return null;

  return group.rows[seed.position - 1].team;
}

function getPhaseMatches(matches: Match[], phase: string) {
  return matches
    .filter((match) => match.phase === toRealPhase(phase))
    .sort(
      (a, b) =>
        new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime() ||
        a.id - b.id
    );
}

function hasPairing(matches: Match[], teamA: string, teamB: string) {
  return matches.some(
    (match) =>
      (match.team_a === teamA && match.team_b === teamB) ||
      (match.team_a === teamB && match.team_b === teamA)
  );
}

function getWinner(match: Match) {
  if (!match.is_finished || match.score_a === null || match.score_b === null) {
    return null;
  }

  if (match.score_a > match.score_b) return match.team_a;
  if (match.score_b > match.score_a) return match.team_b;
  return null;
}

function getNextKickoffDate(sourceMatches: Match[], daysAfter: number) {
  const latestTime = sourceMatches.reduce((latest, match) => {
    const kickoffTime = new Date(match.kickoff_at).getTime();
    return Number.isNaN(kickoffTime) ? latest : Math.max(latest, kickoffTime);
  }, Date.now());

  const date = new Date(latestTime);
  date.setDate(date.getDate() + daysAfter);
  date.setHours(20, 0, 0, 0);
  return date.toISOString();
}

function buildAvailableRealMatches(matches: Match[]) {
  if (!isFirstRoundComplete(matches)) return [];

  const payload: NewMatchPayload[] = [];
  const groupInfo = buildGroupInfo(matches);
  const thirdAssignments = assignThirdPlaces(groupInfo);
  const existingRound16 = getPhaseMatches(matches, "16e de finale");
  let thirdSeedIndex = 0;

  for (const fixture of roundOf32Fixtures) {
    const resolveFixtureSeed = (seed: RoundOf32Seed) => {
      const seedIndex = seed.type === "third" ? thirdSeedIndex : -1;
      if (seed.type === "third") thirdSeedIndex += 1;
      return resolveSeed(seed, groupInfo, thirdAssignments, seedIndex);
    };

    const teamA = resolveFixtureSeed(fixture.teamA);
    const teamB = resolveFixtureSeed(fixture.teamB);

    if (!teamA || !teamB) continue;
    if (hasPairing(existingRound16, teamA, teamB)) continue;

    payload.push({
      phase: toRealPhase("16e de finale"),
      team_a: teamA,
      team_b: teamB,
      kickoff_at: fixture.kickoff_at,
      venue: fixture.venue,
      score_a: null,
      score_b: null,
      is_finished: false,
    });
  }

  for (let phaseIndex = 1; phaseIndex < realPhaseOrder.length; phaseIndex += 1) {
    const targetPhase = realPhaseOrder[phaseIndex];
    const previousPhase = realPhaseOrder[phaseIndex - 1];
    const previousMatches = getPhaseMatches(matches, previousPhase);
    const existingTarget = getPhaseMatches(matches, targetPhase);

    for (let index = 0; index < previousMatches.length; index += 2) {
      const leftMatch = previousMatches[index];
      const rightMatch = previousMatches[index + 1];
      if (!leftMatch || !rightMatch) continue;

      const teamA = getWinner(leftMatch);
      const teamB = getWinner(rightMatch);
      if (!teamA || !teamB) continue;
      if (hasPairing(existingTarget, teamA, teamB)) continue;

      payload.push({
        phase: toRealPhase(targetPhase),
        team_a: teamA,
        team_b: teamB,
        kickoff_at: getNextKickoffDate(previousMatches, index / 2 + 1),
        venue: null,
        score_a: null,
        score_b: null,
        is_finished: false,
      });
    }
  }

  return payload;
}

function getPointsForPrediction(
  predictedA: number,
  predictedB: number,
  actualA: number,
  actualB: number,
  isFinished: boolean | null
) {
  if (!isFinished) return 0;
  if (predictedA === actualA && predictedB === actualB) return 3;

  const predictedOutcome =
    predictedA > predictedB ? "A" : predictedA < predictedB ? "B" : "D";
  const actualOutcome =
    actualA > actualB ? "A" : actualA < actualB ? "B" : "D";

  return predictedOutcome === actualOutcome ? 1 : 0;
}

async function syncRealMatches() {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    throw new Error("Accès admin refusé");
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  const payload = buildAvailableRealMatches((matches ?? []) as Match[]);

  if (payload.length > 0) {
    await supabase.from("matches").insert(payload);
  }

  revalidatePath("/real-knockout");
  revalidatePath("/dashboard");
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
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.is_admin === true;

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  const { data: predictions } = await supabase
    .from("predictions")
    .select("user_id, match_id, predicted_a, predicted_b");

  const safeMatches = (matches ?? []) as Match[];
  const firstRoundComplete = isFirstRoundComplete(safeMatches);
  const firstRoundMissingScores = countMissingFirstRoundScores(safeMatches);
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
      getPointsForPrediction(
        prediction.predicted_a,
        prediction.predicted_b,
        actualA,
        actualB,
        match.is_finished
      )
    );

    const myPrediction = matchPredictions.find(
      (prediction) => prediction.user_id === user.id
    );

    matchStats[match.id] = {
      myPoints: myPrediction
        ? getPointsForPrediction(
            myPrediction.predicted_a,
            myPrediction.predicted_b,
            actualA,
            actualB,
            match.is_finished
          )
        : null,
      averagePoints:
        allPoints.reduce<number>((sum, points) => sum + points, 0) /
        (allPoints.length || 1),
    };
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section>
          <RealKnockoutScoreForm
            matches={realMatches}
            existingPredictions={myPredictions}
            userId={user.id}
            matchStats={matchStats}
            isAdmin={isAdmin}
            firstRoundComplete={firstRoundComplete}
            firstRoundMissingScores={firstRoundMissingScores}
            updateMatchResult={updateMatchResult}
            syncRealMatches={syncRealMatches}
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
