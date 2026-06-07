import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Variables Supabase manquantes dans .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from("matches")
    .select("id, phase, team_a, team_b, kickoff_at, score_a, score_b, is_finished, city")
    .order("kickoff_at", { ascending: true });

  if (error) {
    console.error("Erreur lecture matches:", error.message);
    process.exit(1);
  }

  const realScores = (data ?? []).filter(
    (match) => match.score_a !== null || match.score_b !== null || match.is_finished === true
  );

  console.log(
    JSON.stringify(
      {
        count: realScores.length,
        rows: realScores,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});