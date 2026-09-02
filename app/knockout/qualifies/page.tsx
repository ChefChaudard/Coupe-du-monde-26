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

const LEAGUE_GROUP_NAME = "Phase de ligue";
const POOL_SIZE = 24;

const TIERS = [
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

export default async function KnockoutTeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  const { data: rankingRows } = await supabase
    .from("group_predictions")
    .select("group_name, team_name, predicted_position")
    .eq("user_id", user.id)
    .eq("group_name", LEAGUE_GROUP_NAME)
    .order("predicted_position", { ascending: true });

  const pool = ((rankingRows ?? []) as GroupPredictionRow[])
    .slice(0, POOL_SIZE)
    .map((row) => row.team_name);

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