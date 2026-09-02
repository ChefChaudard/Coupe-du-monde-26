export type MatchOdds = {
  one: number;
  draw: number;
  two: number;
};

export type PredictionMatch = {
  predicted_a: number;
  predicted_b: number;
};

function normalizeSelection(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export const TOP_SCORER_POINTS = 20;

// `actualPlayers` accepte un seul nom (retro-compatibilite) ou une liste de
// joueurs en cas d'ex-aequo pour le titre de meilleur buteur.
export function getTopScorerPoints(
  predictedPlayer: string | null,
  actualPlayers: string | string[] | null
) {
  if (!predictedPlayer || !actualPlayers) return 0;
  const actualList = Array.isArray(actualPlayers) ? actualPlayers : [actualPlayers];
  if (actualList.length === 0) return 0;
  const normalizedPredicted = normalizeSelection(predictedPlayer);
  return actualList.some((actual) => normalizeSelection(actual) === normalizedPredicted)
    ? TOP_SCORER_POINTS
    : 0;
}

// Conserve pour l'affichage (report de points) et pour l'ancien systeme de
// placement equipes (knockout_predictions). Le calcul des points de match
// (getPredictionPoints) n'utilise plus cette base depuis le passage a la
// formule "1x / 2x la cote".
export function getPhasePointBase(phase: string) {
  const normalizedPhase = phase.toLowerCase();
  if (normalizedPhase.includes("group")) return 1; // WC26 - phase de groupes (legacy)
  if (normalizedPhase.includes("phase de ligue")) return 1; // CL26 - phase de ligue
  if (normalizedPhase.includes("barrage")) return 1; // CL26 - barrage aller-retour
  if (normalizedPhase.includes("8e") || normalizedPhase.includes("quart")) return 2; // CL26 - 8e de finale = 1er tour du tableau, puis quarts
  if (normalizedPhase.includes("demi") || normalizedPhase.includes("finale")) return 3;
  if (normalizedPhase.includes("vainqueur")) return 4;
  return 1;
}

export function computeMatchOdds(matchPredictions: PredictionMatch[]): MatchOdds {
  const counts = {
    one: 0,
    draw: 0,
    two: 0,
  };
  for (const prediction of matchPredictions) {
    if (prediction.predicted_a > prediction.predicted_b) {
      counts.one += 1;
    } else if (prediction.predicted_a < prediction.predicted_b) {
      counts.two += 1;
    } else {
      counts.draw += 1;
    }
  }
  const total = counts.one + counts.draw + counts.two;
  if (total === 0) {
    return { one: 1, draw: 1, two: 1 };
  }
  const toOdds = (count: number) => {
    const raw = total / Math.max(count, 1);
    return Math.max(1, Math.round(raw * 100) / 100);
  };
  return {
    one: toOdds(counts.one),
    draw: toOdds(counts.draw),
    two: toOdds(counts.two),
  };
}

export type BookmakerOdds = {
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
};

export function getMatchOdds(match: BookmakerOdds): MatchOdds {
  return {
    one: match.odds_home ?? 1,
    draw: match.odds_draw ?? 1,
    two: match.odds_away ?? 1,
  };
}

// Formule de points par match (1er tour, barrages, et 2e tour reel confondus) :
// - issue (1/N/2) incorrecte : 0 point
// - issue correcte : 1 x la cote de cette issue
// - score exact trouve : 2 x la cote de cette issue (au lieu de 1x)
// Le parametre `phase` n'influence plus le calcul (conserve pour compatibilite
// de signature avec les appelants existants).
export function getPredictionPoints(
  predictedA: number,
  predictedB: number,
  actualA: number | null,
  actualB: number | null,
  isFinished: boolean | null,
  _phase: string,
  odds: MatchOdds
) {
  if (!isFinished || actualA === null || actualB === null) return 0;

  const predictedOutcome =
    predictedA > predictedB ? "A" : predictedA < predictedB ? "B" : "D";
  const actualOutcome =
    actualA > actualB ? "A" : actualA < actualB ? "B" : "D";

  if (predictedOutcome !== actualOutcome) return 0;

  const cote =
    predictedOutcome === "A" ? odds.one : predictedOutcome === "B" ? odds.two : odds.draw;

  const isExactScore = predictedA === actualA && predictedB === actualB;
  const multiplier = isExactScore ? 2 : 1;

  return Math.round(multiplier * cote * 100) / 100;
}

// ----- Classement equipes (1-36), CL26 -----

export type LeagueZone = "8emes" | "barrages" | "eliminees";

export function getLeagueZoneForRank(rank: number): LeagueZone {
  if (rank <= 8) return "8emes";
  if (rank <= 24) return "barrages";
  return "eliminees";
}

export const TEAM_RANKING_ZONE_POINTS = 3;
export const TEAM_RANKING_EXACT_POINTS = 6;

export function getTeamRankingPoints(
  predictedPosition: number,
  actualRank: number | undefined
) {
  if (!actualRank) return 0;
  if (predictedPosition === actualRank) return TEAM_RANKING_EXACT_POINTS;
  if (getLeagueZoneForRank(predictedPosition) === getLeagueZoneForRank(actualRank)) {
    return TEAM_RANKING_ZONE_POINTS;
  }
  return 0;
}

type LeagueMatchForRanking = {
  phase: string;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

// Classement reel des 36 equipes de la phase de ligue (points / diff de buts
// / buts marques), utilise pour noter le pronostic de classement 1-36. Meme
// logique que computeRealRanking dans app/knockout/page.tsx.
export function computeLeagueRealRanking(
  matches: LeagueMatchForRanking[]
): Record<string, number> {
  type Standing = {
    team: string;
    points: number;
    goalDifference: number;
    goalsFor: number;
  };

  const statsByTeam = new Map<string, Standing>();

  const ensureTeam = (team: string) => {
    if (!statsByTeam.has(team)) {
      statsByTeam.set(team, { team, points: 0, goalDifference: 0, goalsFor: 0 });
    }
    return statsByTeam.get(team)!;
  };

  for (const match of matches) {
    if (match.phase !== "Phase de ligue") continue;
    if (!match.team_a || !match.team_b) continue;

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

// ----- Qualifies (quarts / demi / finale / vainqueur), CL26 -----

export const QUALIFIES_HUITIEMES_POINTS = 3;
export const QUALIFIES_QUARTS_POINTS = 6;
export const QUALIFIES_DEMI_POINTS = 6;
export const QUALIFIES_FINALE_POINTS = 12;
export const QUALIFIES_VAINQUEUR_POINTS = 12;

export function getQualifiesTierPoints(groupName: string) {
  if (groupName === "8emes de finale") return QUALIFIES_HUITIEMES_POINTS;
  if (groupName === "Quarts de finale") return QUALIFIES_QUARTS_POINTS;
  if (groupName === "Demi-finales") return QUALIFIES_DEMI_POINTS;
  if (groupName === "Finale") return QUALIFIES_FINALE_POINTS;
  if (groupName === "Vainqueur") return QUALIFIES_VAINQUEUR_POINTS;
  return 0;
}

type KnockoutMatchForQualifies = {
  phase: string;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

export type RealQualifiesTeams = {
  huitiemes: Set<string>;
  quarts: Set<string>;
  demi: Set<string>;
  finale: Set<string>;
  vainqueur: string | null;
};

// Equipes reellement presentes en quarts / demi / finale, et vainqueur reel
// de la finale, deduits directement de la table matches (une equipe apparait
// dans une phase des qu'un match de cette phase est cree pour elle).
export function computeRealTeamsByTier(
  matches: KnockoutMatchForQualifies[]
): RealQualifiesTeams {
  const huitiemes = new Set<string>();
  const quarts = new Set<string>();
  const demi = new Set<string>();
  const finale = new Set<string>();
  let vainqueur: string | null = null;
  for (const match of matches) {
    if (match.phase === "8e de finale") {
      if (match.team_a) huitiemes.add(match.team_a);
      if (match.team_b) huitiemes.add(match.team_b);
    } else if (match.phase === "Quarts de finale") {
      if (match.team_a) quarts.add(match.team_a);
      if (match.team_b) quarts.add(match.team_b);
    } else if (match.phase === "Demi-finales") {
      if (match.team_a) demi.add(match.team_a);
      if (match.team_b) demi.add(match.team_b);
    } else if (match.phase === "Finale") {
      if (match.team_a) finale.add(match.team_a);
      if (match.team_b) finale.add(match.team_b);
      if (
        match.is_finished &&
        match.score_a !== null &&
        match.score_b !== null &&
        match.score_a !== match.score_b &&
        match.team_a &&
        match.team_b
      ) {
        vainqueur = match.score_a > match.score_b ? match.team_a : match.team_b;
      }
    }
  }
  return { huitiemes, quarts, demi, finale, vainqueur };
}
