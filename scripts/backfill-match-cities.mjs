import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "./.env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE URL or KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

const pairEntries = [
  ["Afrique du Sud", "Corée du Sud", "Monterrey"],
  ["Afrique du Sud", "Tchéquie", "Atlanta"],
  ["Allemagne", "Côte d'Ivoire", "Toronto"],
  ["Allemagne", "Curaçao", "Houston"],
  ["Allemagne", "Équateur", "Toronto"],
  ["Algérie", "Argentine", "Kansas City"],
  ["Algérie", "Autriche", "Kansas City"],
  ["Arabie Saoudite", "Cabo Verde", "Houston"],
  ["Arabie Saoudite", "Espagne", "Atlanta"],
  ["Arabie Saoudite", "Uruguay", "Miami"],
  ["Argentine", "Autriche", "Dallas"],
  ["Argentine", "Jordanie", "Dallas"],
  ["Australie", "Paraguay", "San Francisco Bay Area"],
  ["Australie", "Türkiye", "San Francisco Bay Area"],
  ["Belgique", "Égypte", "Seattle"],
  ["Belgique", "Iran", "Los Angeles"],
  ["Belgique", "Nouvelle-Zélande", "Vancouver"],
  ["Bosnie-Herzégovine", "Canada", "Toronto"],
  ["Bosnie-Herzégovine", "Qatar", "Seattle"],
  ["Bosnie-Herzégovine", "Suisse", "Seattle"],
  ["Brésil", "Écosse", "Boston"],
  ["Brésil", "Haïti", "Philadelphia"],
  ["Brésil", "Maroc", "New Jersey"],
  ["Cabo Verde", "Espagne", "Atlanta"],
  ["Cabo Verde", "Uruguay", "Miami"],
  ["Canada", "Qatar", "Vancouver"],
  ["Canada", "Suisse", "Vancouver"],
  ["Congo DR", "Colombie", "Guadalajara"],
  ["Congo DR", "Ouzbékistan", "Atlanta"],
  ["Corée du Sud", "Mexique", "Guadalajara"],
  ["Côte d'Ivoire", "Curaçao", "Philadelphia"],
  ["Côte d'Ivoire", "Équateur", "Philadelphia"],
  ["Croatie", "Angleterre", "Dallas"],
  ["Croatie", "Ghana", "Philadelphia"],
  ["Curaçao", "Équateur", "Kansas City"],
  ["Égypte", "Iran", "Seattle"],
  ["Égypte", "Nouvelle-Zélande", "Vancouver"],
  ["Écosse", "Haïti", "Boston"],
  ["Écosse", "Maroc", "Boston"],
  ["Espagne", "Cabo Verde", "Atlanta"],
  ["Espagne", "Uruguay", "Miami"],
  ["France", "Irak", "Philadelphia"],
  ["France", "Norvège", "Boston"],
  ["France", "Sénégal", "New Jersey"],
  ["Ghana", "Panama", "Toronto"],
  ["Haïti", "Maroc", "Atlanta"],
  ["Haïti", "Écosse", "Boston"],
  ["Irak", "Norvège", "Boston"],
  ["Irak", "Sénégal", "Toronto"],
  ["Iran", "Nouvelle-Zélande", "Los Angeles"],
  ["Japon", "Pays-Bas", "Dallas"],
  ["Japon", "Suède", "Monterrey"],
  ["Japon", "Tunisie", "Monterrey"],
  ["Jordanie", "Algérie", "San Francisco Bay Area"],
  ["Jordanie", "Autriche", "San Francisco Bay Area"],
  ["Mexique", "Afrique du Sud", "Mexico City"],
  ["Mexique", "Corée du Sud", "Guadalajara"],
  ["Mexique", "Tchéquie", "Mexico City"],
  ["Nouvelle-Zélande", "Iran", "Los Angeles"],
  ["Nouvelle-Zélande", "Égypte", "Vancouver"],
  ["Norvège", "Sénégal", "New Jersey"],
  ["Ouzbékistan", "Colombie", "Guadalajara"],
  ["Ouzbékistan", "Portugal", "Houston"],
  ["Pays-Bas", "Suède", "Houston"],
  ["Pays-Bas", "Tunisie", "Kansas City"],
  ["Panama", "Angleterre", "New Jersey"],
  ["Panama", "Croatie", "Toronto"],
  ["Paraguay", "Australie", "San Francisco Bay Area"],
  ["Paraguay", "USA", "Los Angeles"],
  ["Portugal", "Colombie", "Houston"],
  ["Portugal", "Congo DR", "Houston"],
  ["Portugal", "Ouzbékistan", "Houston"],
  ["Qatar", "Suisse", "San Francisco Bay Area"],
  ["Sénégal", "Norvège", "New Jersey"],
  ["Suède", "Tunisie", "Monterrey"],
  ["Türkiye", "Paraguay", "San Francisco Bay Area"],
  ["Türkiye", "USA", "Los Angeles"],
  ["Tunisie", "Japon", "Monterrey"],
  ["USA", "Australie", "Seattle"],
  ["Uruguay", "Cabo Verde", "Miami"],
  ["Uruguay", "Espagne", "Guadalajara"],
  ["USA", "Paraguay", "Los Angeles"],
  ["Égypte", "Belgique", "Seattle"],
  ["Corée du Sud", "Afrique du Sud", "Monterrey"],
  ["Tchéquie", "Afrique du Sud", "Atlanta"],
  ["Tchéquie", "Corée du Sud", "Guadalajara"],
];

const pairToCity = new Map(
  pairEntries.map(([teamA, teamB, city]) => {
    const key = [teamA, teamB].sort((left, right) => left.localeCompare(right)).join("|");
    return [key, city];
  })
);

function pairKey(teamA, teamB) {
  return [teamA, teamB].sort((left, right) => left.localeCompare(right)).join("|");
}

async function main() {
  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, phase, team_a, team_b, city")
    .ilike("phase", "Groupe%");

  if (error) {
    throw new Error(error.message);
  }

  let updatedCount = 0;

  for (const match of matches ?? []) {
    const city = pairToCity.get(pairKey(match.team_a, match.team_b));

    if (!city || match.city === city) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("matches")
      .update({ city })
      .eq("id", match.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    updatedCount += 1;
  }

  console.log(`Updated ${updatedCount} match cities.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});