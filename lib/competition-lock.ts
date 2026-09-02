import type { SupabaseClient } from "@supabase/supabase-js";

// Vrai des que le 1er match de la phase de ligue a reellement debute.
// Utilise pour verrouiller la saisie de tous les pronostics (1er tour,
// classement equipes, qualifies) une fois la competition lancee : au dela de
// ce point, plus aucun pronostic ne doit pouvoir etre modifie.
export async function hasCompetitionStarted(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<boolean> {
  const { data: firstMatch } = await supabase
    .from("matches")
    .select("kickoff_at")
    .eq("phase", "Phase de ligue")
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstMatch?.kickoff_at) return false;

  return new Date(firstMatch.kickoff_at).getTime() <= Date.now();
}