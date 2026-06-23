import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const MME_USER_ID = "2892e9a1-ef23-4011-9107-f9d4fb5e59e9";
const apply = process.argv.includes("--apply");

// --- Modele de force (proxy des cotes externes / probabilites bookmakers) ---
const strengthEntries = [
  ["France", 100],
  ["Brésil", 99],
  ["Espagne", 98],
  ["Angleterre", 97],
  ["Argentine", 96],
  ["Portugal", 95],
  ["Allemagne", 94],
  ["Pays-Bas", 93],
  ["Belgique", 92],
  ["Uruguay", 91],
  ["Croatie", 90],
  ["Colombie", 89],
  ["Suisse", 88],
  ["Japon", 87],
  ["Maroc", 86],
  ["Mexique", 85],
  ["USA", 84],
  ["Canada", 83],
  ["Équateur", 82],
  ["Autriche", 81],
  ["Sénégal", 80],
  ["Norvège", 79],
  ["Corée du Sud", 78],
  ["Suède", 77],
  ["Australie", 77],
  ["Algérie", 76],
  ["Tchéquie", 75],
  ["Afrique du Sud", 74],
  ["Tunisie", 73],
  ["Qatar", 73],
  ["Bosnie-Herzégovine", 72],
  ["Côte d'Ivoire", 71],
  ["Ghana", 70],
  ["Égypte", 69],
  ["Iran", 68],
  ["Nouvelle-Zélande", 67],
  ["Türkiye", 66],
  ["Paraguay", 65],
  ["Arabie Saoudite", 64],
  ["Cabo Verde", 63],
  ["Congo DR", 62],
  ["Ouzbékistan", 61],
  ["Irak", 60],
  ["Haïti", 59],
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

function expectA(teamA, teamB) {
  const diff = ratingOf(teamA) - ratingOf(teamB);
  return 1 / (1 + Math.pow(10, -diff / 400));
}

function groupProbs(teamA, teamB) {
  const e = expectA(teamA, teamB);
  const pDraw = 0.26 * (1 - Math.abs(2 * e - 1));
  return {
    pA: (1 - pDraw) * e,
    pDraw,
    pB: (1 - pDraw) * (1 - e),
  };
}

// --- Cotes du site (basees sur les pronostics des autres joueurs) ---
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

function favoriteOutcome(teamA, teamB) {
  const { pA, pDraw, pB } = groupProbs(teamA, teamB);
  const options = [
    { key: "A", p: pA },
    { key: "D", p: pDraw },
    { key: "B", p: pB },
  ];
  return options.reduce((best, o) => (o.p > best.p ? o : best)).key;
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
  const winning = !favoredA ? winScoreByDiff(absDiff) : [2, 1];
  return [winning[1], winning[0]];
}

function probFor(outcome, probs) {
  if (outcome === "A") return probs.pA;
  if (outcome === "D") return probs.pDraw;
  return probs.pB;
}

function oddsFor(outcome, odds) {
  if (outcome === "A") return odds.one;
  if (outcome === "D") return odds.draw;
  return odds.two;
}

async function main() {
  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("id, phase, team_a, team_b, kickoff_at, is_finished")
    .order("id", { ascending: true });
  if (matchesError) throw matchesError;

  const groupMatches = (matches ?? []).filter((m) =>
    String(m.phase).toLowerCase().includes("group")
  );

  // Cotes du site : distribution des pronos des AUTRES joueurs (exclut Mme Claude).
  const { data: preds, error: predsError } = await supabase
    .from("predictions")
    .select("user_id, match_id, predicted_a, predicted_b");
  if (predsError) throw predsError;

  const countsByMatch = new Map();
  for (const p of preds ?? []) {
    if (p.user_id === MME_USER_ID) continue;
    const rec = countsByMatch.get(p.match_id) ?? { one: 0, draw: 0, two: 0 };
    if (p.predicted_a > p.predicted_b) rec.one += 1;
    else if (p.predicted_a < p.predicted_b) rec.two += 1;
    else rec.draw += 1;
    countsByMatch.set(p.match_id, rec);
  }

  const now = Date.now();
  const rows = [];
  const report = [];
  let evBalanced = 0;
  let evFavorite = 0;
  let valuePicks = 0;
  let lockedSkipped = 0;

  for (const match of groupMatches) {
    if (match.is_finished || new Date(match.kickoff_at).getTime() <= now) {
      lockedSkipped += 1;
      continue;
    }

    const counts = countsByMatch.get(match.id) ?? { one: 0, draw: 0, two: 0 };
    const odds = groupOddsFromCounts(counts);
    const probs = groupProbs(match.team_a, match.team_b);

    const outcome = chooseGroupOutcome(match.team_a, match.team_b, odds);
    const favOutcome = favoriteOutcome(match.team_a, match.team_b);

    evBalanced += probFor(outcome, probs) * oddsFor(outcome, odds);
    evFavorite += probFor(favOutcome, probs) * oddsFor(favOutcome, odds);

    const [scoreA, scoreB] = scorelineFor(match.team_a, match.team_b, outcome);
    rows.push({
      user_id: MME_USER_ID,
      match_id: match.id,
      predicted_a: scoreA,
      predicted_b: scoreB,
      updated_at: new Date().toISOString(),
    });

    const labelFor = (key) =>
      key === "A" ? `${match.team_a}` : key === "B" ? `${match.team_b}` : "Nul";

    if (outcome !== favOutcome) {
      valuePicks += 1;
      report.push(
        `${match.phase} | ${match.team_a} vs ${match.team_b} => ${labelFor(outcome)} ` +
          `(p=${(probFor(outcome, probs) * 100).toFixed(0)}% cote=${oddsFor(outcome, odds)} ` +
          `EV=${(probFor(outcome, probs) * oddsFor(outcome, odds)).toFixed(2)} | ` +
          `favori ${labelFor(favOutcome)} EV=${(probFor(favOutcome, probs) * oddsFor(favOutcome, odds)).toFixed(2)})`
      );
    }
  }

  if (apply && rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("predictions")
      .upsert(rows, { onConflict: "user_id,match_id" });
    if (upsertError) throw upsertError;
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLIQUE" : "SIMULATION (ajoute --apply pour ecrire)",
        groupMatches: groupMatches.length,
        optimisesEcrits: rows.length,
        verrouillesIgnores: lockedSkipped,
        valuePicks,
        evEquilibree: Math.round(evBalanced * 10) / 10,
        evToutFavoris: Math.round(evFavorite * 10) / 10,
        gainEsperance: Math.round((evBalanced - evFavorite) * 10) / 10,
      },
      null,
      2
    )
  );

  if (report.length > 0) {
    console.log("\n=== VALUE PICKS (issue != favori, choisie pour meilleure esperance) ===");
    for (const line of report) console.log("  - " + line);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
