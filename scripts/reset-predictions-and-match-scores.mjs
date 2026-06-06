import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const [
    { count: predictionsCount, error: predictionsCountError },
    { count: knockoutPredictionsCount, error: knockoutPredictionsError },
    { count: matchesCount, error: matchesCountError },
  ] =
    await Promise.all([
      supabase.from("predictions").select("match_id", { count: "exact", head: true }),
      supabase.from("knockout_predictions").select("match_key", { count: "exact", head: true }),
      supabase.from("matches").select("id", { count: "exact", head: true }),
    ]);

  if (predictionsCountError) throw predictionsCountError;
  if (knockoutPredictionsError) throw knockoutPredictionsError;
  if (matchesCountError) throw matchesCountError;

  const { error: deletePredictionsError } = await supabase.from("predictions").delete().neq("match_id", -1);

  if (deletePredictionsError) throw deletePredictionsError;

  const { error: deleteKnockoutPredictionsError } = await supabase
    .from("knockout_predictions")
    .delete()
    .neq("match_key", "-1");

  if (deleteKnockoutPredictionsError) throw deleteKnockoutPredictionsError;

  const { data: matchRows, error: loadMatchesError } = await supabase
    .from("matches")
    .select("id, match_number, phase, team_a, team_b, kickoff_at, venue, city")
    .order("id", { ascending: true });

  if (loadMatchesError) throw loadMatchesError;

  const { error: deleteMatchesError } = await supabase.from("matches").delete().neq("id", -1);

  if (deleteMatchesError) throw deleteMatchesError;

  if ((matchRows ?? []).length > 0) {
    const rebuiltMatches = (matchRows ?? []).map((match) => ({
      match_number: match.match_number ?? null,
      phase: match.phase,
      team_a: match.team_a,
      team_b: match.team_b,
      kickoff_at: match.kickoff_at,
      venue: match.venue ?? null,
      city: match.city ?? null,
      score_a: null,
      score_b: null,
      is_finished: false,
    }));

    const { error: insertMatchesError } = await supabase.from("matches").insert(rebuiltMatches);

    if (insertMatchesError) throw insertMatchesError;
  }

  console.log(
    JSON.stringify(
      {
        deletedPredictions: predictionsCount ?? 0,
        deletedKnockoutPredictions: knockoutPredictionsCount ?? 0,
        resetMatches: matchesCount ?? 0,
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