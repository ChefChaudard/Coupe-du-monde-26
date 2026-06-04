import { computeMatchOdds, getPhasePointBase, getPredictionPoints, type MatchOdds } from "./scoring";

type MatchRow = {
  phase: string;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

type PredictionRow = {
  user_id: string;
  match_id: number;
  predicted_a: number;
  predicted_b: number;
  matches: MatchRow | MatchRow[] | null;
};

type ProfileRow = {
  id: string;
  nickname: string | null;
};

export type LeaderboardRow = {
  user_id: string;
  nickname: string;
  points: number;
};

export type ScoreBreakdown = {
  group: number;
  knockout: number;
  real: number;
};

export type PhaseDetailRow = {
  phase: string;
  points: number;
  base: number;
};

export type LeaderboardPayload = {
  rows: LeaderboardRow[];
  detailsByUser: Record<string, ScoreBreakdown>;
  phaseDetailsByUser: Record<string, PhaseDetailRow[]>;
  message: string;
};

function getScoreBreakdownLabel(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("group")) return "Groupes";
  if (
    normalizedPhase.includes("reel") ||
    normalizedPhase.includes("réel") ||
    normalizedPhase.includes("real")
  ) {
    return "Pronostics réel";
  }

  return "Tours éliminatoires";
}

function createEmptyBreakdown(): ScoreBreakdown {
  return { group: 0, knockout: 0, real: 0 };
}

function getBreakdownForUser(rows: PhaseDetailRow[]) {
  return rows.reduce<ScoreBreakdown>((acc, row) => {
    const label = getScoreBreakdownLabel(row.phase);

    if (label === "Groupes") {
      acc.group += row.points;
    } else if (label === "Tours éliminatoires") {
      acc.knockout += row.points;
    } else {
      acc.real += row.points;
    }

    return acc;
  }, createEmptyBreakdown());
}

function getPhaseDetails(rows: PhaseDetailRow[]) {
  return rows
    .map((row) => ({
      phase: row.phase,
      points: row.points,
      base: getPhasePointBase(row.phase),
    }))
    .sort((a, b) => a.phase.localeCompare(b.phase));
}

export function computeLeaderboardData(
  predictions: PredictionRow[],
  profiles: ProfileRow[],
  groupMemberIds: Set<string> | null
): LeaderboardPayload {
  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile.nickname ?? "Inconnu"])
  );

  const scoreMap = new Map<string, number>();
  const phaseDetailsMap = new Map<string, Map<string, number>>();
  const matchOddsMap = new Map<number, { predicted_a: number; predicted_b: number }[]>();

  const isGroupFilterActive = groupMemberIds !== null;
  const relevantPredictions = predictions.filter((prediction) =>
    isGroupFilterActive ? groupMemberIds.has(prediction.user_id) : true
  );

  for (const prediction of relevantPredictions) {
    const match = Array.isArray(prediction.matches)
      ? prediction.matches[0]
      : prediction.matches;

    if (!match) continue;

    const current = matchOddsMap.get(prediction.match_id) ?? [];
    current.push({
      predicted_a: prediction.predicted_a,
      predicted_b: prediction.predicted_b,
    });
    matchOddsMap.set(prediction.match_id, current);
  }

  const computedOddsByMatchId = new Map<number, MatchOdds>();
  for (const [matchId, matchPredictionList] of matchOddsMap.entries()) {
    computedOddsByMatchId.set(matchId, computeMatchOdds(matchPredictionList));
  }

  for (const prediction of relevantPredictions) {
    const match = Array.isArray(prediction.matches)
      ? prediction.matches[0]
      : prediction.matches;

    if (!match) continue;

    const odds = computedOddsByMatchId.get(prediction.match_id) ?? {
      one: 1,
      draw: 1,
      two: 1,
    };

    const points = getPredictionPoints(
      prediction.predicted_a,
      prediction.predicted_b,
      match.score_a,
      match.score_b,
      match.is_finished,
      match.phase,
      odds
    );

    const current = scoreMap.get(prediction.user_id) ?? 0;
    scoreMap.set(prediction.user_id, current + points);

    const userPhaseMap = phaseDetailsMap.get(prediction.user_id) ?? new Map<string, number>();
    userPhaseMap.set(match.phase, (userPhaseMap.get(match.phase) ?? 0) + points);
    phaseDetailsMap.set(prediction.user_id, userPhaseMap);
  }

  const rows = Array.from(scoreMap.entries())
    .map(([user_id, points]) => ({
      user_id,
      points,
      nickname: profileMap.get(user_id) ?? "Inconnu",
    }))
    .sort((a, b) => b.points - a.points);

  const detailsByUser: Record<string, ScoreBreakdown> = {};
  const phaseDetailsByUser: Record<string, PhaseDetailRow[]> = {};

  for (const [userId, phasePoints] of phaseDetailsMap.entries()) {
    const phaseRows = Array.from(phasePoints.entries()).map(([phase, points]) => ({
      phase,
      points,
      base: getPhasePointBase(phase),
    }));

    detailsByUser[userId] = getBreakdownForUser(phaseRows);
    phaseDetailsByUser[userId] = getPhaseDetails(phaseRows);
  }

  return {
    rows,
    detailsByUser,
    phaseDetailsByUser,
    message: rows.length ? "" : "Aucun score pour le moment.",
  };
}