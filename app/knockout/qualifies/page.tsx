import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasCompetitionStarted } from "@/lib/competition-lock";
import KnockoutTeamsSelection from "./KnockoutTeamsSelection";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Equipes qualifiees",
};

const TIERS = [
  { key: "huitiemes", groupName: "8emes de finale", label: "8emes", count: 16 },
  { key: "quarts", groupName: "Quarts de finale", label: "Quarts", count: 8 },
  { key: "demi", groupName: "Demi-finales", label: "Demi", count: 4 },
  { key: "finale", groupName: "Finale", label: "Finale", count: 2 },
  { key: "vainqueur", groupName: "Vainqueur", label: "Vainqueur", count: 1 },
];

type GroupPredictionRow = {
  group_name: string;
  team_name: string;
  predicted_position: number;
};

type MatchRow = {
  phase: string;
  team_a: string;
  team_b: string;
};

function collectLeaguePhaseTeams(matches: MatchRow[]) {
  const teams = new Set<string>();
  for (const match of matches) {
    if (match.phase !== "Phase de ligue") continue;
    if (match.team_a) teams.add(match.team_a);
    if (match.team_b) teams.add(match.team_b);
  }
  return Array.from(teams).sort((left, right) => left.localeCompare(right));
}

export default async function KnockoutTeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  // Le pool doit couvrir les 36 equipes possibles de la competition (et non
  // se limiter aux 24 premieres du classement pronostique par le joueur) :
  // n'importe laquelle des 36 peut theoriquement atteindre les 8emes si le
  // classement predit s'avere faux.
  const { data: matches } = await supabase
    .from("matches")
    .select("phase, team_a, team_b");

  const pool = collectLeaguePhaseTeams((matches ?? []) as MatchRow[]);

  const { data: tierRows } = await supabase
    .from("group_predictions")
    .select("group_name, team_name, predicted_position")
    .eq("user_id", user.id)
    .in(
      "group_name",
      TIERS.map((tier) => tier.groupName)
    )
    .order("predicted_position", { ascending: true });

  const initialSelectedByTier: Record<string, string[]> = {};

  for (const tier of TIERS) {
    const rows = ((tierRows ?? []) as GroupPredictionRow[]).filter(
      (row) => row.group_name === tier.groupName
    );
    const selected = rows
      .slice(0, tier.count)
      .map((row) => row.team_name)
      .filter((team) => pool.includes(team));

    initialSelectedByTier[tier.key] = selected;
  }

  const locked = await hasCompetitionStarted(supabase);

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <KnockoutTeamsSelection
          userId={user.id}
          pool={pool}
          initialSelectedByTier={initialSelectedByTier}
          locked={locked}
        />
      </div>
    </main>
  );
}