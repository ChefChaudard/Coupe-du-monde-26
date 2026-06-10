import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const target = {
  email: "fabtrash49@gmail.com",
  password: "test1234",
  nickname: "Mme Claude",
  firstName: "Madame",
  lastName: "Claude",
};

const defaultGroupName = "7eme WC2026";
// Meilleur buteur: favori des cotes externes (France va loin, tireur de penalty).
const topScorer = "Kylian Mbappe";

// --- Modele de force (proxy des cotes externes / probabilites bookmakers) ---
const strengthEntries = [
  ["France", 100],
  ["Brésil", 99],
  ["Brazil", 99],
  ["Espagne", 98],
  ["Angleterre", 97],
  ["England", 97],
  ["Argentine", 96],
  ["Portugal", 95],
  ["Allemagne", 94],
  ["Germany", 94],
  ["Pays-Bas", 93],
  ["Netherlands", 93],
  ["Belgique", 92],
  ["Uruguay", 91],
  ["Croatie", 90],
  ["Colombie", 89],
  ["Suisse", 88],
  ["Japon", 87],
  ["Japan", 87],
  ["Maroc", 86],
  ["Morocco", 86],
  ["Mexique", 85],
  ["Mexico", 85],
  ["USA", 84],
  ["Canada", 83],
  ["Ecuador", 82],
  ["Équateur", 82],
  ["Autriche", 81],
  ["Senegal", 80],
  ["Norvège", 79],
  ["Coree du Sud", 78],
  ["Corée du Sud", 78],
  ["Suède", 77],
  ["Australie", 77],
  ["Australia", 77],
  ["Algerie", 76],
  ["Tchequie", 75],
  ["Tchéquie", 75],
  ["Afrique du Sud", 74],
  ["Tunisie", 73],
  ["Qatar", 73],
  ["Bosnie-Herzégovine", 72],
  ["Cote d'Ivoire", 71],
  ["Côte d'Ivoire", 71],
  ["Ghana", 70],
  ["Egypte", 69],
  ["Égypte", 69],
  ["Iran", 68],
  ["Nouvelle-Zelande", 67],
  ["Nouvelle-Zélande", 67],
  ["Turkiye", 66],
  ["Türkiye", 66],
  ["Paraguay", 65],
  ["Arabie Saoudite", 64],
  ["Cabo Verde", 63],
  ["Congo DR", 62],
  ["Ouzbekistan", 61],
  ["Ouzbékistan", 61],
  ["Irak", 60],
  ["Haiti", 59],
  ["Haïti", 59],
  ["Ecosse", 58],
  ["Écosse", 58],
  ["Jordanie", 57],
  ["Panama", 56],
  ["Curaçao", 55],
];

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const strengthByTeam = new Map(
  strengthEntries.map(([team, strength]) => [normalizeKey(team), strength])
);

function teamStrength(team) {
  return strengthByTeam.get(normalizeKey(team)) ?? 50;
}

// --- Probabilites reelles (proxy cotes externes) via modele type ELO ---
function ratingOf(team) {
  return teamStrength(team) * 20;
}

// Esperance ELO pour l'equipe A dans [0,1] (sans nul).
function expectA(teamA, teamB) {
  const diff = ratingOf(teamA) - ratingOf(teamB);
  return 1 / (1 + Math.pow(10, -diff / 400));
}

// Probabilites 1 / N / 2 pour un match de groupe.
function groupProbs(teamA, teamB) {
  const e = expectA(teamA, teamB);
  const pDraw = 0.26 * (1 - Math.abs(2 * e - 1));
  return {
    pA: (1 - pDraw) * e,
    pDraw,
    pB: (1 - pDraw) * (1 - e),
  };
}

// Probabilite que A se qualifie sur un match a elimination directe.
function advanceProb(teamA, teamB) {
  return expectA(teamA, teamB);
}

// --- Cotes du site ---
function knockoutCoefficient(phase) {
  const p = String(phase).toLowerCase();
  if (p.includes("16e")) return 2;
  if (p.includes("8e")) return 2;
  if (p.includes("quart")) return 3;
  if (p.includes("demi")) return 3;
  if (p.includes("finale")) return 3;
  return 1;
}

function groupOddsFromCounts(counts) {
  const total = counts.one + counts.draw + counts.two;
  if (total === 0) return { one: 1, draw: 1, two: 1 };
  const toOdds = (c) => Math.max(1, Math.round((total / Math.max(c, 1)) * 100) / 100);
  return {
    one: toOdds(counts.one),
    draw: toOdds(counts.draw),
    two: toOdds(counts.two),
  };
}

// --- Choix d'issue de groupe : esperance equilibree ---
// Defaut = issue la plus probable. Bascule sur une autre issue uniquement si
// elle a une proba decente (>= 30%) ET la meilleure esperance (proba x cote site).
const GROUP_PROBABILITY_FLOOR = 0.3;

function chooseGroupOutcome(teamA, teamB, odds) {
  const { pA, pDraw, pB } = groupProbs(teamA, teamB);
  const options = [
    { key: "A", p: pA, odds: odds.one },
    { key: "D", p: pDraw, odds: odds.draw },
    { key: "B", p: pB, odds: odds.two },
  ];

  let eligible = options.filter((o) => o.p >= GROUP_PROBABILITY_FLOOR);
  if (eligible.length === 0) {
    eligible = [options.reduce((best, o) => (o.p > best.p ? o : best))];
  }

  return eligible.reduce((best, o) => (o.p * o.odds > best.p * best.odds ? o : best)).key;
}

function winScoreByDiff(absDiff) {
  if (absDiff >= 18) return [2, 0];
  if (absDiff >= 10) return [2, 1];
  return [1, 0];
}

function scorelineFor(teamA, teamB, outcome) {
  if (outcome === "D") return [1, 1];

  const diff = teamStrength(teamA) - teamStrength(teamB);
  const absDiff = Math.abs(diff);
  const favoredA = diff >= 0;

  if (outcome === "A") {
    return favoredA ? winScoreByDiff(absDiff) : [2, 1];
  }
  // outcome === "B"
  const winning = !favoredA ? winScoreByDiff(absDiff) : [2, 1];
  return [winning[1], winning[0]];
}

function buildBracketEntries(groupStandings) {
  const get = (group, rank) => groupStandings[group]?.[rank - 1]?.team ?? "";

  return [
    [1, get("A", 1), get("L", 3)],
    [2, get("B", 1), get("K", 3)],
    [3, get("C", 1), get("J", 3)],
    [4, get("D", 1), get("I", 3)],
    [5, get("E", 1), get("H", 3)],
    [6, get("F", 1), get("G", 3)],
    [7, get("G", 1), get("F", 2)],
    [8, get("H", 1), get("E", 2)],
    [9, get("A", 2), get("L", 2)],
    [10, get("B", 2), get("K", 2)],
    [11, get("C", 2), get("J", 2)],
    [12, get("D", 2), get("I", 2)],
    [13, get("E", 2), get("H", 2)],
    [14, get("F", 2), get("G", 2)],
    [15, get("A", 3), get("C", 3)],
    [16, get("B", 3), get("D", 3)],
  ].map(([matchKey, teamA, teamB]) => ({ matchKey, teamA, teamB }));
}

function groupKey(phase) {
  return String(phase).replace(/^Groupe\s+/i, "").trim();
}

async function findOrCreateUser() {
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });

  if (usersError) throw usersError;

  const existingUser = usersData.users.find(
    (user) => normalizeKey(user.email) === normalizeKey(target.email)
  );

  if (existingUser) {
    const { error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      email: target.email,
      password: target.password,
      email_confirm: true,
      user_metadata: {
        first_name: target.firstName,
        last_name: target.lastName,
      },
    });

    if (error) throw error;

    return existingUser.id;
  }

  const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
    email: target.email,
    password: target.password,
    email_confirm: true,
    user_metadata: {
      first_name: target.firstName,
      last_name: target.lastName,
    },
  });

  if (createError || !createdUser.user) {
    throw createError ?? new Error("Impossible de créer le compte.");
  }

  return createdUser.user.id;
}

// Charge la distribution des pronostics des autres joueurs (cotes du site).
async function loadCrowdData(mmeUserId, matchById) {
  const { data: preds, error: predsError } = await supabase
    .from("predictions")
    .select("user_id, match_id, predicted_a, predicted_b");
  if (predsError) throw predsError;

  const { data: ko, error: koError } = await supabase
    .from("knockout_predictions")
    .select("user_id, match_key, round, team_a, team_b");
  if (koError) throw koError;

  // Cotes de groupe par match.
  const countsByMatch = new Map();
  for (const p of preds ?? []) {
    if (p.user_id === mmeUserId) continue;
    const match = matchById.get(p.match_id);
    if (!match || !String(match.phase).toLowerCase().includes("group")) continue;
    const rec = countsByMatch.get(p.match_id) ?? { one: 0, draw: 0, two: 0 };
    if (p.predicted_a > p.predicted_b) rec.one += 1;
    else if (p.predicted_a < p.predicted_b) rec.two += 1;
    else rec.draw += 1;
    countsByMatch.set(p.match_id, rec);
  }
  const groupOddsByMatch = new Map();
  for (const [matchId, counts] of countsByMatch.entries()) {
    groupOddsByMatch.set(matchId, groupOddsFromCounts(counts));
  }

  // Cotes de knockout par phase / equipe.
  const koUsers = new Set();
  const koPhaseTeamCount = new Map(); // phase -> Map(normTeam -> Set(userId))
  for (const k of ko ?? []) {
    if (k.user_id === mmeUserId) continue;
    if (!k.round) continue;
    if (k.match_key === "top_scorer" || k.match_key === "champion") continue;
    koUsers.add(k.user_id);
    const phaseMap = koPhaseTeamCount.get(k.round) ?? new Map();
    for (const t of [k.team_a, k.team_b]) {
      if (!t) continue;
      const key = normalizeKey(t);
      const set = phaseMap.get(key) ?? new Set();
      set.add(k.user_id);
      phaseMap.set(key, set);
    }
    koPhaseTeamCount.set(k.round, phaseMap);
  }

  return {
    groupOddsByMatch,
    koTotalPlayers: koUsers.size,
    koPhaseTeamCount,
  };
}

// Cote du site estimee pour une equipe placee dans une phase, en tenant
// compte de l'arrivee de Mme Claude (elle ajoute +1 au total et au compteur).
function makeKoOddsEstimator(crowd) {
  return (team, phase) => {
    const coef = knockoutCoefficient(phase);
    const phaseMap = crowd.koPhaseTeamCount.get(phase);
    const othersCount = phaseMap?.get(normalizeKey(team))?.size ?? 0;
    const odds = ((crowd.koTotalPlayers + 1) / (othersCount + 1)) * coef;
    return Math.max(1, Math.round(odds * 100) / 100);
  };
}

function simulateGroupStage(matches, scoreByMatchId) {
  const standings = {};

  const getTeam = (group, team) => {
    if (!standings[group]) standings[group] = [];
    let row = standings[group].find((item) => item.team === team);
    if (!row) {
      row = {
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
      standings[group].push(row);
    }
    return row;
  };

  for (const match of matches) {
    if (!String(match.phase).toLowerCase().includes("group")) continue;

    const group = groupKey(match.phase);
    const teamA = getTeam(group, match.team_a);
    const teamB = getTeam(group, match.team_b);
    const [scoreA, scoreB] = scoreByMatchId.get(match.id) ?? [1, 1];

    teamA.played += 1;
    teamB.played += 1;
    teamA.goalsFor += scoreA;
    teamA.goalsAgainst += scoreB;
    teamB.goalsFor += scoreB;
    teamB.goalsAgainst += scoreA;

    if (scoreA > scoreB) {
      teamA.won += 1;
      teamB.lost += 1;
      teamA.points += 3;
    } else if (scoreA < scoreB) {
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
  }

  for (const group of Object.keys(standings)) {
    standings[group].sort((left, right) => {
      if (right.points !== left.points) return right.points - left.points;
      if (right.goalDifference !== left.goalDifference) {
        return right.goalDifference - left.goalDifference;
      }
      if (right.goalsFor !== left.goalsFor) return right.goalsFor - left.goalsFor;
      return left.team.localeCompare(right.team);
    });
  }

  return standings;
}

// Choisit l'equipe qui se qualifie : favori par defaut, value pick credible
// (proba >= 40%) si elle rapporte une meilleure esperance dans la phase suivante.
const KNOCKOUT_PROBABILITY_FLOOR = 0.4;

function pickWinner(teamA, teamB, nextPhase, koOdds) {
  if (!teamA) return teamB;
  if (!teamB) return teamA;

  const pa = advanceProb(teamA, teamB);
  const pb = 1 - pa;

  if (!nextPhase) {
    return pa >= pb ? teamA : teamB;
  }

  const valueA = pa * koOdds(teamA, nextPhase);
  const valueB = pb * koOdds(teamB, nextPhase);
  const eligibleA = pa >= KNOCKOUT_PROBABILITY_FLOOR;
  const eligibleB = pb >= KNOCKOUT_PROBABILITY_FLOOR;

  if (eligibleA && eligibleB) return valueA >= valueB ? teamA : teamB;
  if (eligibleA) return teamA;
  if (eligibleB) return teamB;
  return pa >= pb ? teamA : teamB;
}

function simulateKnockout(groupStandings, koOdds) {
  const bracket = buildBracketEntries(groupStandings);
  const rows = [];
  const winners = new Map();

  for (const match of bracket) {
    const winner = pickWinner(match.teamA, match.teamB, "8e de finale", koOdds);
    winners.set(match.matchKey, winner);
    rows.push({
      match_key: String(match.matchKey),
      round: "16e de finale",
      team_a: match.teamA,
      team_b: match.teamB,
      winner,
    });
  }

  const rounds = [
    { keys: [17, 18, 19, 20, 21, 22, 23, 24], round: "8e de finale", next: "Quarts de finale" },
    { keys: [25, 26, 27, 28], round: "Quarts de finale", next: "Demi-finales" },
    { keys: [29, 30], round: "Demi-finales", next: "Finale" },
    { keys: [31], round: "Finale", next: null },
  ];

  let previousKeys = Array.from({ length: 16 }, (_, index) => index + 1);

  for (const stage of rounds) {
    const nextKeys = [];

    for (let index = 0; index < stage.keys.length; index += 1) {
      const matchKey = stage.keys[index];
      const teamA = winners.get(previousKeys[index * 2]) ?? "";
      const teamB = winners.get(previousKeys[index * 2 + 1]) ?? "";
      const winner = pickWinner(teamA, teamB, stage.next, koOdds);

      winners.set(matchKey, winner);
      nextKeys.push(matchKey);
      rows.push({
        match_key: String(matchKey),
        round: stage.round,
        team_a: teamA,
        team_b: teamB,
        winner,
      });
    }

    previousKeys = nextKeys;
  }

  rows.push({
    match_key: "champion",
    round: "Vainqueur",
    team_a: winners.get(29) ?? "",
    team_b: winners.get(30) ?? "",
    winner: winners.get(31) ?? null,
  });

  rows.push({
    match_key: "top_scorer",
    round: "Meilleur buteur",
    team_a: topScorer,
    team_b: null,
    winner: topScorer,
  });

  return rows;
}

async function main() {
  const userId = await findOrCreateUser();

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    nickname: target.nickname,
    first_name: target.firstName,
    last_name: target.lastName,
    is_admin: false,
    roles: ["player"],
  });

  if (profileError) throw profileError;

  const { error: scoreError } = await supabase.from("user_scores").upsert({
    user_id: userId,
    points: 0,
  });

  if (scoreError) throw scoreError;

  const { data: defaultGroup, error: defaultGroupError } = await supabase
    .from("groups")
    .select("id")
    .eq("name", defaultGroupName)
    .maybeSingle();

  if (defaultGroupError) throw defaultGroupError;

  let groupId = defaultGroup?.id ?? null;

  if (!groupId) {
    const { data: createdGroup, error: createGroupError } = await supabase
      .from("groups")
      .insert({ name: defaultGroupName, created_by: null })
      .select("id")
      .single();

    if (createGroupError || !createdGroup) {
      throw createGroupError ?? new Error("Impossible de créer le groupe par défaut.");
    }

    groupId = createdGroup.id;
  }

  const { error: membershipError } = await supabase.from("group_members").upsert({
    group_id: groupId,
    user_id: userId,
  });

  if (membershipError) throw membershipError;

  const { error: deletePredictionsError } = await supabase
    .from("predictions")
    .delete()
    .eq("user_id", userId);

  if (deletePredictionsError) throw deletePredictionsError;

  const { error: deleteKnockoutError } = await supabase
    .from("knockout_predictions")
    .delete()
    .eq("user_id", userId);

  if (deleteKnockoutError) throw deleteKnockoutError;

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("id, phase, team_a, team_b, kickoff_at")
    .order("id", { ascending: true });

  if (matchesError) throw matchesError;

  const allMatches = matches ?? [];
  const matchById = new Map(allMatches.map((m) => [m.id, m]));

  // Cotes du site (apres suppression des pronos de Mme Claude).
  const crowd = await loadCrowdData(userId, matchById);
  const koOdds = makeKoOddsEstimator(crowd);

  // Optimisation des matchs de groupe : esperance equilibree.
  const groupMatchesAll = allMatches.filter((match) =>
    String(match.phase).toLowerCase().includes("group")
  );

  const scoreByMatchId = new Map();
  for (const match of groupMatchesAll) {
    const odds = crowd.groupOddsByMatch.get(match.id) ?? { one: 1, draw: 1, two: 1 };
    const outcome = chooseGroupOutcome(match.team_a, match.team_b, odds);
    scoreByMatchId.set(match.id, scorelineFor(match.team_a, match.team_b, outcome));
  }

  const now = new Date().getTime();
  const groupPredictions = groupMatchesAll
    .filter((match) => new Date(match.kickoff_at).getTime() > now)
    .map((match) => {
      const [scoreA, scoreB] = scoreByMatchId.get(match.id) ?? [1, 1];
      return {
        user_id: userId,
        match_id: match.id,
        predicted_a: scoreA,
        predicted_b: scoreB,
        updated_at: new Date().toISOString(),
      };
    });

  if (groupPredictions.length > 0) {
    const { error: predictionsError } = await supabase
      .from("predictions")
      .insert(groupPredictions);

    if (predictionsError) throw predictionsError;
  }

  const groupStandings = simulateGroupStage(allMatches, scoreByMatchId);
  const knockoutRows = simulateKnockout(groupStandings, koOdds).map((row) => ({
    user_id: userId,
    match_key: row.match_key,
    round: row.round,
    team_a: row.team_a,
    team_b: row.team_b,
    winner: row.winner,
    updated_at: new Date().toISOString(),
  }));

  const { error: knockoutInsertError } = await supabase
    .from("knockout_predictions")
    .insert(knockoutRows);

  if (knockoutInsertError) throw knockoutInsertError;

  console.log(
    JSON.stringify(
      {
        ok: true,
        userId,
        email: target.email,
        crowd: {
          koTotalPlayers: crowd.koTotalPlayers,
          groupMatchesWithOdds: crowd.groupOddsByMatch.size,
        },
        groupPredictions: groupPredictions.length,
        knockoutPredictions: knockoutRows.length,
        finalists: {
          team_a: knockoutRows.find((r) => r.match_key === "31")?.team_a ?? null,
          team_b: knockoutRows.find((r) => r.match_key === "31")?.team_b ?? null,
          champion: knockoutRows.find((r) => r.match_key === "champion")?.winner ?? null,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
