import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeLeaderboardData } from "@/app/dashboard/leaderboard-data";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId");

  let groupMemberIds: Set<string> | null = null;

  const loadLeaderboard = async (useAdminClient: boolean) => {
    let client = supabase;

    if (useAdminClient) {
      try {
        client = createAdminClient();
      } catch {
        client = supabase;
      }
    }

    if (groupId) {
      try {
        const { data: memberships } = await client
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId);

        groupMemberIds = new Set(
          (memberships ?? []).map((row: { user_id: string }) => row.user_id)
        );
      } catch {
        groupMemberIds = null;
      }
    }

    const [{ data: predictions, error: predictionsError }, { data: profiles, error: profilesError }] = await Promise.all([
      client
        .from("predictions")
        .select(`
          user_id,
          match_id,
          predicted_a,
          predicted_b,
          matches (
            phase,
            score_a,
            score_b,
            is_finished
          )
        `),
      client.from("profiles").select("id, nickname"),
    ]);

    return { predictions, profiles, predictionsError, profilesError };
  };

  let leaderboardData = await loadLeaderboard(true);

  if (leaderboardData.predictionsError || leaderboardData.profilesError) {
    leaderboardData = await loadLeaderboard(false);
  }

  const { predictions, profiles, predictionsError, profilesError } = leaderboardData;

  if (predictionsError) {
    return NextResponse.json({ error: predictionsError.message }, { status: 500 });
  }

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const payload = computeLeaderboardData(
    (predictions ?? []) as unknown as Parameters<typeof computeLeaderboardData>[0],
    (profiles ?? []) as unknown as Parameters<typeof computeLeaderboardData>[1],
    groupMemberIds
  );

  return NextResponse.json(payload);
}