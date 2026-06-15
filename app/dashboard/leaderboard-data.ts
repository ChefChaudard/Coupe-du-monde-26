import {
  computeMatchOdds,
  getPhasePointBase,
  getPredictionPoints,
  getTopScorerPoints,
  TOP_SCORER_POINTS,
  type MatchOdds,
} from "./scoring";

type MatchRow = {
  id: number;
  phase: string;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
  kickoff_at?: string | null;
};

type GroupStandingRow = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

type PredictionRow = {
  user_id: string;
  match_id: number;
  predicted_a: number;
  predicted_b: number;
  matches: MatchRow | MatchRow[] | null;
};

type KnockoutPredictionRow = {
  user_id: string;
  match_key: string;
  team_a: string | null;
  team_b: string | null;
  winner: string | null;
  round: string | null;
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
  groupPlacement: number;
  knockout: number;
  topScorer: number;
  real: number;
};

export type PhaseDetailRow = {
  phase: string;
  points: number;
  base: number;
};

export type ScoreReportRow =
  | {
  reportId: string;
      kind: "match";
  matchId: number;
      phase: string;
      label: string;
      points: number;
      base: number;
      odds: number;
      predictedScore: string;
      actualScore: string;
      predictedOutcome: string;
      actualOutcome: string;
    }
  | {
      reportId: string;
      kind: "groupPlacement";
      phase: string;
      label: string;
      points: number;
      base: number;
      odds: number;
      team: string;
      rank: number;
      participants: number;
      predictedCount: number;
    }
  | {
      reportId: string;
      kind: "knockoutPlacement";
      phase: string;
      label: string;
      points: number;
      base: number;
      odds: number;
      team: string;
      matchId: number;
      slotLabel: string;
      participants: number;
      predictedCount: number;
    }
  | {
      reportId: string;
      kind: "topScorer";
      phase: string;
      label: string;
      points: number;
      base: number;
      odds: number;
      player: string;
      participants: number;
      predictedCount: number;
    };

export type LeaderboardPayload = {
  rows: LeaderboardRow[];
  detailsByUser: Record<string, ScoreBreakdown>;
  groupPlacementPointsByUser: Record<string, number>;
  phaseDetailsByUser: Record<string, PhaseDetailRow[]>;
  scoreReportByUser: Record<string, ScoreReportRow[]>;
  message: string;
};

function getScoreBreakdownLabel(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("group")) return "Groupes";
  if (normalizedPhase.includes("buteur") || normalizedPhase.includes("scorer")) {
    return "Meilleur buteur";
  }
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
  return { group: 0, groupPlacement: 0, knockout: 0, topScorer: 0, real: 0 };
}

function getBreakdownForUser(rows: PhaseDetailRow[]) {
  return rows.reduce<ScoreBreakdown>((acc, row) => {
    const label = getScoreBreakdownLabel(row.phase);

    if (label === "Groupes") {
      acc.group += row.points;
      if (row.phase.toLowerCase().includes("classement")) {
        acc.groupPlacement += row.points;
      }
    } else if (label === "Meilleur buteur") {
      acc.topScorer += row.points;
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

function getOutcomeLabel(outcome: "A" | "D" | "B") {
  if (outcome === "A") return "Victoire équipe A";
  if (outcome === "B") return "Victoire équipe B";
  return "Match nul";
}

function getOutcomeFromScores(scoreA: number, scoreB: number) {
  if (scoreA > scoreB) return "A" as const;
  if (scoreA < scoreB) return "B" as const;
  return "D" as const;
}

const realPhasePrefix = "Reel - ";
const knockoutPhaseStartIds: Record<string, number> = {
  "16e de finale": 1,
  "8e de finale": 17,
  "Quarts de finale": 25,
  "Demi-finales": 29,
  Finale: 31,
};

const knockoutPhaseOrder = [
  "16e de finale",
  "8e de finale",
  "Quarts de finale",
  "Demi-finales",
  "Finale",
];

function fromRealPhase(phase: string) {
  return phase.startsWith(realPhasePrefix)
    ? phase.slice(realPhasePrefix.length)
    : phase;
}

function normalizeKnockoutTeam(value?: string | null) {
  if (!value) return "";
  return value.trim();
}

function normalizeKnockoutTeamKey(value?: string | null) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type StandingsMatch = {
  phase: string;
  team_a: string;
  team_b: string;
  score_a: number;
  score_b: number;
};

type KnockoutMatchInfo = MatchRow & { id: number };

const TOP_SCORER_MATCH_KEY = "top_scorer";
const TOP_SCORER_PHASE = "Meilleur buteur";

function normalizePlayerName(value?: string | null) {
  if (!value) return "";

  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildActualTopScorer(matches: MatchRow[]) {
  const topScorerMatch = matches.find((match) => {
    const normalizedPhase = fromRealPhase(match.phase).toLowerCase();
    return normalizedPhase.includes("buteur") || normalizedPhase.includes("scorer");
  });

  return normalizePlayerName(topScorerMatch?.team_a ?? topScorerMatch?.team_b);
}

function buildTopScorerParticipationCounts(predictions: KnockoutPredictionRow[]) {
  const participants = new Set<string>();
  const playerParticipants = new Map<string, Set<string>>();

  for (const prediction of predictions) {
    if (prediction.match_key !== TOP_SCORER_MATCH_KEY) continue;

    const selectedPlayer = normalizePlayerName(prediction.team_a ?? prediction.winner);
    if (!selectedPlayer) continue;

    participants.add(prediction.user_id);

    const currentParticipants = playerParticipants.get(selectedPlayer) ?? new Set<string>();
    currentParticipants.add(prediction.user_id);
    playerParticipants.set(selectedPlayer, currentParticipants);
  }

  return { participants, playerParticipants };
}

function buildKnockoutMatchInfo(matches: MatchRow[]) {
  const groupedMatches = matches.reduce<Record<string, MatchRow[]>>((acc, match) => {
    if (!match.phase.startsWith(realPhasePrefix)) return acc;

    const phase = fromRealPhase(match.phase);
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(match);
    return acc;
  }, {});

  const result: Record<number, KnockoutMatchInfo> = {};

  for (const phase of knockoutPhaseOrder) {
    const phaseMatches = groupedMatches[phase];
    const startId = knockoutPhaseStartIds[phase];

    if (!phaseMatches || !startId) continue;

    phaseMatches
      .slice()
      .sort((a, b) => {
        const kickoffDiff =
          new Date(a.kickoff_at ?? "").getTime() - new Date(b.kickoff_at ?? "").getTime();
        if (kickoffDiff !== 0) return kickoffDiff;
        return a.id - b.id;
      })
      .forEach((match, index) => {
        result[startId + index] = {
          ...match,
          id: startId + index,
        };
      });
  }

  return result;
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

function buildKnockoutTeamOddsByPhase(predictions: KnockoutPredictionRow[]) {
  const participantsByPhase = new Map<string, Set<string>>();
  const teamParticipantsByPhase = new Map<string, Map<string, Set<string>>>();
  const totalPlayersCount = new Set(predictions.map((prediction) => prediction.user_id)).size;

  for (const prediction of predictions) {
    if (!prediction.round) continue;

    const phase = fromRealPhase(prediction.round);
    if (!knockoutPhaseOrder.includes(phase)) continue;

    const teams = Array.from(
      new Set(
        [normalizeKnockoutTeam(prediction.team_a), normalizeKnockoutTeam(prediction.team_b)].filter(Boolean)
      )
    );

    if (teams.length === 0) continue;

    const phaseParticipants = participantsByPhase.get(phase) ?? new Set<string>();
    phaseParticipants.add(prediction.user_id);
    participantsByPhase.set(phase, phaseParticipants);

    const currentTeamParticipants = teamParticipantsByPhase.get(phase) ?? new Map<string, Set<string>>();

    for (const team of teams) {
      const teamParticipants = currentTeamParticipants.get(team) ?? new Set<string>();
      teamParticipants.add(prediction.user_id);
      currentTeamParticipants.set(team, teamParticipants);
    }

    teamParticipantsByPhase.set(phase, currentTeamParticipants);
  }

  const oddsByPhase: Record<string, Record<string, number>> = {};

  for (const [phase, teamParticipants] of teamParticipantsByPhase.entries()) {
    const coefficient = getKnockoutOddsCoefficient(phase);

    oddsByPhase[phase] = Object.fromEntries(
      Array.from(teamParticipants.entries()).map(([team, participants]) => [
        team,
        totalPlayersCount === 0
          ? 1
          : Math.max(
              1,
              Math.round((totalPlayersCount / Math.max(participants.size, 1)) * coefficient * 100) / 100
            ),
      ])
    );
  }

  return oddsByPhase;
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

function buildKnockoutPhaseParticipationCounts(predictions: KnockoutPredictionRow[]) {
  const participantsByPhase = new Map<string, Set<string>>();
  const teamParticipantsByPhase = new Map<string, Map<string, Set<string>>>();

  for (const prediction of predictions) {
    if (!prediction.round) continue;

    const phase = fromRealPhase(prediction.round);
    if (!knockoutPhaseOrder.includes(phase)) continue;

    const teams = Array.from(
      new Set(
        [normalizeKnockoutTeam(prediction.team_a), normalizeKnockoutTeam(prediction.team_b)].filter(Boolean)
      )
    );

    if (teams.length === 0) continue;

    const phaseParticipants = participantsByPhase.get(phase) ?? new Set<string>();
    phaseParticipants.add(prediction.user_id);
    participantsByPhase.set(phase, phaseParticipants);

    const currentTeamParticipants = teamParticipantsByPhase.get(phase) ?? new Map<string, Set<string>>();

    for (const team of teams) {
      const teamParticipants = currentTeamParticipants.get(team) ?? new Set<string>();
      teamParticipants.add(prediction.user_id);
      currentTeamParticipants.set(team, teamParticipants);
    }

    teamParticipantsByPhase.set(phase, currentTeamParticipants);
  }

  return { participantsByPhase, teamParticipantsByPhase };
}

function getPlacementPointsForTeam(
  selectedTeam: string,
  actualTeams: Array<string | undefined>,
  odds: number
) {
  if (!selectedTeam) return null;

  const selectedKey = normalizeKnockoutTeamKey(selectedTeam);

  return actualTeams.some((team) => normalizeKnockoutTeamKey(team) === selectedKey)
    ? Math.max(1, Math.round(odds * 100) / 100)
    : 0;
}

function sortStandings(rows: GroupStandingRow[]) {
  return rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.localeCompare(b.team);
  });
}

function buildStandingsByPhase(matches: StandingsMatch[]) {
  const standingsByPhase = new Map<string, Map<string, GroupStandingRow>>();

  for (const match of matches) {
    const phaseStandings = standingsByPhase.get(match.phase) ?? new Map<string, GroupStandingRow>();

    const getOrCreateTeam = (team: string) => {
      const existing = phaseStandings.get(team);

      if (existing) return existing;

      const created: GroupStandingRow = {
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };

      phaseStandings.set(team, created);
      return created;
    };

    const teamA = getOrCreateTeam(match.team_a);
    const teamB = getOrCreateTeam(match.team_b);

    teamA.played += 1;
    teamB.played += 1;
    teamA.goalsFor += match.score_a;
    teamA.goalsAgainst += match.score_b;
    teamB.goalsFor += match.score_b;
    teamB.goalsAgainst += match.score_a;

    if (match.score_a > match.score_b) {
      teamA.won += 1;
      teamB.lost += 1;
      teamA.points += 3;
    } else if (match.score_a < match.score_b) {
      teamB.won += 1;
      teamA.lost += 1;
      teamB.points += 3;
    } else {
      teamA.drawn += 1;
      teamB.drawn += 1;
      teamA.points += 1;
      teamB.points += 1;
    }

    teamA.goalDifference = teamA.goalsFor - teamA.goalsAgainst;
    teamB.goalDifference = teamB.goalsFor - teamB.goalsAgainst;

    standingsByPhase.set(match.phase, phaseStandings);
  }

  const result: Record<string, GroupStandingRow[]> = {};

  for (const [phase, phaseStandings] of standingsByPhase.entries()) {
    result[phase] = sortStandings(Array.from(phaseStandings.values()));
  }

  return result;
}

function buildPredictedStandingsByUserAndPhase(
  predictions: PredictionRow[]
) {
  const standingsByUser = new Map<string, Map<string, StandingsMatch[]>>();
  const participantUsersByPhase = new Map<string, Set<string>>();

  for (const prediction of predictions) {
    const match = Array.isArray(prediction.matches)
      ? prediction.matches[0]
      : prediction.matches;

    if (!match || !match.phase.toLowerCase().includes("group")) continue;
    if (!match.team_a || !match.team_b) continue;

    const userPhaseMap = standingsByUser.get(prediction.user_id) ?? new Map<string, StandingsMatch[]>();
    const phaseMatches = userPhaseMap.get(match.phase) ?? [];

    phaseMatches.push({
      phase: match.phase,
      team_a: match.team_a,
      team_b: match.team_b,
      score_a: prediction.predicted_a,
      score_b: prediction.predicted_b,
    });

    userPhaseMap.set(match.phase, phaseMatches);
    standingsByUser.set(prediction.user_id, userPhaseMap);

    const participantUsers = participantUsersByPhase.get(match.phase) ?? new Set<string>();
    participantUsers.add(prediction.user_id);
    participantUsersByPhase.set(match.phase, participantUsers);
  }

  const predictedStandingsByUser: Record<string, Record<string, GroupStandingRow[]>> = {};

  for (const [userId, phases] of standingsByUser.entries()) {
    predictedStandingsByUser[userId] = {};

    for (const [phase, phaseMatches] of phases.entries()) {
      predictedStandingsByUser[userId][phase] = buildStandingsByPhase(phaseMatches)[phase] ?? [];
    }
  }

  return { predictedStandingsByUser, participantUsersByPhase };
}

function computeGroupPlacementBonus(
  actualStandingsByPhase: Record<string, GroupStandingRow[]>,
  predictedStandingsByUser: Record<string, Record<string, GroupStandingRow[]>>,
  participantUsersByPhase: Map<string, Set<string>>
) {
  const bonusByUser = new Map<string, number>();
  const phaseBonusMap = new Map<string, Map<string, number>>();
  const reportByUser = new Map<string, ScoreReportRow[]>();
  const basePoints = getPhasePointBase("group");

  for (const [phase, actualRows] of Object.entries(actualStandingsByPhase)) {
    const participantUsers = participantUsersByPhase.get(phase);
    if (!participantUsers || participantUsers.size === 0) continue;

    const predictedCountByRank = new Map<number, Map<string, number>>();

    for (const userId of participantUsers) {
      const predictedRows = predictedStandingsByUser[userId]?.[phase];
      if (!predictedRows) continue;

      predictedRows.forEach((row, index) => {
        const rank = index + 1;
        const rankCounts = predictedCountByRank.get(rank) ?? new Map<string, number>();
        rankCounts.set(row.team, (rankCounts.get(row.team) ?? 0) + 1);
        predictedCountByRank.set(rank, rankCounts);
      });
    }

    actualRows.forEach((actualRow, index) => {
      const rank = index + 1;
      const predictedCount = predictedCountByRank.get(rank)?.get(actualRow.team) ?? 0;

      if (predictedCount === 0) return;

      const bonusPoints = Math.round((basePoints * (participantUsers.size / predictedCount)) * 100) / 100;
      const bonusPhaseLabel = `${phase} - classement`;

      for (const userId of participantUsers) {
        const predictedRows = predictedStandingsByUser[userId]?.[phase];
        if (!predictedRows || predictedRows[index]?.team !== actualRow.team) continue;

        bonusByUser.set(userId, (bonusByUser.get(userId) ?? 0) + bonusPoints);

        const userPhaseMap = phaseBonusMap.get(userId) ?? new Map<string, number>();
        userPhaseMap.set(bonusPhaseLabel, (userPhaseMap.get(bonusPhaseLabel) ?? 0) + bonusPoints);
        phaseBonusMap.set(userId, userPhaseMap);

        const reportRows = reportByUser.get(userId) ?? [];
        reportRows.push({
          reportId: `groupPlacement-${phase}-${actualRow.team}-${index + 1}`,
          kind: "groupPlacement",
          phase,
          label: `${actualRow.team} bien classée à la place ${index + 1}`,
          points: bonusPoints,
          base: basePoints,
          odds: Math.round((participantUsers.size / predictedCount) * 100) / 100,
          team: actualRow.team,
          rank: index + 1,
          participants: participantUsers.size,
          predictedCount,
        });
        reportByUser.set(userId, reportRows);
      }
    });
  }

  return { bonusByUser, phaseBonusMap, reportByUser };
}

export function computeLeaderboardData(
  predictions: PredictionRow[],
  profiles: ProfileRow[],
  groupMemberIds: Set<string> | null,
  knockoutPredictions: KnockoutPredictionRow[] = [],
  matches: MatchRow[] = []
): LeaderboardPayload {
  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile.nickname ?? "Inconnu"])
  );

  const scoreMap = new Map<string, number>();
  const phaseDetailsMap = new Map<string, Map<string, number>>();
  const scoreReportMap = new Map<string, ScoreReportRow[]>();
  const matchOddsMap = new Map<number, { predicted_a: number; predicted_b: number }[]>();
  const uniqueMatchesById = new Map<number, MatchRow>();

  const isGroupFilterActive = groupMemberIds !== null;
  const relevantPredictions = predictions.filter((prediction) =>
    isGroupFilterActive ? groupMemberIds.has(prediction.user_id) : true
  );

  for (const prediction of relevantPredictions) {
    const match = Array.isArray(prediction.matches)
      ? prediction.matches[0]
      : prediction.matches;

    if (!match) continue;

    uniqueMatchesById.set(prediction.match_id, match);

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

  const knockoutMatchInfoById = buildKnockoutMatchInfo(matches);
  const actualTeamsByPhase = buildActualTeamsByPhase(matches);
  const knockoutTeamOddsByPhase = buildKnockoutTeamOddsByPhase(knockoutPredictions);
  const knockoutParticipationCounts = buildKnockoutPhaseParticipationCounts(knockoutPredictions);
  const actualTopScorer = buildActualTopScorer(matches);
  const topScorerParticipationCounts = buildTopScorerParticipationCounts(knockoutPredictions);

  const allGroupMatchesByPhase = new Map<string, MatchRow[]>();

  for (const match of uniqueMatchesById.values()) {
    if (!match.phase.toLowerCase().includes("group")) continue;
    if (!match.team_a || !match.team_b) continue;

    const phaseMatches = allGroupMatchesByPhase.get(match.phase) ?? [];
    phaseMatches.push(match);
    allGroupMatchesByPhase.set(match.phase, phaseMatches);
  }

  const { predictedStandingsByUser, participantUsersByPhase } = buildPredictedStandingsByUserAndPhase(
    relevantPredictions
  );

  const completedGroupMatches: StandingsMatch[] = [];

  for (const [phase, phaseMatches] of allGroupMatchesByPhase.entries()) {
    const teamsInPhase = new Set<string>();
    for (const match of phaseMatches) {
      if (match.team_a) teamsInPhase.add(match.team_a);
      if (match.team_b) teamsInPhase.add(match.team_b);
    }

    const finishedMatches = phaseMatches.filter(
      (match) => match.is_finished && match.score_a !== null && match.score_b !== null
    );

    const playedCountByTeam = new Map<string, number>();
    for (const match of finishedMatches) {
      if (match.team_a) playedCountByTeam.set(match.team_a, (playedCountByTeam.get(match.team_a) ?? 0) + 1);
      if (match.team_b) playedCountByTeam.set(match.team_b, (playedCountByTeam.get(match.team_b) ?? 0) + 1);
    }

    // Un groupe n'est pris en compte que si TOUTES ses equipes ont dispute au
    // moins un match ET ont joue le meme nombre de rencontres.
    const playedCounts = Array.from(teamsInPhase).map(
      (team) => playedCountByTeam.get(team) ?? 0
    );
    const everyTeamPlayedSameCount =
      teamsInPhase.size > 0 &&
      playedCounts.every((count) => count >= 1) &&
      playedCounts.every((count) => count === playedCounts[0]);

    if (!everyTeamPlayedSameCount) continue;

    for (const match of finishedMatches) {
      completedGroupMatches.push({
        phase,
        team_a: match.team_a as string,
        team_b: match.team_b as string,
        score_a: match.score_a as number,
        score_b: match.score_b as number,
      });
    }
  }

  const actualGroupStandingsByPhase = buildStandingsByPhase(completedGroupMatches);

  const groupBonus = computeGroupPlacementBonus(
    actualGroupStandingsByPhase,
    predictedStandingsByUser,
    participantUsersByPhase
  );

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

    if (points > 0) {
      const predictedOutcome = getOutcomeFromScores(prediction.predicted_a, prediction.predicted_b);
      const actualOutcome = getOutcomeFromScores(match.score_a ?? 0, match.score_b ?? 0);
      const oddsUsed =
        predictedOutcome === "A"
          ? odds.one
          : predictedOutcome === "B"
            ? odds.two
            : odds.draw;

      const reportRows = scoreReportMap.get(prediction.user_id) ?? [];
      reportRows.push({
        reportId: `match-${prediction.match_id}`,
        kind: "match",
        matchId: prediction.match_id,
        phase: match.phase,
        label: `${match.team_a ?? "Equipe A"} vs ${match.team_b ?? "Equipe B"}`,
        points,
        base: getPhasePointBase(match.phase),
        odds: oddsUsed,
        predictedScore: `${prediction.predicted_a}-${prediction.predicted_b}`,
        actualScore: `${match.score_a ?? 0}-${match.score_b ?? 0}`,
        predictedOutcome: getOutcomeLabel(predictedOutcome),
        actualOutcome: getOutcomeLabel(actualOutcome),
      });
      scoreReportMap.set(prediction.user_id, reportRows);
    }
  }

  for (const prediction of knockoutPredictions) {
    if (prediction.match_key === TOP_SCORER_MATCH_KEY) {
      continue;
    }

    const matchId = Number(prediction.match_key);
    if (!Number.isFinite(matchId)) continue;

    const matchInfo = knockoutMatchInfoById[matchId];
    const phase = prediction.round ? fromRealPhase(prediction.round) : matchInfo ? fromRealPhase(matchInfo.phase) : null;
    if (!phase || !actualTeamsByPhase[phase]) {
      continue;
    }

    const basePoints = getPhasePointBase(phase);
    const actualTeams = actualTeamsByPhase[phase] ?? [];
    const selectedTeamA = normalizeKnockoutTeam(prediction.team_a);
    const selectedTeamB = normalizeKnockoutTeam(prediction.team_b);

    const teamAPoints = getPlacementPointsForTeam(
      selectedTeamA,
      actualTeams,
      knockoutTeamOddsByPhase[phase]?.[selectedTeamA] ?? 1
    );
    const teamBPoints = getPlacementPointsForTeam(
      selectedTeamB,
      actualTeams,
      knockoutTeamOddsByPhase[phase]?.[selectedTeamB] ?? 1
    );

    const reportRows = scoreReportMap.get(prediction.user_id) ?? [];
    const participants = knockoutParticipationCounts.participantsByPhase.get(phase)?.size ?? 0;
    const teamParticipants = knockoutParticipationCounts.teamParticipantsByPhase.get(phase)?.get(selectedTeamA)?.size ?? 0;

    if (teamAPoints !== null && teamAPoints > 0) {
      const odds = knockoutTeamOddsByPhase[phase]?.[selectedTeamA] ?? 1;
      reportRows.push({
        reportId: `knockoutPlacement-${prediction.user_id}-${matchId}-a`,
        kind: "knockoutPlacement",
        phase,
        label: `${selectedTeamA} bien placé en ${phase}`,
        points: teamAPoints,
        base: basePoints,
        odds,
        team: selectedTeamA,
        matchId,
        slotLabel: "Equipe A",
        participants,
        predictedCount: teamParticipants,
      });
      scoreMap.set(prediction.user_id, (scoreMap.get(prediction.user_id) ?? 0) + teamAPoints);
      const userPhaseMap = phaseDetailsMap.get(prediction.user_id) ?? new Map<string, number>();
      userPhaseMap.set(phase, (userPhaseMap.get(phase) ?? 0) + teamAPoints);
      phaseDetailsMap.set(prediction.user_id, userPhaseMap);
    }

    if (teamBPoints !== null && teamBPoints > 0) {
      const odds = knockoutTeamOddsByPhase[phase]?.[selectedTeamB] ?? 1;
      const teamBParticipants = knockoutParticipationCounts.teamParticipantsByPhase.get(phase)?.get(selectedTeamB)?.size ?? 0;
      reportRows.push({
        reportId: `knockoutPlacement-${prediction.user_id}-${matchId}-b`,
        kind: "knockoutPlacement",
        phase,
        label: `${selectedTeamB} bien placé en ${phase}`,
        points: teamBPoints,
        base: basePoints,
        odds,
        team: selectedTeamB,
        matchId,
        slotLabel: "Equipe B",
        participants,
        predictedCount: teamBParticipants,
      });
      scoreMap.set(prediction.user_id, (scoreMap.get(prediction.user_id) ?? 0) + teamBPoints);
      const userPhaseMap = phaseDetailsMap.get(prediction.user_id) ?? new Map<string, number>();
      userPhaseMap.set(phase, (userPhaseMap.get(phase) ?? 0) + teamBPoints);
      phaseDetailsMap.set(prediction.user_id, userPhaseMap);
    }

    if (reportRows.length > 0) {
      scoreReportMap.set(prediction.user_id, reportRows);
    }
  }

  for (const prediction of knockoutPredictions) {
    if (prediction.match_key !== TOP_SCORER_MATCH_KEY) continue;

    const selectedPlayer = prediction.team_a ?? prediction.winner;
    if (!selectedPlayer || !actualTopScorer) continue;

    const points = getTopScorerPoints(selectedPlayer, actualTopScorer);
    if (points <= 0) continue;

    const normalizedPlayer = normalizePlayerName(selectedPlayer);
    const participants = topScorerParticipationCounts.participants.size;
    const predictedCount = topScorerParticipationCounts.playerParticipants.get(normalizedPlayer)?.size ?? 0;

    scoreMap.set(prediction.user_id, (scoreMap.get(prediction.user_id) ?? 0) + points);

    const userPhaseMap = phaseDetailsMap.get(prediction.user_id) ?? new Map<string, number>();
    userPhaseMap.set(TOP_SCORER_PHASE, (userPhaseMap.get(TOP_SCORER_PHASE) ?? 0) + points);
    phaseDetailsMap.set(prediction.user_id, userPhaseMap);

    const reportRows = scoreReportMap.get(prediction.user_id) ?? [];
    reportRows.push({
      reportId: `topScorer-${prediction.user_id}`,
      kind: "topScorer",
      phase: TOP_SCORER_PHASE,
      label: `${selectedPlayer} meilleur buteur`,
      points,
      base: 1,
      odds: TOP_SCORER_POINTS,
      player: selectedPlayer,
      participants,
      predictedCount,
    });
    scoreReportMap.set(prediction.user_id, reportRows);
  }

  for (const [userId, bonusPoints] of groupBonus.bonusByUser.entries()) {
    scoreMap.set(userId, (scoreMap.get(userId) ?? 0) + bonusPoints);

    const userPhaseMap = phaseDetailsMap.get(userId) ?? new Map<string, number>();
    for (const [phase, points] of (groupBonus.phaseBonusMap.get(userId) ?? new Map<string, number>()).entries()) {
      userPhaseMap.set(phase, (userPhaseMap.get(phase) ?? 0) + points);
    }
    phaseDetailsMap.set(userId, userPhaseMap);

    const reportRows = scoreReportMap.get(userId) ?? [];
    for (const reportRow of groupBonus.reportByUser.get(userId) ?? []) {
      reportRows.push(reportRow);
    }
    scoreReportMap.set(userId, reportRows);
  }

  const rows = Array.from(scoreMap.entries())
    .map(([user_id, points]) => ({
      user_id,
      points,
      nickname: profileMap.get(user_id) ?? "Inconnu",
    }))
    .sort((a, b) => b.points - a.points);

  const detailsByUser: Record<string, ScoreBreakdown> = {};
  const groupPlacementPointsByUser: Record<string, number> = {};
  const phaseDetailsByUser: Record<string, PhaseDetailRow[]> = {};
  const scoreReportByUser: Record<string, ScoreReportRow[]> = {};

  for (const [userId, phasePoints] of phaseDetailsMap.entries()) {
    const phaseRows = Array.from(phasePoints.entries()).map(([phase, points]) => ({
      phase,
      points,
      base: getPhasePointBase(phase),
    }));

    detailsByUser[userId] = getBreakdownForUser(phaseRows);
    groupPlacementPointsByUser[userId] = phaseRows
      .filter((row) => row.phase.toLowerCase().includes("classement"))
      .reduce((sum, row) => sum + row.points, 0);
    phaseDetailsByUser[userId] = getPhaseDetails(phaseRows);
    scoreReportByUser[userId] = (scoreReportMap.get(userId) ?? []).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.label.localeCompare(b.label);
    });
  }

  return {
    rows,
    detailsByUser,
    groupPlacementPointsByUser,
    phaseDetailsByUser,
    scoreReportByUser,
    message: rows.length ? "" : "Aucun score pour le moment.",
  };
}