import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MME_EMAIL = "fabtrash49@gmail.com";

const strengthEntries = [
  ["France", 100], ["Brésil", 99], ["Espagne", 98], ["Angleterre", 97], ["Argentine", 96],
  ["Portugal", 95], ["Allemagne", 94], ["Pays-Bas", 93], ["Belgique", 92], ["Uruguay", 91],
  ["Croatie", 90], ["Colombie", 89], ["Suisse", 88], ["Japon", 87], ["Maroc", 86],
  ["Mexique", 85], ["USA", 84], ["Canada", 83], ["Équateur", 82], ["Autriche", 81],
  ["Senegal", 80], ["Norvège", 79], ["Corée du Sud", 78], ["Suède", 77], ["Australie", 77],
  ["Algerie", 76], ["Tchéquie", 75], ["Afrique du Sud", 74], ["Tunisie", 73], ["Qatar", 73],
  ["Bosnie-Herzégovine", 72], ["Côte d'Ivoire", 71], ["Ghana", 70], ["Égypte", 69], ["Iran", 68],
  ["Nouvelle-Zélande", 67], ["Türkiye", 66], ["Paraguay", 65], ["Arabie Saoudite", 64],
  ["Cabo Verde", 63], ["Congo DR", 62], ["Ouzbékistan", 61], ["Irak", 60], ["Haïti", 59],
  ["Écosse", 58], ["Jordanie", 57], ["Panama", 56], ["Curaçao", 55],
];
const norm = (v) => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const strengthByTeam = new Map(strengthEntries.map(([t, s]) => [norm(t), s]));
const strength = (t) => strengthByTeam.get(norm(t)) ?? 50;
const expectA = (a, b) => 1 / (1 + Math.pow(10, -((strength(a) - strength(b)) * 20) / 400));
function groupProbs(a, b) {
  const e = expectA(a, b);
  const pDraw = 0.26 * (1 - Math.abs(2 * e - 1));
  return { A: (1 - pDraw) * e, D: pDraw, B: (1 - pDraw) * (1 - e) };
}
const koCoef = (p) => {
  const x = p.toLowerCase();
  if (x.includes("16e")) return 2;
  if (x.includes("8e")) return 2;
  if (x.includes("quart")) return 3;
  if (x.includes("demi")) return 3;
  if (x.includes("finale")) return 3;
  return 1;
};

async function main() {
  const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const mme = usersData.users.find((u) => norm(u.email) === norm(MME_EMAIL));
  const mmeId = mme.id;

  const { data: matches } = await supabase
    .from("matches").select("id, phase, team_a, team_b");
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const { data: allPreds } = await supabase
    .from("predictions").select("user_id, match_id, predicted_a, predicted_b");

  // crowd group odds
  const counts = new Map();
  for (const p of allPreds) {
    if (p.user_id === mmeId) continue;
    const m = matchById.get(p.match_id);
    if (!m || !m.phase.toLowerCase().includes("group")) continue;
    const r = counts.get(p.match_id) ?? { one: 0, draw: 0, two: 0 };
    if (p.predicted_a > p.predicted_b) r.one++;
    else if (p.predicted_a < p.predicted_b) r.two++;
    else r.draw++;
    counts.set(p.match_id, r);
  }
  const oddsOf = (mid) => {
    const c = counts.get(mid) ?? { one: 0, draw: 0, two: 0 };
    const total = c.one + c.draw + c.two;
    if (total === 0) return { A: 1, D: 1, B: 1 };
    const f = (n) => Math.max(1, Math.round((total / Math.max(n, 1)) * 100) / 100);
    return { A: f(c.one), D: f(c.draw), B: f(c.two) };
  };

  const mmePreds = allPreds.filter((p) => p.user_id === mmeId);

  // --- Group EV: Mme Claude vs favorites baseline ---
  let evMme = 0, evFav = 0, valuePicks = 0;
  const valueSamples = [];
  const groupCountByPhase = new Map();
  for (const p of mmePreds) {
    const m = matchById.get(p.match_id);
    if (!m || !m.phase.toLowerCase().includes("group")) continue;
    groupCountByPhase.set(m.phase, (groupCountByPhase.get(m.phase) ?? 0) + 1);
    const probs = groupProbs(m.team_a, m.team_b);
    const odds = oddsOf(p.match_id);
    const outcome = p.predicted_a > p.predicted_b ? "A" : p.predicted_a < p.predicted_b ? "B" : "D";
    const favOutcome = ["A", "D", "B"].reduce((best, k) => (probs[k] > probs[best] ? k : best), "A");
    evMme += probs[outcome] * odds[outcome];
    evFav += probs[favOutcome] * odds[favOutcome];
    if (outcome !== favOutcome) {
      valuePicks++;
      if (valueSamples.length < 14) {
        const label = { A: m.team_a + " gagne", D: "nul", B: m.team_b + " gagne" }[outcome];
        valueSamples.push(
          `${m.phase} ${m.team_a} vs ${m.team_b} -> ${label} (p=${(probs[outcome] * 100).toFixed(0)}% cote=${odds[outcome]}, EV=${(probs[outcome] * odds[outcome]).toFixed(2)} vs fav EV=${(probs[favOutcome] * odds[favOutcome]).toFixed(2)})`
        );
      }
    }
  }

  // --- Knockout structure + EV ---
  const { data: ko } = await supabase
    .from("knockout_predictions").select("user_id, match_key, round, team_a, team_b, winner");
  const koCrowd = ko.filter((k) => k.user_id !== mmeId);
  const koTotal = new Set(koCrowd.filter((k) => k.round && k.match_key !== "top_scorer" && k.match_key !== "champion").map((k) => k.user_id)).size;
  const phaseTeam = new Map();
  for (const k of koCrowd) {
    if (!k.round || k.match_key === "top_scorer" || k.match_key === "champion") continue;
    const pm = phaseTeam.get(k.round) ?? new Map();
    for (const t of [k.team_a, k.team_b]) {
      if (!t) continue;
      const s = pm.get(norm(t)) ?? new Set();
      s.add(k.user_id);
      pm.set(norm(t), s);
    }
    phaseTeam.set(k.round, pm);
  }
  const koOdds = (team, phase) => {
    const others = phaseTeam.get(phase)?.get(norm(team))?.size ?? 0;
    return Math.max(1, Math.round(((koTotal + 1) / (others + 1)) * koCoef(phase) * 100) / 100);
  };

  const mmeKo = ko.filter((k) => k.user_id === mmeId);
  const byKey = new Map(mmeKo.map((k) => [k.match_key, k]));
  const show = (key) => {
    const k = byKey.get(key);
    return k ? `${k.team_a} vs ${k.team_b} (gagnant: ${k.winner})` : "(vide)";
  };

  console.log("=== COHERENCE GROUPES ===");
  console.log("Total pronos groupe:", mmePreds.filter((p) => matchById.get(p.match_id)?.phase.toLowerCase().includes("group")).length);
  const badGroups = [...groupCountByPhase.entries()].filter(([, n]) => n !== 6);
  console.log("Groupes != 6 matchs:", badGroups.length ? JSON.stringify(badGroups) : "aucun (OK, 12 x 6)");

  console.log("\n=== VALUE PICKS GROUPE (issue != favori) ===");
  console.log(`Nombre de value picks: ${valuePicks} / ${mmePreds.length}`);
  valueSamples.forEach((s) => console.log("  - " + s));

  console.log("\n=== ESPERANCE PHASE DE GROUPES ===");
  console.log(`EV Mme Claude (equilibre): ${evMme.toFixed(1)} pts`);
  console.log(`EV baseline tout-favoris : ${evFav.toFixed(1)} pts`);
  console.log(`Gain d'esperance         : +${(evMme - evFav).toFixed(1)} pts`);

  console.log("\n=== BRACKET (knockout) ===");
  console.log("8e de finale (16e->8e), quelques gagnants:");
  for (let k = 1; k <= 16; k++) console.log(`  16e #${k}: ${show(String(k))}`);
  console.log("Quarts:");
  for (let k = 17; k <= 24; k++) console.log(`  8e #${k}: ${show(String(k))}`);
  console.log("Demis:");
  for (let k = 25; k <= 28; k++) console.log(`  Quart #${k}: ${show(String(k))}`);
  console.log("Finale:");
  for (let k = 29; k <= 30; k++) console.log(`  Demi #${k}: ${show(String(k))}`);
  console.log(`  Finale #31: ${show("31")}`);
  console.log(`  Champion: ${byKey.get("champion")?.winner}`);
  console.log(`  Meilleur buteur: ${byKey.get("top_scorer")?.winner}`);

  // KO placement EV (sum of odds for each placed team, weighted by a rough reach proba via strength rank is hard;
  // here we report the raw odds Mme Claude stands to earn per phase if her placed teams reach it).
  console.log("\n=== COTES KO ENGRANGEABLES (par equipe placee, si elle atteint la phase) ===");
  const phaseOrder = ["8e de finale", "Quarts de finale", "Demi-finales", "Finale"];
  for (const phase of phaseOrder) {
    const rows = mmeKo.filter((k) => k.round === phase);
    const teams = new Set();
    rows.forEach((r) => { if (r.team_a) teams.add(r.team_a); if (r.team_b) teams.add(r.team_b); });
    const detail = [...teams].map((t) => `${t}:${koOdds(t, phase)}`).join(", ");
    console.log(`  ${phase}: ${detail}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
