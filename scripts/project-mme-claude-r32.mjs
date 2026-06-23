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

// --- Modele de force (proxy cotes externes) ---
const strengthEntries = [
  ["France", 100], ["Brésil", 99], ["Espagne", 98], ["Angleterre", 97],
  ["Argentine", 96], ["Portugal", 95], ["Allemagne", 94], ["Pays-Bas", 93],
  ["Belgique", 92], ["Uruguay", 91], ["Croatie", 90], ["Colombie", 89],
  ["Suisse", 88], ["Japon", 87], ["Maroc", 86], ["Mexique", 85],
  ["USA", 84], ["Canada", 83], ["Équateur", 82], ["Autriche", 81],
  ["Sénégal", 80], ["Norvège", 79], ["Corée du Sud", 78], ["Suède", 77],
  ["Australie", 77], ["Algérie", 76], ["Tchéquie", 75], ["Afrique du Sud", 74],
  ["Tunisie", 73], ["Qatar", 73], ["Bosnie-Herzégovine", 72], ["Côte d'Ivoire", 71],
  ["Ghana", 70], ["Égypte", 69], ["Iran", 68], ["Nouvelle-Zélande", 67],
  ["Türkiye", 66], ["Paraguay", 65], ["Arabie Saoudite", 64], ["Cabo Verde", 63],
  ["Congo DR", 62], ["Ouzbékistan", 61], ["Irak", 60], ["Haïti", 59],
  ["Écosse", 58], ["Jordanie", 57], ["Panama", 56], ["Curaçao", 55],
];

function normalizeKey(value) {
  return String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
const strengthByTeam = new Map(strengthEntries.map(([t, s]) => [normalizeKey(t), s]));
const teamStrength = (team) => strengthByTeam.get(normalizeKey(team)) ?? 50;
const ratingOf = (team) => teamStrength(team) * 20;
function expectA(a, b) {
  return 1 / (1 + Math.pow(10, -(ratingOf(a) - ratingOf(b)) / 400));
}
const advanceProb = (a, b) => expectA(a, b);

function knockoutCoefficient(phase) {
  const p = String(phase).toLowerCase();
  if (p.includes("16e")) return 2;
  if (p.includes("8e")) return 2;
  if (p.includes("quart")) return 3;
  if (p.includes("demi")) return 3;
  if (p.includes("finale")) return 3;
  return 1;
}

const groupKey = (phase) => String(phase).replace(/^Groupe\s+/i, "").trim();

// --- Classement des groupes (regles FIFA: pts > diff > BP > alpha pour deterministe) ---
function simulateGroupStage(groupMatches, scoreByMatchId) {
  const standings = {};
  const getTeam = (group, team) => {
    if (!standings[group]) standings[group] = [];
    let row = standings[group].find((r) => r.team === team);
    if (!row) {
      row = { team, group, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
      standings[group].push(row);
    }
    return row;
  };

  for (const match of groupMatches) {
    const group = groupKey(match.phase);
    const a = getTeam(group, match.team_a);
    const b = getTeam(group, match.team_b);
    const [sa, sb] = scoreByMatchId.get(match.id) ?? [1, 1];
    a.played += 1; b.played += 1;
    a.gf += sa; a.ga += sb; b.gf += sb; b.ga += sa;
    if (sa > sb) { a.won += 1; b.lost += 1; a.points += 3; }
    else if (sa < sb) { b.won += 1; a.lost += 1; b.points += 3; }
    else { a.drawn += 1; b.drawn += 1; a.points += 1; b.points += 1; }
    a.gd = a.gf - a.ga; b.gd = b.gf - b.ga;
  }

  for (const group of Object.keys(standings)) {
    standings[group].sort(rankCompare);
  }
  return standings;
}

function rankCompare(left, right) {
  if (right.points !== left.points) return right.points - left.points;
  if (right.gd !== left.gd) return right.gd - left.gd;
  if (right.gf !== left.gf) return right.gf - left.gf;
  return left.team.localeCompare(right.team);
}

// Classement des 3es entre groupes : pts > diff > BP > lettre de groupe.
function rankThirds(thirds) {
  return thirds.slice().sort((l, r) => {
    if (r.points !== l.points) return r.points - l.points;
    if (r.gd !== l.gd) return r.gd - l.gd;
    if (r.gf !== l.gf) return r.gf - l.gf;
    return l.group.localeCompare(r.group);
  });
}

// --- Tableau officiel R32 (ordre = arbre, mappe sur match_key 1-16 de l'app) ---
// a/b : {k:'W'|'R', g:'X'} (1er/2e du groupe) ou {k:'3', allowed:[...]}
const officialBracket = [
  { mk: 1, label: "M74", a: { k: "W", g: "E" }, b: { k: "3", allowed: ["A", "B", "C", "D", "F"] } },
  { mk: 2, label: "M77", a: { k: "W", g: "I" }, b: { k: "3", allowed: ["C", "D", "F", "G", "H"] } },
  { mk: 3, label: "M73", a: { k: "R", g: "A" }, b: { k: "R", g: "B" } },
  { mk: 4, label: "M75", a: { k: "W", g: "F" }, b: { k: "R", g: "C" } },
  { mk: 5, label: "M83", a: { k: "R", g: "K" }, b: { k: "R", g: "L" } },
  { mk: 6, label: "M84", a: { k: "W", g: "H" }, b: { k: "R", g: "J" } },
  { mk: 7, label: "M81", a: { k: "W", g: "D" }, b: { k: "3", allowed: ["B", "E", "F", "I", "J"] } },
  { mk: 8, label: "M82", a: { k: "W", g: "G" }, b: { k: "3", allowed: ["A", "E", "H", "I", "J"] } },
  { mk: 9, label: "M76", a: { k: "W", g: "C" }, b: { k: "R", g: "F" } },
  { mk: 10, label: "M78", a: { k: "R", g: "E" }, b: { k: "R", g: "I" } },
  { mk: 11, label: "M79", a: { k: "W", g: "A" }, b: { k: "3", allowed: ["C", "E", "F", "H", "I"] } },
  { mk: 12, label: "M80", a: { k: "W", g: "L" }, b: { k: "3", allowed: ["E", "H", "I", "J", "K"] } },
  { mk: 13, label: "M86", a: { k: "W", g: "J" }, b: { k: "R", g: "H" } },
  { mk: 14, label: "M88", a: { k: "R", g: "D" }, b: { k: "R", g: "G" } },
  { mk: 15, label: "M85", a: { k: "W", g: "B" }, b: { k: "3", allowed: ["E", "F", "G", "I", "J"] } },
  { mk: 16, label: "M87", a: { k: "W", g: "K" }, b: { k: "3", allowed: ["D", "E", "I", "J", "L"] } },
];

// Affecte les 8 groupes qualifies (3es) aux 8 slots (sets officiels), plus
// contraint d'abord. Retourne Map(slotIndex -> groupe) ou null si impossible.
function assignThirds(qualifiedGroups) {
  const slots = [];
  officialBracket.forEach((m, idx) => {
    if (m.b.k === "3") slots.push({ idx, allowed: m.b.allowed });
  });

  const assignment = new Map();
  const used = new Set();

  const solve = () => {
    const remaining = slots.filter((s) => !assignment.has(s.idx));
    if (remaining.length === 0) return true;
    remaining.sort((a, b) => {
      const ca = a.allowed.filter((g) => qualifiedGroups.includes(g) && !used.has(g)).length;
      const cb = b.allowed.filter((g) => qualifiedGroups.includes(g) && !used.has(g)).length;
      return ca - cb;
    });
    const slot = remaining[0];
    const candidates = slot.allowed.filter((g) => qualifiedGroups.includes(g) && !used.has(g));
    for (const g of candidates) {
      assignment.set(slot.idx, g);
      used.add(g);
      if (solve()) return true;
      assignment.delete(slot.idx);
      used.delete(g);
    }
    return false;
  };

  return solve() ? assignment : null;
}

// --- Cotes du site KO (autres joueurs) ---
async function loadKoCrowd() {
  const { data: ko, error } = await supabase
    .from("knockout_predictions")
    .select("user_id, match_key, round, team_a, team_b");
  if (error) throw error;

  const koUsers = new Set();
  const koPhaseTeamCount = new Map();
  for (const k of ko ?? []) {
    if (k.user_id === MME_USER_ID) continue;
    if (!k.round || k.match_key === "top_scorer" || k.match_key === "champion") continue;
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
  return { koTotalPlayers: koUsers.size, koPhaseTeamCount };
}

function makeKoOdds(crowd) {
  return (team, phase) => {
    const coef = knockoutCoefficient(phase);
    const phaseMap = crowd.koPhaseTeamCount.get(phase);
    const others = phaseMap?.get(normalizeKey(team))?.size ?? 0;
    const odds = ((crowd.koTotalPlayers + 1) / (others + 1)) * coef;
    return Math.max(1, Math.round(odds * 100) / 100);
  };
}

// Vainqueur d'un match KO : favori par defaut, upset si proba>=40% ET meilleure EV.
const KO_PROB_FLOOR = 0.4;
function pickWinner(a, b, nextPhase, koOdds) {
  if (!a) return b;
  if (!b) return a;
  const pa = advanceProb(a, b);
  const pb = 1 - pa;
  if (!nextPhase) return pa >= pb ? a : b;
  const va = pa * koOdds(a, nextPhase);
  const vb = pb * koOdds(b, nextPhase);
  const ea = pa >= KO_PROB_FLOOR;
  const eb = pb >= KO_PROB_FLOOR;
  if (ea && eb) return va >= vb ? a : b;
  if (ea) return a;
  if (eb) return b;
  return pa >= pb ? a : b;
}

async function main() {
  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("id, phase, team_a, team_b")
    .order("id", { ascending: true });
  if (matchesError) throw matchesError;

  const groupMatches = (matches ?? []).filter((m) =>
    String(m.phase).toLowerCase().includes("group")
  );

  const { data: preds, error: predsError } = await supabase
    .from("predictions")
    .select("match_id, predicted_a, predicted_b")
    .eq("user_id", MME_USER_ID);
  if (predsError) throw predsError;

  const scoreByMatchId = new Map();
  for (const p of preds ?? []) scoreByMatchId.set(p.match_id, [p.predicted_a, p.predicted_b]);

  const standings = simulateGroupStage(groupMatches, scoreByMatchId);
  const groups = Object.keys(standings).sort();

  const winners = {};
  const runners = {};
  const thirds = [];
  for (const g of groups) {
    const rows = standings[g];
    winners[g] = rows[0]?.team ?? "";
    runners[g] = rows[1]?.team ?? "";
    if (rows[2]) thirds.push(rows[2]);
  }

  const rankedThirds = rankThirds(thirds);
  const best8 = rankedThirds.slice(0, 8);
  const qualifiedThirdGroups = best8.map((t) => t.group);
  const thirdTeamByGroup = new Map(best8.map((t) => [t.group, t.team]));

  const assignment = assignThirds(qualifiedThirdGroups);
  if (!assignment) {
    throw new Error("Aucune affectation valide des 3es (sets officiels). Groupes: " + qualifiedThirdGroups.join(","));
  }

  const resolveSlot = (slot, mk) => {
    if (slot.k === "W") return winners[slot.g];
    if (slot.k === "R") return runners[slot.g];
    const idx = mk - 1;
    const group = assignment.get(idx);
    return thirdTeamByGroup.get(group);
  };

  const r32 = officialBracket.map((m) => ({
    mk: m.mk,
    label: m.label,
    teamA: resolveSlot(m.a, m.mk),
    teamB: resolveSlot(m.b, m.mk),
  }));

  // Propagation des vainqueurs via EV (cotes KO du site).
  const crowd = await loadKoCrowd();
  const koOdds = makeKoOdds(crowd);

  const rows = [];
  const winnersByKey = new Map();

  for (const m of r32) {
    const w = pickWinner(m.teamA, m.teamB, "8e de finale", koOdds);
    winnersByKey.set(m.mk, w);
    rows.push({ match_key: String(m.mk), round: "16e de finale", team_a: m.teamA, team_b: m.teamB, winner: w });
  }

  const laterRounds = [
    { keys: [17, 18, 19, 20, 21, 22, 23, 24], round: "8e de finale", next: "Quarts de finale" },
    { keys: [25, 26, 27, 28], round: "Quarts de finale", next: "Demi-finales" },
    { keys: [29, 30], round: "Demi-finales", next: "Finale" },
    { keys: [31], round: "Finale", next: null },
  ];

  let previousKeys = Array.from({ length: 16 }, (_, i) => i + 1);
  for (const stage of laterRounds) {
    const nextKeys = [];
    for (let i = 0; i < stage.keys.length; i += 1) {
      const mk = stage.keys[i];
      const teamA = winnersByKey.get(previousKeys[i * 2]) ?? "";
      const teamB = winnersByKey.get(previousKeys[i * 2 + 1]) ?? "";
      const w = pickWinner(teamA, teamB, stage.next, koOdds);
      winnersByKey.set(mk, w);
      nextKeys.push(mk);
      rows.push({ match_key: String(mk), round: stage.round, team_a: teamA, team_b: teamB, winner: w });
    }
    previousKeys = nextKeys;
  }

  rows.push({
    match_key: "champion",
    round: "Vainqueur",
    team_a: winnersByKey.get(29) ?? "",
    team_b: winnersByKey.get(30) ?? "",
    winner: winnersByKey.get(31) ?? null,
  });
  // top_scorer : preserve l'existant (Kylian Mbappe), non rescore par cote.
  rows.push({
    match_key: "top_scorer",
    round: "Meilleur buteur",
    team_a: "Kylian Mbappe",
    team_b: null,
    winner: "Kylian Mbappe",
  });

  // --- Rapport ---
  console.log(JSON.stringify({ mode: apply ? "APPLIQUE" : "SIMULATION (ajoute --apply pour ecrire)" }, null, 2));
  console.log("\n=== CLASSEMENT DES GROUPES (projection Mme Claude) ===");
  for (const g of groups) {
    const r = standings[g];
    console.log(`Groupe ${g}: 1.${r[0].team}(${r[0].points}pts ${r[0].gd >= 0 ? "+" : ""}${r[0].gd})  2.${r[1].team}(${r[1].points} ${r[1].gd >= 0 ? "+" : ""}${r[1].gd})  3.${r[2].team}(${r[2].points} ${r[2].gd >= 0 ? "+" : ""}${r[2].gd})  [4.${r[3].team}]`);
  }
  console.log("\n=== CLASSEMENT DES 12 TROISIEMES (8 meilleurs qualifies) ===");
  rankedThirds.forEach((t, i) => {
    console.log(`${i < 8 ? "QUALIFIE " : "ELIMINE  "}${i + 1}. ${t.team} (Groupe ${t.group}) ${t.points}pts diff ${t.gd >= 0 ? "+" : ""}${t.gd} BP ${t.gf}`);
  });

  console.log("\n=== 16es DE FINALE projetes (match_key 1-16) ===");
  for (const m of r32.slice().sort((a, b) => a.mk - b.mk)) {
    console.log(`mk${m.mk} [${m.label}] ${m.teamA} vs ${m.teamB}`);
  }

  const qualifiedSet = new Set();
  for (const m of r32) { qualifiedSet.add(m.teamA); qualifiedSet.add(m.teamB); }
  console.log(`\n32 equipes en 16es: ${qualifiedSet.size} distinctes (doit etre 32).`);
  console.log("Finale projetee:", rows.find((r) => r.match_key === "31")?.team_a, "vs", rows.find((r) => r.match_key === "31")?.team_b, "=> champion", winnersByKey.get(31));

  if (apply) {
    const upsertRows = rows.map((r) => ({
      user_id: MME_USER_ID,
      match_key: r.match_key,
      round: r.round,
      team_a: r.team_a,
      team_b: r.team_b,
      winner: r.winner,
      updated_at: new Date().toISOString(),
    }));
    const { error: upsertError } = await supabase
      .from("knockout_predictions")
      .upsert(upsertRows, { onConflict: "user_id,match_key" });
    if (upsertError) throw upsertError;
    console.log(`\nEcrit ${upsertRows.length} rows knockout_predictions.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
