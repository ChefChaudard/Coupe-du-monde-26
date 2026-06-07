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
const realPhasePrefix = "Reel - ";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { data: realMatches, error: loadError } = await supabase
    .from("matches")
    .select("id, match_number, phase, team_a, team_b, kickoff_at")
    .ilike("phase", `${realPhasePrefix}%`)
    .order("id", { ascending: true });

  if (loadError) {
    throw loadError;
  }

  const realMatchIds = (realMatches ?? []).map((match) => match.id);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          realMatchesCount: realMatches?.length ?? 0,
          sampleRealMatches: (realMatches ?? []).slice(0, 20),
        },
        null,
        2
      )
    );
    return;
  }

  if (realMatchIds.length > 0) {
    const { error: deleteMatchesError } = await supabase
      .from("matches")
      .delete()
      .in("id", realMatchIds);

    if (deleteMatchesError) {
      throw deleteMatchesError;
    }
  }

  console.log(
    JSON.stringify(
      {
        deletedMatches: realMatches?.length ?? 0,
        deletedKnockoutPredictions: 0,
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