import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const groupCitiesPath = path.join(process.cwd(), "app/lib/fifa-group-cities.ts");
const source = fs.readFileSync(groupCitiesPath, "utf8");
const entryPattern = /\[\["([^"]+)", "([^"]+)"\], "([^"]+)"\],?/g;

const rawEntries = [];
for (const match of source.matchAll(entryPattern)) {
  rawEntries.push({
    teamA: match[1],
    teamB: match[2],
    city: match[3],
  });
}

const entriesByPair = new Map();
for (const entry of rawEntries) {
  const key = pairKey(entry.teamA, entry.teamB);
  if (!entriesByPair.has(key)) {
    entriesByPair.set(key, entry);
  }
}

if (!entriesByPair.has(pairKey("Angleterre", "Ghana"))) {
  entriesByPair.set(pairKey("Angleterre", "Ghana"), {
    teamA: "Angleterre",
    teamB: "Ghana",
    city: "Boston",
  });
}

if (!entriesByPair.has(pairKey("Corée du Sud", "Tchéquie"))) {
  entriesByPair.set(pairKey("Corée du Sud", "Tchéquie"), {
    teamA: "Corée du Sud",
    teamB: "Tchéquie",
    city: "Guadalajara",
  });
}

const entries = [...entriesByPair.values()];

if (entries.length === 0) {
  throw new Error("Aucune entree de match de groupe n'a pu etre extraite.");
}

function pairKey(teamA, teamB) {
  return [teamA, teamB].sort((left, right) => left.localeCompare(right)).join("|");
}

function createUnionFind(values) {
  const parent = new Map();
  const rank = new Map();

  for (const value of values) {
    parent.set(value, value);
    rank.set(value, 0);
  }

  function find(value) {
    const currentParent = parent.get(value);
    if (currentParent === value) return value;
    const root = find(currentParent);
    parent.set(value, root);
    return root;
  }

  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;

    const leftRank = rank.get(leftRoot) ?? 0;
    const rightRank = rank.get(rightRoot) ?? 0;

    if (leftRank < rightRank) {
      parent.set(leftRoot, rightRoot);
    } else if (leftRank > rightRank) {
      parent.set(rightRoot, leftRoot);
    } else {
      parent.set(rightRoot, leftRoot);
      rank.set(leftRoot, leftRank + 1);
    }
  }

  return { find, union };
}

const teams = [...new Set(entries.flatMap((entry) => [entry.teamA, entry.teamB]))];
const { find, union } = createUnionFind(teams);

for (const entry of entries) {
  union(entry.teamA, entry.teamB);
}

const components = new Map();
for (const team of teams) {
  const root = find(team);
  if (!components.has(root)) {
    components.set(root, new Set());
  }
  components.get(root).add(team);
}

const knownGroupA = new Set(["Mexique", "Afrique du Sud", "Corée du Sud", "Tchéquie"]);
const groupAComponent = [...components.values()].find((component) => {
  if (component.size !== knownGroupA.size) return false;
  for (const team of knownGroupA) {
    if (!component.has(team)) return false;
  }
  return true;
});

if (!groupAComponent) {
  throw new Error("Impossible d'identifier le groupe A.");
}

const remainingComponents = [...components.values()]
  .filter((component) => component !== groupAComponent)
  .map((component) => [...component].sort((left, right) => left.localeCompare(right)));

remainingComponents.sort((left, right) => left.join("|").localeCompare(right.join("|")));

const labeledComponents = [
  { letter: "A", teams: [...groupAComponent].sort((left, right) => left.localeCompare(right)) },
  ...remainingComponents.map((teams, index) => ({
    letter: String.fromCharCode("B".charCodeAt(0) + index),
    teams,
  })),
];

if (labeledComponents.length !== 12) {
  throw new Error(`Nombre de groupes inattendu : ${labeledComponents.length}`);
}

const componentByTeam = new Map();
for (const group of labeledComponents) {
  for (const team of group.teams) {
    componentByTeam.set(team, group.letter);
  }
}

const matchesByGroup = new Map();
for (const entry of entries) {
  const groupLetter = componentByTeam.get(entry.teamA);
  const groupName = `Groupe ${groupLetter}`;

  if (!matchesByGroup.has(groupName)) {
    matchesByGroup.set(groupName, []);
  }

  matchesByGroup.get(groupName).push(entry);
}

const roundDayOffsets = [0, 7, 14];
const kickoffHours = [6, 9];
const restoredMatches = [];

for (const [groupName, groupEntries] of [...matchesByGroup.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
  const groupIndex = groupName.charCodeAt(groupName.length - 1) - "A".charCodeAt(0);
  const groupDate = new Date(Date.UTC(2026, 5, 11 + groupIndex, 0, 0, 0));
  const groupTeams = labeledComponents.find((group) => group.letter === groupName.slice(-1))?.teams ?? [];

  if (groupTeams.length !== 4) {
    throw new Error(`Groupe inattendu pour ${groupName}`);
  }

  const roundPairs = [
    [
      [groupTeams[0], groupTeams[1]],
      [groupTeams[2], groupTeams[3]],
    ],
    [
      [groupTeams[0], groupTeams[2]],
      [groupTeams[1], groupTeams[3]],
    ],
    [
      [groupTeams[0], groupTeams[3]],
      [groupTeams[1], groupTeams[2]],
    ],
  ];

  const entryByPair = new Map(
    groupEntries.map((entry) => [pairKey(entry.teamA, entry.teamB), entry])
  );

  roundPairs.forEach((round, roundIndex) => {
    round.forEach(([teamA, teamB], slotIndex) => {
      const entry = entryByPair.get(pairKey(teamA, teamB));

      if (!entry) {
        throw new Error(`Match introuvable pour ${teamA} - ${teamB}`);
      }

      const kickoffAt = new Date(groupDate);
      kickoffAt.setUTCDate(kickoffAt.getUTCDate() + roundDayOffsets[roundIndex]);
      kickoffAt.setUTCHours(kickoffHours[slotIndex], 0, 0, 0);

      restoredMatches.push({
        match_number: restoredMatches.length + 1,
        phase: groupName,
        team_a: entry.teamA,
        team_b: entry.teamB,
        kickoff_at: kickoffAt.toISOString(),
        venue: null,
        city: entry.city,
        score_a: null,
        score_b: null,
        is_finished: false,
      });
    });
  });
}

async function main() {
  const { count, error: countError } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true });

  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error(`La table matches contient deja ${count} ligne(s).`);
  }

  const { error: insertError } = await supabase.from("matches").insert(restoredMatches);
  if (insertError) throw insertError;

  console.log(
    JSON.stringify(
      {
        restoredMatches: restoredMatches.length,
        groups: labeledComponents.map((group) => ({
          letter: group.letter,
          teams: group.teams,
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
